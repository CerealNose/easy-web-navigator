import { useState, useCallback } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface WanVideoResult {
  videoUrl: string;
  seed: number;
}

interface HistoryOutput {
  videos?: Array<{ filename: string; subfolder: string; type: string }>;
  gifs?: Array<{ filename: string; subfolder: string; type: string }>;
}

interface HistoryItem {
  outputs: Record<string, HistoryOutput>;
  status?: { completed: boolean };
}

// WAN 2.1 Image-to-Video workflow for ComfyUI
// This uses the official Comfy-Org native workflow structure
const createWanI2VWorkflow = (
  uploadedImageName: string,
  prompt: string,
  seed: number,
  width: number = 832,
  height: number = 480,
  frames: number = 81, // ~5 seconds at 16fps
  steps: number = 20,
  cfgScale: number = 5.0,
  diffusionModel: string = "wan2.1_i2v_480p_14B_fp8_scaled.safetensors"
) => {
  return {
    // Load the diffusion model
    "1": {
      inputs: {
        unet_name: diffusionModel
      },
      class_type: "UNETLoader",
      _meta: { title: "Load Diffusion Model" }
    },
    // Load VAE
    "2": {
      inputs: {
        vae_name: "wan_2.1_vae.safetensors"
      },
      class_type: "VAELoader",
      _meta: { title: "Load VAE" }
    },
    // Load CLIP Vision for image conditioning
    "3": {
      inputs: {
        clip_name: "clip_vision_h.safetensors"
      },
      class_type: "CLIPVisionLoader",
      _meta: { title: "Load CLIP Vision" }
    },
    // Load text encoder (CLIP)
    "4": {
      inputs: {
        clip_name: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
        type: "wan"
      },
      class_type: "CLIPLoader",
      _meta: { title: "Load CLIP" }
    },
    // Load input image
    "5": {
      inputs: {
        image: uploadedImageName
      },
      class_type: "LoadImage",
      _meta: { title: "Load Image" }
    },
    // Encode image with CLIP Vision
    "6": {
      inputs: {
        clip_vision: ["3", 0],
        image: ["5", 0]
      },
      class_type: "CLIPVisionEncode",
      _meta: { title: "CLIP Vision Encode" }
    },
    // Encode positive prompt
    "7": {
      inputs: {
        text: prompt,
        clip: ["4", 0]
      },
      class_type: "CLIPTextEncode",
      _meta: { title: "CLIP Text Encode (Positive)" }
    },
    // Encode negative prompt
    "8": {
      inputs: {
        text: "blurry, low quality, distorted, static, frozen, bad anatomy, watermark",
        clip: ["4", 0]
      },
      class_type: "CLIPTextEncode",
      _meta: { title: "CLIP Text Encode (Negative)" }
    },
    // WanImageToVideo - creates latent and applies image conditioning
    "9": {
      inputs: {
        width: width,
        height: height,
        length: frames,
        batch_size: 1,
        clip_vision_output: ["6", 0],
        start_image: ["5", 0]
      },
      class_type: "WanImageToVideo",
      _meta: { title: "Wan Image To Video" }
    },
    // KSampler
    "10": {
      inputs: {
        seed: seed,
        steps: steps,
        cfg: cfgScale,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1.0,
        model: ["1", 0],
        positive: ["7", 0],
        negative: ["8", 0],
        latent_image: ["9", 0]
      },
      class_type: "KSampler",
      _meta: { title: "KSampler" }
    },
    // VAE Decode
    "11": {
      inputs: {
        samples: ["10", 0],
        vae: ["2", 0]
      },
      class_type: "VAEDecode",
      _meta: { title: "VAE Decode" }
    },
    // Save video using VHS
    "12": {
      inputs: {
        frame_rate: 16,
        loop_count: 0,
        filename_prefix: "WAN_Video",
        format: "video/h264-mp4",
        pingpong: false,
        save_output: true,
        images: ["11", 0]
      },
      class_type: "VHS_VideoCombine",
      _meta: { title: "Video Combine" }
    }
  };
};

// Helper to call ComfyUI proxy
const callComfyUIProxy = async (
  baseUrl: string,
  action: string,
  payload: Record<string, unknown> = {}
) => {
  const { data, error } = await supabase.functions.invoke("comfyui-proxy", {
    body: { comfyUrl: baseUrl, action, payload },
  });
  if (error) throw error;
  return data;
};

