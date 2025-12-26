import { useState, useCallback } from "react";
import { useSettings, VideoSettings } from "@/contexts/SettingsContext";
import { supabase } from "@/integrations/supabase/client";

interface ComfyUIWorkflowResult {
  imageUrl: string;
  seed: number;
}

interface ComfyUIVideoResult {
  videoUrl: string;
  seed: number;
}

interface HistoryOutput {
  images?: Array<{ filename: string; subfolder: string; type: string }>;
  gifs?: Array<{ filename: string; subfolder: string; type: string }>;
  videos?: Array<{ filename: string; subfolder: string; type: string; format?: string }>;
}

interface HistoryStatus {
  status_str: string;
  completed: boolean;
  messages?: Array<[string, Record<string, unknown>]>;
}

interface HistoryItem {
  outputs: Record<string, HistoryOutput>;
  status?: HistoryStatus;
}

// Default workflow using standard CheckpointLoaderSimple (works with any checkpoint: SD1.5, SDXL, FLUX, etc.)
const createStandardWorkflow = (prompt: string, seed: number, width: number = 1280, height: number = 720) => ({
  "3": {
    "inputs": {
      "seed": seed,
      "steps": 20,
      "cfg": 7,
      "sampler_name": "euler",
      "scheduler": "normal",
      "denoise": 1,
      "model": ["4", 0],
      "positive": ["6", 0],
      "negative": ["7", 0],
      "latent_image": ["5", 0]
    },
    "class_type": "KSampler",
    "_meta": { "title": "KSampler" }
  },
  "4": {
    "inputs": {
      "ckpt_name": "sd_xl_base_1.0.safetensors"
    },
    "class_type": "CheckpointLoaderSimple",
    "_meta": { "title": "Load Checkpoint" }
  },
  "5": {
    "inputs": {
      "width": width,
      "height": height,
      "batch_size": 1
    },
    "class_type": "EmptyLatentImage",
    "_meta": { "title": "Empty Latent Image" }
  },
  "6": {
    "inputs": {
      "text": prompt,
      "clip": ["4", 1]
    },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "CLIP Text Encode (Positive)" }
  },
  "7": {
    "inputs": {
      "text": "blurry, low quality, distorted, ugly, bad anatomy",
      "clip": ["4", 1]
    },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "CLIP Text Encode (Negative)" }
  },
  "8": {
    "inputs": {
      "samples": ["3", 0],
      "vae": ["4", 2]
    },
    "class_type": "VAEDecode",
    "_meta": { "title": "VAE Decode" }
  },
  "9": {
    "inputs": {
      "filename_prefix": "ComfyUI",
      "images": ["8", 0]
    },
    "class_type": "SaveImage",
    "_meta": { "title": "Save Image" }
  }
});

// Create workflow with a specific checkpoint name
const createWorkflowWithCheckpoint = (
  prompt: string, 
  seed: number, 
  width: number, 
  height: number,
  checkpointName: string
) => {
  const workflow = createStandardWorkflow(prompt, seed, width, height);
  workflow["4"].inputs.ckpt_name = checkpointName;
  return workflow;
};

