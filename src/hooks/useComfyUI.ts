import { useState, useCallback } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import { supabase } from "@/integrations/supabase/client";

interface ComfyUIWorkflowResult {
  imageUrl: string;
  seed: number;
}

interface HistoryOutput {
  images?: Array<{ filename: string; subfolder: string; type: string }>;
}

interface HistoryItem {
  outputs: Record<string, HistoryOutput>;
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

export function useComfyUI() {
  const { comfyUIConfig, isComfyUIConnected, setIsComfyUIConnected } = useSettings();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

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
        const history = await getHistory(promptId);
        
        if (history) {
          for (const nodeId of Object.keys(history.outputs)) {
            const output = history.outputs[nodeId];
            if (output.images && output.images.length > 0) {
              const image = output.images[0];
              const imageData = await getImageData(image.filename, image.subfolder, image.type);
              
              return {
                imageUrl: imageData,
                seed: 0,
              };
            }
          }
        }
        
        throw new Error("Generation completed but no image found");
      }
      
      setProgress(Math.min((attempts / maxAttempts) * 100, 95));
      
      await new Promise(resolve => setTimeout(resolve, interval));
      attempts++;
    }
    
    throw new Error("Generation timed out");
  }, [checkQueue, getHistory, getImageData]);

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
      checkpointName = "sd_xl_base_1.0.safetensors"
    } = options;

    // Check connection first
    const connected = await checkConnection();
    if (!connected) {
      throw new Error("ComfyUI is not connected. Please check your tunnel URL in settings.");
    }

    setIsGenerating(true);
    setProgress(0);

    try {
      // Use standard workflow with the specified checkpoint
      const workflow = createWorkflowWithCheckpoint(prompt, seed, width, height, checkpointName);
      
      setProgress(5);
      const promptId = await queuePrompt(workflow);
      
      setProgress(10);
      const result = await pollForCompletion(promptId);
      
      setProgress(100);
      return { ...result, seed };
    } finally {
      setIsGenerating(false);
    }
  }, [checkConnection, queuePrompt, pollForCompletion]);

  // Check system status
  const getSystemStats = useCallback(async () => {
    return callComfyUIProxy('system_stats', getComfyUrl());
  }, [getComfyUrl]);

  // Get available models
  const getModels = useCallback(async () => {
    try {
      const data = await callComfyUIProxy('get_models', getComfyUrl());
      return data.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
    } catch {
      return [];
    }
  }, [getComfyUrl]);

  return {
    generateImage,
    getSystemStats,
    getModels,
    isGenerating,
    progress,
    isConnected: isComfyUIConnected,
    checkConnection,
  };
}