export function useWanVideo() {
  const { comfyUIConfig, isComfyUIConnected } = useSettings();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");

  // Upload image to ComfyUI
  const uploadImage = useCallback(async (imageDataUrl: string, filename: string): Promise<string> => {
    // Send full data URL - the edge function will strip the prefix
    const response = await callComfyUIProxy(comfyUIConfig.baseUrl, "upload_image", {
      imageData: imageDataUrl,
      filename,
    });
    return response.name || filename;
  }, [comfyUIConfig.baseUrl]);

  // Queue a workflow prompt
  const queuePrompt = useCallback(async (workflow: Record<string, object>): Promise<string> => {
    const response = await callComfyUIProxy(comfyUIConfig.baseUrl, "queue_prompt", {
      prompt: workflow,
    });
    return response.prompt_id;
  }, [comfyUIConfig.baseUrl]);

  // Poll for completion
  const pollForCompletion = useCallback(async (
    promptId: string,
    maxWaitMs: number = 600000 // 10 minutes
  ): Promise<HistoryItem | null> => {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < maxWaitMs) {
      try {
        // Check queue first
        const queueData = await callComfyUIProxy(comfyUIConfig.baseUrl, "get_queue", {});
        const runningCount = queueData?.queue_running?.length || 0;
        const pendingCount = queueData?.queue_pending?.length || 0;

        if (runningCount > 0) {
          setProgressMessage(`Generating video... (${pendingCount} in queue)`);
        }

        // Check history for completion
        const historyData = await callComfyUIProxy(comfyUIConfig.baseUrl, "get_history", {
          prompt_id: promptId,
        });

        if (historyData && historyData[promptId]) {
          const historyItem = historyData[promptId] as HistoryItem;
          if (historyItem.status?.completed || Object.keys(historyItem.outputs || {}).length > 0) {
            return historyItem;
          }
        }

        await new Promise((r) => setTimeout(r, pollInterval));
        setProgress((prev) => Math.min(prev + 2, 90));
      } catch (err) {
        console.warn("Poll error:", err);
        await new Promise((r) => setTimeout(r, pollInterval));
      }
    }

    throw new Error("Video generation timed out");
  }, [comfyUIConfig.baseUrl]);

  // Extract video from history
  const extractVideoFromHistory = useCallback(async (history: HistoryItem): Promise<string | null> => {
    for (const nodeId of Object.keys(history.outputs)) {
      const output = history.outputs[nodeId];
      
      // Check for videos
      if (output.videos && output.videos.length > 0) {
        const video = output.videos[0];
        const videoData = await callComfyUIProxy(comfyUIConfig.baseUrl, "get_video", {
          filename: video.filename,
          subfolder: video.subfolder || "",
          type: video.type || "output",
        });
        if (videoData?.videoData) {
          return `data:video/mp4;base64,${videoData.videoData}`;
        }
      }
      
      // Check for gifs
      if (output.gifs && output.gifs.length > 0) {
        const gif = output.gifs[0];
        const gifData = await callComfyUIProxy(comfyUIConfig.baseUrl, "get_video", {
          filename: gif.filename,
          subfolder: gif.subfolder || "",
          type: gif.type || "output",
        });
        if (gifData?.videoData) {
          return `data:video/mp4;base64,${gifData.videoData}`;
        }
      }
    }
    return null;
  }, [comfyUIConfig.baseUrl]);

  // Main generate video function
  const generateVideo = useCallback(async (
    imageDataUrl: string,
    prompt: string,
    options: {
      seed?: number;
      width?: number;
      height?: number;
      duration?: number; // in seconds
      steps?: number;
      cfgScale?: number;
      diffusionModel?: string;
    } = {}
  ): Promise<WanVideoResult | null> => {
    if (!isComfyUIConnected) {
      toast.error("ComfyUI is not connected");
      return null;
    }

    setIsGenerating(true);
    setProgress(0);
    setProgressMessage("Preparing...");

    try {
      const seed = options.seed ?? Math.floor(Math.random() * 2147483647);
      const width = options.width ?? 832;
      const height = options.height ?? 480;
      const duration = options.duration ?? 5;
      const frames = Math.round(duration * 16); // 16fps
      const steps = options.steps ?? 20;
      const cfgScale = options.cfgScale ?? 5.0;
      const diffusionModel = options.diffusionModel ?? "wan2.1_i2v_480p_14B_fp8_scaled.safetensors";

      // Upload image
      setProgressMessage("Uploading image...");
      setProgress(5);
      const uploadedName = await uploadImage(imageDataUrl, `wan_input_${Date.now()}.png`);

      // Create workflow
      setProgressMessage("Creating workflow...");
      setProgress(10);
      const workflow = createWanI2VWorkflow(
        uploadedName,
        prompt,
        seed,
        width,
        height,
        frames,
        steps,
        cfgScale,
        diffusionModel
      );

      // Queue prompt
      setProgressMessage("Queueing generation...");
      setProgress(15);
      const promptId = await queuePrompt(workflow);

      // Poll for completion
      setProgressMessage("Generating video...");
      const history = await pollForCompletion(promptId);

      if (!history) {
        throw new Error("No history returned");
      }

      // Extract video
      setProgressMessage("Extracting video...");
      setProgress(95);
      const videoUrl = await extractVideoFromHistory(history);

      if (!videoUrl) {
        throw new Error("No video in output");
      }

      setProgress(100);
      setProgressMessage("Complete!");

      return { videoUrl, seed };
    } catch (err) {
      console.error("WAN video generation error:", err);
      toast.error(`Video generation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [isComfyUIConnected, uploadImage, queuePrompt, pollForCompletion, extractVideoFromHistory]);

  return {
    generateVideo,
    isGenerating,
    progress,
    progressMessage,
  };
}
