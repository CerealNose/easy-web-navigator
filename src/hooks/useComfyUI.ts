import { useState, useCallback } from "react";
import { useSettings } from "@/contexts/SettingsContext";

interface ComfyUIWorkflowResult {
  imageUrl: string;
  seed: number;
}

interface QueueResponse {
  prompt_id: string;
}

interface HistoryOutput {
  images?: Array<{ filename: string; subfolder: string; type: string }>;
}

interface HistoryItem {
  outputs: Record<string, HistoryOutput>;
}

// Default FLUX.1 Schnell workflow for ComfyUI
// This is a minimal workflow that works with the FLUX.1-schnell-gguf model
const createFluxWorkflow = (prompt: string, seed: number, width: number = 1280, height: number = 720) => ({
  "3": {
    "inputs": {
      "seed": seed,
      "steps": 4,
      "cfg": 1.0,
      "sampler_name": "euler",
      "scheduler": "simple",
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
      "unet_name": "flux1-schnell-Q4_K_S.gguf"
    },
    "class_type": "UnetLoaderGGUF",
    "_meta": { "title": "Unet Loader (GGUF)" }
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
      "clip": ["11", 0]
    },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "CLIP Text Encode (Positive)" }
  },
  "7": {
    "inputs": {
      "text": "",
      "clip": ["11", 0]
    },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "CLIP Text Encode (Negative)" }
  },
  "8": {
    "inputs": {
      "samples": ["3", 0],
      "vae": ["10", 0]
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
  },
  "10": {
    "inputs": {
      "vae_name": "ae.safetensors"
    },
    "class_type": "VAELoader",
    "_meta": { "title": "Load VAE" }
  },
  "11": {
    "inputs": {
      "clip_name1": "t5xxl_fp16.safetensors",
      "clip_name2": "clip_l.safetensors",
      "type": "flux"
    },
    "class_type": "DualCLIPLoader",
    "_meta": { "title": "DualCLIPLoader" }
  }
});

// Alternative SDXL workflow for systems without FLUX
const createSDXLWorkflow = (prompt: string, seed: number, width: number = 1280, height: number = 720) => ({
  "3": {
    "inputs": {
      "seed": seed,
      "steps": 20,
      "cfg": 7,
      "sampler_name": "euler_ancestral",
      "scheduler": "normal",
      "denoise": 1,
      "model": ["4", 0],
      "positive": ["6", 0],
      "negative": ["7", 0],
      "latent_image": ["5", 0]
    },
    "class_type": "KSampler"
  },
  "4": {
    "inputs": {
      "ckpt_name": "sd_xl_base_1.0.safetensors"
    },
    "class_type": "CheckpointLoaderSimple"
  },
  "5": {
    "inputs": {
      "width": width,
      "height": height,
      "batch_size": 1
    },
    "class_type": "EmptyLatentImage"
  },
  "6": {
    "inputs": {
      "text": prompt,
      "clip": ["4", 1]
    },
    "class_type": "CLIPTextEncode"
  },
  "7": {
    "inputs": {
      "text": "blurry, low quality, distorted, ugly",
      "clip": ["4", 1]
    },
    "class_type": "CLIPTextEncode"
  },
  "8": {
    "inputs": {
      "samples": ["3", 0],
      "vae": ["4", 2]
    },
    "class_type": "VAEDecode"
  },
  "9": {
    "inputs": {
      "filename_prefix": "ComfyUI",
      "images": ["8", 0]
    },
    "class_type": "SaveImage"
  }
});