// AnimateDiff Image-to-Video workflow for local video generation
// This requires AnimateDiff custom nodes installed in ComfyUI
// If VHS is not installed, it outputs frames that are combined client-side
const createAnimateDiffI2VWorkflow = (
  uploadedImageName: string,  // filename of uploaded image in ComfyUI
  motionPrompt: string,
  seed: number,
  hasVHS: boolean = false,
  checkpointName: string = "dreamshaperXL_lightningDPMSDE.safetensors",
  videoSettings: VideoSettings
) => {
  const baseWorkflow: Record<string, object> = {
    "1": {
      "inputs": {
        "image": uploadedImageName
      },
      "class_type": "LoadImage",
      "_meta": { "title": "Load Image" }
    },
    "2": {
      "inputs": {
        "ckpt_name": checkpointName
      },
      "class_type": "CheckpointLoaderSimple",
      "_meta": { "title": "Load Checkpoint" }
    },
    "3": {
      "inputs": {
        "model_name": videoSettings.motionModel
      },
      "class_type": "ADE_LoadAnimateDiffModel",
      "_meta": { "title": "Load AnimateDiff Model" }
    },
    "4": {
      "inputs": {
        "motion_model": ["3", 0],
        "start_percent": 0,
        "end_percent": 1
      },
      "class_type": "ADE_ApplyAnimateDiffModel",
      "_meta": { "title": "Apply AnimateDiff Model" }
    },
    "12": {
      "inputs": {
        "model": ["2", 0],
        "beta_schedule": "autoselect",
        "m_models": ["4", 0]
      },
      "class_type": "ADE_UseEvolvedSampling",
      "_meta": { "title": "Use Evolved Sampling" }
    },
    "5": {
      "inputs": {
        "text": motionPrompt,
        "clip": ["2", 1]
      },
      "class_type": "CLIPTextEncode",
      "_meta": { "title": "CLIP Text Encode (Positive)" }
    },
    "6": {
      "inputs": {
        "text": "static, still, frozen, bad quality, blurry",
        "clip": ["2", 1]
      },
      "class_type": "CLIPTextEncode",
      "_meta": { "title": "CLIP Text Encode (Negative)" }
    },
    "7": {
      "inputs": {
        "pixels": ["1", 0],
        "vae": ["2", 2]
      },
      "class_type": "VAEEncode",
      "_meta": { "title": "VAE Encode" }
    },
    "8": {
      "inputs": {
        "samples": ["7", 0],
        "amount": videoSettings.frames
      },
      "class_type": "RepeatLatentBatch",
      "_meta": { "title": "Repeat Latent Batch" }
    },
    "9": {
      "inputs": {
        "seed": seed,
        "steps": videoSettings.steps,
        "cfg": videoSettings.cfgScale,
        "sampler_name": videoSettings.sampler,
        "scheduler": videoSettings.scheduler,
        "denoise": videoSettings.denoise,
        "model": ["12", 0],
        "positive": ["5", 0],
        "negative": ["6", 0],
        "latent_image": ["8", 0]
      },
      "class_type": "KSampler",
      "_meta": { "title": "KSampler" }
    },
    "10": {
      "inputs": {
        "samples": ["9", 0],
        "vae": ["2", 2]
      },
      "class_type": "VAEDecode",
      "_meta": { "title": "VAE Decode" }
    }
  };

  if (hasVHS) {
    // Use VHS_VideoCombine for proper video output
    baseWorkflow["11"] = {
      "inputs": {
        "frame_rate": videoSettings.frameRate,
        "loop_count": 0,
        "filename_prefix": "AnimateDiff",
        "format": videoSettings.format,
        "pix_fmt": "yuv420p",
        "crf": videoSettings.quality,
        "save_metadata": true,
        "pingpong": videoSettings.pingpong,
        "save_output": true,
        "images": ["10", 0]
      },
      "class_type": "VHS_VideoCombine",
      "_meta": { "title": "Video Combine" }
    };
  } else {
    // Fall back to SaveImage for frame output (GIF support is built-in)
    baseWorkflow["11"] = {
      "inputs": {
        "filename_prefix": "AnimateDiff_frames",
        "images": ["10", 0]
      },
      "class_type": "SaveImage",
      "_meta": { "title": "Save Frames" }
    };
  }

  return baseWorkflow;
};

// Helper to call the proxy edge function
async function callComfyUIProxy(action: string, comfyUrl: string, payload?: object) {
  const { data, error } = await supabase.functions.invoke('comfyui-proxy', {
    body: { action, comfyUrl, payload }
  });
  
  if (error) {
    throw new Error(`Proxy error: ${error.message}`);
  }
  
  if (data?.error) {
    throw new Error(data.error);
  }
  
  return data;
}

export interface VideoProgressInfo {
  progress: number; // 0-100
  elapsedSeconds: number;
  estimatedTotalSeconds: number | null;
  estimatedRemainingSeconds: number | null;
}

export function useComfyUI() {
  const { comfyUIConfig, isComfyUIConnected, setIsComfyUIConnected, videoSettings } = useSettings();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoProgressInfo, setVideoProgressInfo] = useState<VideoProgressInfo>({
    progress: 0,
    elapsedSeconds: 0,
    estimatedTotalSeconds: null,
    estimatedRemainingSeconds: null,
  });

  const getComfyUrl = useCallback(() => {
    // Normalize: remove trailing slash
    return comfyUIConfig.baseUrl.replace(/\/$/, "");
  }, [comfyUIConfig]);

  // Check connection via proxy
  const checkConnection = useCallback(async (): Promise<boolean> => {
    try {
      await callComfyUIProxy('system_stats', getComfyUrl());
      setIsComfyUIConnected(true);
      return true;
    } catch (error) {
      console.error('ComfyUI connection check failed:', error);
      setIsComfyUIConnected(false);
      return false;
    }
  }, [getComfyUrl, setIsComfyUIConnected]);

  // Queue a workflow to ComfyUI via proxy
  const queuePrompt = useCallback(async (workflow: object): Promise<string> => {
    const data = await callComfyUIProxy('queue_prompt', getComfyUrl(), { prompt: workflow });
    return data.prompt_id;
  }, [getComfyUrl]);

  // Check if a prompt is still in the queue
  const checkQueue = useCallback(async (promptId: string): Promise<boolean> => {
    const data = await callComfyUIProxy('get_queue', getComfyUrl());
    
    const running = data.queue_running?.some((item: [number, string]) => item[1] === promptId);
    const pending = data.queue_pending?.some((item: [number, string]) => item[1] === promptId);
    
    return running || pending;
  }, [getComfyUrl]);

  // Get the history/output for a completed prompt
  const getHistory = useCallback(async (promptId: string): Promise<HistoryItem | null> => {
    const data = await callComfyUIProxy('get_history', getComfyUrl(), { prompt_id: promptId });
    return data[promptId] || null;
  }, [getComfyUrl]);

  // Get image data via proxy (returns base64)
  const getImageData = useCallback(async (
    filename: string, 
    subfolder: string = "", 
    type: string = "output"
  ): Promise<string> => {
    const data = await callComfyUIProxy('get_image', getComfyUrl(), { filename, subfolder, type });
    
    if (data.success && data.imageData) {
      return data.imageData;
    }
    
    throw new Error('Failed to retrieve image from ComfyUI');
  }, [getComfyUrl]);

  // Extract first image-like output from a completed history item
  const extractImageFromHistory = useCallback(async (history: HistoryItem): Promise<string | null> => {
    for (const nodeId of Object.keys(history.outputs ?? {})) {
      const output = history.outputs[nodeId];

      if (output.images && output.images.length > 0) {
        const image =
          output.images.find(
            (f) =>
              f.filename.endsWith(".png") ||
              f.filename.endsWith(".jpg") ||
              f.filename.endsWith(".jpeg") ||
              f.filename.endsWith(".webp")
          ) ?? output.images[0];

        const imageData = await getImageData(image.filename, image.subfolder, image.type);
        return imageData;
      }
    }

    return null;
  }, [getImageData]);

  const extractVideoFromHistory = useCallback(async (history: HistoryItem): Promise<string | null> => {
    for (const nodeId of Object.keys(history.outputs ?? {})) {
      const output = history.outputs[nodeId];

      // VHS often outputs here
      if (output.gifs && output.gifs.length > 0) {
        const video = output.gifs[0];
        return await getImageData(video.filename, video.subfolder, video.type);
      }

      if (output.videos && output.videos.length > 0) {
        const video = output.videos[0];
        return await getImageData(video.filename, video.subfolder, video.type);
      }

      // Some setups still put mp4/gif into images
      if (output.images && output.images.length > 0) {
        const file = output.images.find(
          (f) => f.filename.endsWith(".mp4") || f.filename.endsWith(".gif") || f.filename.endsWith(".webm")
        );
        if (file) return await getImageData(file.filename, file.subfolder, file.type);
      }
    }

    return null;
  }, [getImageData]);

  // Poll for completion and return the generated image
  const pollForCompletion = useCallback(async (
    promptId: string,
    maxAttempts: number = 120,
    interval: number = 1000
  ): Promise<ComfyUIWorkflowResult> => {
    let attempts = 0;

    while (attempts < maxAttempts) {
      const inQueue = await checkQueue(promptId);

      if (!inQueue) {
        // ComfyUI sometimes drops the prompt from the queue before the history/output is fully written.
        // So we retry history for a short period before declaring failure.
        const historyRetryMax = 20;
        for (let r = 0; r < historyRetryMax; r++) {
          const history = await getHistory(promptId);
          if (history?.outputs) {
            const imageUrl = await extractImageFromHistory(history);
            if (imageUrl) {
              return { imageUrl, seed: 0 };
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        const history = await getHistory(promptId);
        console.error("Image generation: history present but no image output.", history);
        throw new Error(
          "Generation completed but no image found yet. This usually means the workflow didn't write a SaveImage output or ComfyUI hasn't finished writing history."
        );
      }

      setProgress(Math.min((attempts / maxAttempts) * 100, 95));

      await new Promise((resolve) => setTimeout(resolve, interval));
      attempts++;
    }

    throw new Error("Generation timed out");
  }, [checkQueue, getHistory, extractImageFromHistory]);

  // Poll for video completion - waits indefinitely until job completes
  const pollForVideoCompletion = useCallback(async (
    promptId: string,
    interval: number = 2000
  ): Promise<ComfyUIVideoResult> => {
    let pollCount = 0;
    const startTime = Date.now();
    let progressHistory: { time: number; progress: number }[] = [];

    // Reset progress info at start
    setVideoProgressInfo({
      progress: 0,
      elapsedSeconds: 0,
      estimatedTotalSeconds: null,
      estimatedRemainingSeconds: null,
    });

    while (true) {
      const inQueue = await checkQueue(promptId);

      if (!inQueue) {
        // Short grace period for history/output files to appear
        const historyRetryMax = 30;
        for (let r = 0; r < historyRetryMax; r++) {
          const history = await getHistory(promptId);
          
          // Check if ComfyUI reported an error in the status
          if (history?.status?.status_str === "error") {
            const errorMsg = history.status.messages?.find(
              (m: any) => m[0] === "execution_error"
            );
            if (errorMsg && errorMsg[1]?.exception_message) {
              const msg = errorMsg[1].exception_message as string;
              // Provide user-friendly message for common errors
              if (msg.includes("OutOfMemoryError") || msg.includes("ran out of memory")) {
                throw new Error(
                  "GPU out of memory! Try reducing the number of frames (e.g., 16 instead of 32) or use a smaller resolution."
                );
              }
              throw new Error(`ComfyUI error: ${msg}`);
            }
            throw new Error("ComfyUI reported an error during generation. Check the ComfyUI console for details.");
          }
          
          if (history?.outputs) {
            const videoUrl = await extractVideoFromHistory(history);
            if (videoUrl) {
              const finalElapsed = Math.floor((Date.now() - startTime) / 1000);
              setVideoProgressInfo({
                progress: 100,
                elapsedSeconds: finalElapsed,
                estimatedTotalSeconds: finalElapsed,
                estimatedRemainingSeconds: 0,
              });
              return { videoUrl, seed: 0 };
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 750));
        }

        const finalElapsed = Math.floor((Date.now() - startTime) / 1000);
        setVideoProgressInfo({
          progress: 100,
          elapsedSeconds: finalElapsed,
          estimatedTotalSeconds: finalElapsed,
          estimatedRemainingSeconds: 0,
        });

        const history = await getHistory(promptId);
        
        // Final check for error status
        if (history?.status?.status_str === "error") {
          const errorMsg = history.status.messages?.find(
            (m: any) => m[0] === "execution_error"
          );
          if (errorMsg && errorMsg[1]?.exception_message) {
            const msg = errorMsg[1].exception_message as string;
            if (msg.includes("OutOfMemoryError") || msg.includes("ran out of memory")) {
              throw new Error(
                "GPU out of memory! Try reducing the number of frames (e.g., 16 instead of 32) or use a smaller resolution."
              );
            }
            throw new Error(`ComfyUI error: ${msg}`);
          }
          throw new Error("ComfyUI reported an error during generation. Check the ComfyUI console for details.");
        }
        
        console.error("Video generation: history present but no video output.", history);
        throw new Error(
          "Video generation completed but no video found yet. If you're using VHS_VideoCombine, ensure it is saving output (save_output=true) and try again."
        );
      }

      // Calculate elapsed time and estimate remaining
      pollCount++;
      const elapsedMs = Date.now() - startTime;
      const elapsedSeconds = Math.floor(elapsedMs / 1000);

      // Heuristic progress (ComfyUI doesn't expose per-step progress reliably)
      const estimatedTotalSeconds = 18 * 60; // 18 minutes average
      const estimatedProgress = Math.min(95, (elapsedSeconds / estimatedTotalSeconds) * 100);

      progressHistory.push({ time: elapsedSeconds, progress: estimatedProgress });
      if (progressHistory.length > 10) progressHistory.shift();

      let estimatedRemainingSeconds: number | null = null;
      if (estimatedProgress > 5 && estimatedProgress < 95) {
        estimatedRemainingSeconds = Math.round(elapsedSeconds * ((100 - estimatedProgress) / estimatedProgress));
      }

      setVideoProgress(estimatedProgress);
      setVideoProgressInfo({
        progress: estimatedProgress,
        elapsedSeconds,
        estimatedTotalSeconds,
        estimatedRemainingSeconds,
      });

      console.log(
        `Video generation: ${elapsedSeconds}s elapsed, ~${
          estimatedRemainingSeconds ? Math.round(estimatedRemainingSeconds / 60) + " min" : "?"
        } remaining`
      );

      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }, [checkQueue, getHistory, extractVideoFromHistory]);

  // Main function to generate an image
  const generateImage = useCallback(async (
    prompt: string,
    options: {
      seed?: number;
      width?: number;
      height?: number;
      checkpointName?: string;
    } = {}
  ): Promise<ComfyUIWorkflowResult> => {
    const { 
      seed = Math.floor(Math.random() * 2147483647),
      width = 1024,
      height = 1024,
      checkpointName,
    } = options;

    // Check connection first
    const connected = await checkConnection();
    if (!connected) {
      throw new Error("ComfyUI is not connected. Please check your tunnel URL in settings.");
    }

    setIsGenerating(true);
    setProgress(0);

    try {
      // Use checkpoint from options, or fall back to settings, or auto-detect
      let resolvedCheckpoint = checkpointName || comfyUIConfig.selectedCheckpoint;
      
      if (!resolvedCheckpoint) {
        // Auto-detect available checkpoints
        const available: string[] = await (async () => {
          try {
            const data = await callComfyUIProxy('get_models', getComfyUrl());
            return data.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
          } catch {
            return [];
          }
        })();
        resolvedCheckpoint = available[0];
      }

      if (!resolvedCheckpoint) {
        throw new Error("No checkpoint selected. Please select a checkpoint in Settings.");
      }

      // Use standard workflow with resolved checkpoint
      const workflow = createWorkflowWithCheckpoint(prompt, seed, width, height, resolvedCheckpoint);

      setProgress(5);
      const promptId = await queuePrompt(workflow);

      setProgress(10);
      const result = await pollForCompletion(promptId);

      setProgress(100);
      return { ...result, seed };
    } finally {
      setIsGenerating(false);
    }
  }, [checkConnection, getComfyUrl, comfyUIConfig.selectedCheckpoint, queuePrompt, pollForCompletion]);

  // Check if AnimateDiff nodes are available
  const checkAnimateDiffAvailable = useCallback(async (): Promise<boolean> => {
    try {
      const data = await callComfyUIProxy('get_object_info', getComfyUrl(), { node_class: 'ADE_LoadAnimateDiffModel' });
      return !!data?.ADE_LoadAnimateDiffModel;
    } catch {
      return false;
    }
  }, [getComfyUrl]);

  // Check if VHS (Video Helper Suite) nodes are available
  const checkVHSAvailable = useCallback(async (): Promise<boolean> => {
    try {
      const data = await callComfyUIProxy('get_object_info', getComfyUrl(), { node_class: 'VHS_VideoCombine' });
      return !!data?.VHS_VideoCombine;
    } catch {
      return false;
    }
  }, [getComfyUrl]);

  // Upload image to ComfyUI
  const uploadImage = useCallback(async (imageBase64: string, filename: string): Promise<string> => {
    const data = await callComfyUIProxy('upload_image', getComfyUrl(), { 
      imageData: imageBase64, 
      filename 
    });
    return data.name || filename;
  }, [getComfyUrl]);

  // Get available models - must be before generateVideo since it uses this
  const getModels = useCallback(async () => {
    try {
      const data = await callComfyUIProxy('get_models', getComfyUrl());
      return data.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
    } catch {
      return [];
    }
  }, [getComfyUrl]);

  // Generate video from image using AnimateDiff
  const generateVideo = useCallback(async (
    imageUrl: string,
    motionPrompt: string,
    options: {
      seed?: number;
      settingsOverride?: Partial<VideoSettings>;
    } = {}
  ): Promise<ComfyUIVideoResult> => {
    const {
      seed = Math.floor(Math.random() * 2147483647),
      settingsOverride = {},
    } = options;
    
    // Merge current video settings with any overrides
    const settings = { ...videoSettings, ...settingsOverride };

    // Check connection first
    const connected = await checkConnection();
    if (!connected) {
      throw new Error("ComfyUI is not connected. Please check your tunnel URL in settings.");
    }

    // Check if AnimateDiff is available
    const hasAnimateDiff = await checkAnimateDiffAvailable();
    if (!hasAnimateDiff) {
      throw new Error("ANIMATEDIFF_NOT_INSTALLED");
    }

    // Check if VHS is available for proper video output
    const hasVHS = await checkVHSAvailable();
    if (!hasVHS) {
      console.warn("VHS not installed - will output frames as images instead of video");
    }

    setIsGeneratingVideo(true);
    setVideoProgress(0);

    try {
      // Get available checkpoints and find an SD1.5 compatible one
      // AnimateDiff v3_sd15_mm.ckpt only works with SD1.5 checkpoints, not SDXL
      const availableCheckpoints: string[] = await getModels();
      
      // Filter for SD1.5 compatible checkpoints (exclude XL, SDXL, Juggernaut XL, etc.)
      const sd15Checkpoints = availableCheckpoints.filter((name: string) => {
        const lowerName = name.toLowerCase();
        return !lowerName.includes('xl') && !lowerName.includes('sdxl') && !lowerName.includes('turbo');
      });
      
      const checkpoint = sd15Checkpoints[0];
      
      if (!checkpoint) {
        // No SD1.5 checkpoint available - AnimateDiff won't work
        throw new Error("NO_SD15_CHECKPOINT");
      }
      
      // Upload the image to ComfyUI first
      setVideoProgress(2);
      const uploadFilename = `input_${Date.now()}.png`;
      const uploadedName = await uploadImage(imageUrl, uploadFilename);
      
      // Create AnimateDiff workflow with uploaded image filename and video settings
      const workflow = createAnimateDiffI2VWorkflow(
        uploadedName, 
        motionPrompt, 
        seed, 
        hasVHS, 
        checkpoint,
        settings
      );

      setVideoProgress(5);
      const promptId = await queuePrompt(workflow);

      setVideoProgress(10);
      const result = await pollForVideoCompletion(promptId);

      setVideoProgress(100);
      return { ...result, seed };
    } finally {
      setIsGeneratingVideo(false);
    }
  }, [checkConnection, checkAnimateDiffAvailable, checkVHSAvailable, uploadImage, queuePrompt, pollForVideoCompletion, getModels, videoSettings]);

  // Calculate max clip duration based on current video settings
  const getMaxClipDuration = useCallback((): number => {
    // AnimateDiff has practical limits based on VRAM
    // frames / frameRate = max seconds per clip
    return videoSettings.frames / videoSettings.frameRate;
  }, [videoSettings.frames, videoSettings.frameRate]);

  // Generate a long video by auto-splitting into clips and stitching
  const generateLongVideo = useCallback(async (
    imageUrl: string,
    motionPrompt: string,
    requestedDurationSeconds: number,
    options: {
      seed?: number;
      settingsOverride?: Partial<VideoSettings>;
      onClipProgress?: (clipIndex: number, totalClips: number, clipVideoUrl: string | null) => void;
    } = {}
  ): Promise<{ videoUrls: string[]; totalDuration: number }> => {
    const {
      seed = Math.floor(Math.random() * 2147483647),
      settingsOverride = {},
      onClipProgress,
    } = options;

    const settings = { ...videoSettings, ...settingsOverride };
    const maxClipDuration = settings.frames / settings.frameRate;
    
    // Calculate number of clips needed
    const numClips = Math.ceil(requestedDurationSeconds / maxClipDuration);
    const actualClipDuration = requestedDurationSeconds / numClips;
    
    console.log(`Long video generation: ${requestedDurationSeconds}s requested, ${numClips} clips of ~${actualClipDuration.toFixed(1)}s each (max ${maxClipDuration.toFixed(1)}s per clip)`);
    
    // Adjust frames to match actual clip duration
    const adjustedFrames = Math.round(actualClipDuration * settings.frameRate);
    const adjustedSettings = { ...settings, frames: adjustedFrames };
    
    const videoUrls: string[] = [];
    let currentImageUrl = imageUrl;
    
    for (let i = 0; i < numClips; i++) {
      console.log(`Generating clip ${i + 1}/${numClips}...`);
      onClipProgress?.(i, numClips, null);
      
      try {
        const clipSeed = seed + i; // Vary seed slightly for each clip
        const result = await generateVideo(currentImageUrl, motionPrompt, {
          seed: clipSeed,
          settingsOverride: adjustedSettings,
        });
        
        videoUrls.push(result.videoUrl);
        onClipProgress?.(i, numClips, result.videoUrl);
        
        // For continuity: extract last frame of this clip to use as input for next clip
        if (i < numClips - 1) {
          const lastFrame = await extractLastFrameFromVideo(result.videoUrl);
          if (lastFrame) {
            currentImageUrl = lastFrame;
          }
        }
      } catch (err) {
        console.error(`Failed to generate clip ${i + 1}:`, err);
        throw new Error(`Failed to generate clip ${i + 1}/${numClips}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
    
    return {
      videoUrls,
      totalDuration: numClips * actualClipDuration,
    };
  }, [videoSettings, generateVideo]);

  // Helper to extract last frame from a video URL as base64
  const extractLastFrameFromVideo = useCallback(async (videoUrl: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      
      const timeoutId = setTimeout(() => {
        console.warn('Frame extraction timed out');
        video.remove();
        resolve(null);
      }, 30000);
      
      video.onloadedmetadata = () => {
        video.currentTime = Math.max(0, video.duration - 0.1);
      };
      
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            ctx.drawImage(video, 0, 0);
            const base64 = canvas.toDataURL('image/png');
            clearTimeout(timeoutId);
            video.remove();
            canvas.remove();
            resolve(base64);
          } else {
            clearTimeout(timeoutId);
            video.remove();
            resolve(null);
          }
        } catch (err) {
          console.error('Frame extraction error:', err);
          clearTimeout(timeoutId);
          video.remove();
          resolve(null);
        }
      };
      
      video.onerror = () => {
        console.error('Video load error for frame extraction');
        clearTimeout(timeoutId);
        video.remove();
        resolve(null);
      };
      
      video.src = videoUrl;
      video.load();
    });
  }, []);

  // Check system status
  const getSystemStats = useCallback(async () => {
    return callComfyUIProxy('system_stats', getComfyUrl());
  }, [getComfyUrl]);

  return {
    generateImage,
    generateVideo,
    generateLongVideo,
    getMaxClipDuration,
    checkAnimateDiffAvailable,
    getSystemStats,
    getModels,
    isGenerating,
    isGeneratingVideo,
    progress,
    videoProgress,
    videoProgressInfo,
    isConnected: isComfyUIConnected,
    checkConnection,
  };
}