export function useComfyUI() {
  const { comfyUIConfig, isComfyUIConnected, checkComfyUIConnection } = useSettings();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  const getBaseUrl = useCallback(() => {
    return `http://${comfyUIConfig.host}:${comfyUIConfig.port}`;
  }, [comfyUIConfig]);

  // Queue a workflow to ComfyUI
  const queuePrompt = useCallback(async (workflow: object): Promise<string> => {
    const response = await fetch(`${getBaseUrl()}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow }),
    });

    if (!response.ok) {
      throw new Error(`Failed to queue prompt: ${response.statusText}`);
    }

    const data: QueueResponse = await response.json();
    return data.prompt_id;
  }, [getBaseUrl]);

  // Check if a prompt is still in the queue
  const checkQueue = useCallback(async (promptId: string): Promise<boolean> => {
    const response = await fetch(`${getBaseUrl()}/queue`);
    const data = await response.json();
    
    // Check if prompt is in running or pending queue
    const running = data.queue_running?.some((item: [number, string]) => item[1] === promptId);
    const pending = data.queue_pending?.some((item: [number, string]) => item[1] === promptId);
    
    return running || pending;
  }, [getBaseUrl]);

  // Get the history/output for a completed prompt
  const getHistory = useCallback(async (promptId: string): Promise<HistoryItem | null> => {
    const response = await fetch(`${getBaseUrl()}/history/${promptId}`);
    const data = await response.json();
    return data[promptId] || null;
  }, [getBaseUrl]);

  // Get image URL from ComfyUI output
  const getImageUrl = useCallback((filename: string, subfolder: string = "", type: string = "output"): string => {
    const params = new URLSearchParams({
      filename,
      subfolder,
      type,
    });
    return `${getBaseUrl()}/view?${params.toString()}`;
  }, [getBaseUrl]);

  // Poll for completion and return the generated image
  const pollForCompletion = useCallback(async (
    promptId: string,
    maxAttempts: number = 120,
    interval: number = 1000
  ): Promise<ComfyUIWorkflowResult> => {
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      // Check if still in queue
      const inQueue = await checkQueue(promptId);
      
      if (!inQueue) {
        // Check history for results
        const history = await getHistory(promptId);
        
        if (history) {
          // Find the SaveImage output
          for (const nodeId of Object.keys(history.outputs)) {
            const output = history.outputs[nodeId];
            if (output.images && output.images.length > 0) {
              const image = output.images[0];
              const imageUrl = getImageUrl(image.filename, image.subfolder, image.type);
              
              // Convert to base64 for consistent handling
              const imageResponse = await fetch(imageUrl);
              const blob = await imageResponse.blob();
              const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
              
              return {
                imageUrl: base64,
                seed: 0, // Extract from workflow if needed
              };
            }
          }
        }
        
        throw new Error("Generation completed but no image found");
      }
      
      // Update progress
      setProgress(Math.min((attempts / maxAttempts) * 100, 95));
      
      await new Promise(resolve => setTimeout(resolve, interval));
      attempts++;
    }
    
    throw new Error("Generation timed out");
  }, [checkQueue, getHistory, getImageUrl]);

  // Main function to generate an image
  const generateImage = useCallback(async (
    prompt: string,
    options: {
      seed?: number;
      width?: number;
      height?: number;
      useFlux?: boolean;
    } = {}
  ): Promise<ComfyUIWorkflowResult> => {
    const { 
      seed = Math.floor(Math.random() * 2147483647),
      width = 1280,
      height = 720,
      useFlux = true 
    } = options;

    // Check connection first
    const connected = await checkComfyUIConnection();
    if (!connected) {
      throw new Error("ComfyUI is not connected. Please start ComfyUI and check settings.");
    }

    setIsGenerating(true);
    setProgress(0);

    try {
      // Create workflow based on model preference
      const workflow = useFlux 
        ? createFluxWorkflow(prompt, seed, width, height)
        : createSDXLWorkflow(prompt, seed, width, height);
      
      // Queue the workflow
      setProgress(5);
      const promptId = await queuePrompt(workflow);
      
      // Poll for completion
      setProgress(10);
      const result = await pollForCompletion(promptId);
      
      setProgress(100);
      return { ...result, seed };
    } finally {
      setIsGenerating(false);
    }
  }, [checkComfyUIConnection, queuePrompt, pollForCompletion]);

  // Check system status
  const getSystemStats = useCallback(async () => {
    const response = await fetch(`${getBaseUrl()}/system_stats`);
    return response.json();
  }, [getBaseUrl]);

  // Get available models
  const getModels = useCallback(async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/object_info/CheckpointLoaderSimple`);
      const data = await response.json();
      return data.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
    } catch {
      return [];
    }
  }, [getBaseUrl]);

  return {
    generateImage,
    getSystemStats,
    getModels,
    isGenerating,
    progress,
    isConnected: isComfyUIConnected,
    checkConnection: checkComfyUIConnection,
  };
}
