import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type InferenceMode = "cloud" | "hybrid" | "local";

// ComfyUI Video Generation Settings
export interface VideoSettings {
  // Sampler settings
  sampler: string;
  scheduler: string;
  steps: number;
  cfgScale: number;
  denoise: number;
  
  // Animation settings
  frames: number;
  frameRate: number;
  motionModel: string;
  
  // Output settings
  format: string;
  quality: number; // CRF for h264 (lower = better, 15-25 typical)
  pingpong: boolean;
}

export interface VideoPreset {
  id: string;
  name: string;
  description: string;
  settings: VideoSettings;
}

// Default video settings
export const DEFAULT_VIDEO_SETTINGS: VideoSettings = {
  sampler: "euler",
  scheduler: "normal",
  steps: 20,
  cfgScale: 7.5,
  denoise: 0.6,
  frames: 16,
  frameRate: 8,
  motionModel: "v3_sd15_mm.ckpt",
  format: "video/h264-mp4",
  quality: 19,
  pingpong: false,
};

// Built-in presets
export const VIDEO_PRESETS: VideoPreset[] = [
  {
    id: "fast",
    name: "Fast Preview",
    description: "Quick generation for previewing motion. Lower quality but fast.",
    settings: {
      sampler: "euler",
      scheduler: "normal",
      steps: 12,
      cfgScale: 6,
      denoise: 0.5,
      frames: 12,
      frameRate: 8,
      motionModel: "v3_sd15_mm.ckpt",
      format: "video/h264-mp4",
      quality: 23,
      pingpong: false,
    },
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "Good balance between quality and generation time.",
    settings: {
      sampler: "euler",
      scheduler: "normal",
      steps: 20,
      cfgScale: 7.5,
      denoise: 0.6,
      frames: 16,
      frameRate: 8,
      motionModel: "v3_sd15_mm.ckpt",
      format: "video/h264-mp4",
      quality: 19,
      pingpong: false,
    },
  },
  {
    id: "quality",
    name: "High Quality",
    description: "Best quality output. Longer generation time.",
    settings: {
      sampler: "dpmpp_2m",
      scheduler: "karras",
      steps: 30,
      cfgScale: 8,
      denoise: 0.65,
      frames: 24,
      frameRate: 12,
      motionModel: "v3_sd15_mm.ckpt",
      format: "video/h264-mp4",
      quality: 15,
      pingpong: false,
    },
  },
  {
    id: "smooth",
    name: "Smooth Motion",
    description: "Optimized for smooth, flowing motion with more frames.",
    settings: {
      sampler: "euler_ancestral",
      scheduler: "normal",
      steps: 25,
      cfgScale: 7,
      denoise: 0.55,
      frames: 24,
      frameRate: 12,
      motionModel: "v3_sd15_mm.ckpt",
      format: "video/h264-mp4",
      quality: 17,
      pingpong: false,
    },
  },
  {
    id: "loop",
    name: "Looping GIF",
    description: "Creates a seamless looping animation with pingpong.",
    settings: {
      sampler: "euler",
      scheduler: "normal",
      steps: 20,
      cfgScale: 7,
      denoise: 0.5,
      frames: 16,
      frameRate: 10,
      motionModel: "v3_sd15_mm.ckpt",
      format: "image/gif",
      quality: 19,
      pingpong: true,
    },
  },
  {
    id: "cinematic",
    name: "Cinematic",
    description: "Film-like output with longer duration and lower frame rate.",
    settings: {
      sampler: "dpmpp_2m_sde",
      scheduler: "karras",
      steps: 35,
      cfgScale: 8.5,
      denoise: 0.7,
      frames: 32,
      frameRate: 8,
      motionModel: "v3_sd15_mm.ckpt",
      format: "video/h264-mp4",
      quality: 15,
      pingpong: false,
    },
  },
];

// Available options for dropdowns
export const SAMPLER_OPTIONS = [
  "euler",
  "euler_ancestral", 
  "heun",
  "heunpp2",
  "dpm_2",
  "dpm_2_ancestral",
  "lms",
  "dpm_fast",
  "dpm_adaptive",
  "dpmpp_2s_ancestral",
  "dpmpp_sde",
  "dpmpp_sde_gpu",
  "dpmpp_2m",
  "dpmpp_2m_sde",
  "dpmpp_2m_sde_gpu",
  "dpmpp_3m_sde",
  "dpmpp_3m_sde_gpu",
  "ddpm",
  "lcm",
  "ddim",
  "uni_pc",
  "uni_pc_bh2",
];

export const SCHEDULER_OPTIONS = [
  "normal",
  "karras",
  "exponential",
  "sgm_uniform",
  "simple",
  "ddim_uniform",
  "beta",
];

export const FORMAT_OPTIONS = [
  { value: "video/h264-mp4", label: "MP4 (H.264)" },
  { value: "video/h265-mp4", label: "MP4 (H.265)" },
  { value: "video/webm", label: "WebM" },
  { value: "image/gif", label: "GIF" },
];

export const MOTION_MODEL_OPTIONS = [
  { value: "v3_sd15_mm.ckpt", label: "AnimateDiff v3 (SD1.5)" },
  { value: "v2_lora_adapter_sd15.ckpt", label: "AnimateDiff v2 (SD1.5)" },
  { value: "mm_sd_v15_v2.ckpt", label: "AnimateDiff SD1.5 v2" },
  { value: "mm_sd_v15.ckpt", label: "AnimateDiff SD1.5 v1" },
];

interface ComfyUIConfig {
  baseUrl: string;
  selectedCheckpoint: string | null;
}

interface SettingsContextType {
  inferenceMode: InferenceMode;
  setInferenceMode: (mode: InferenceMode) => void;
  comfyUIConfig: ComfyUIConfig;
  setComfyUIConfig: (config: ComfyUIConfig) => void;
  isComfyUIConnected: boolean;
  setIsComfyUIConnected: (connected: boolean) => void;
  checkComfyUIConnection: () => Promise<boolean>;
  availableCheckpoints: string[];
  setAvailableCheckpoints: (checkpoints: string[]) => void;
  fetchCheckpoints: () => Promise<string[]>;
  
  // Video settings
  videoSettings: VideoSettings;
  setVideoSettings: (settings: VideoSettings) => void;
  selectedPresetId: string | null;
  setSelectedPresetId: (id: string | null) => void;
  applyPreset: (presetId: string) => void;
  customPresets: VideoPreset[];
  saveCustomPreset: (name: string, description: string) => void;
  deleteCustomPreset: (id: string) => void;
  availableMotionModels: string[];
  setAvailableMotionModels: (models: string[]) => void;
}

const defaultComfyUIConfig: ComfyUIConfig = {
  baseUrl: "https://your-tunnel-url.ngrok.io",
  selectedCheckpoint: null,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const SETTINGS_STORAGE_KEY = "lyricvision_settings";

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [inferenceMode, setInferenceModeState] = useState<InferenceMode>("cloud");
  const [comfyUIConfig, setComfyUIConfigState] = useState<ComfyUIConfig>(defaultComfyUIConfig);
  const [isComfyUIConnected, setIsComfyUIConnected] = useState(false);
  const [availableCheckpoints, setAvailableCheckpoints] = useState<string[]>([]);
  const [videoSettings, setVideoSettingsState] = useState<VideoSettings>(DEFAULT_VIDEO_SETTINGS);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>("balanced");
  const [customPresets, setCustomPresets] = useState<VideoPreset[]>([]);
  const [availableMotionModels, setAvailableMotionModels] = useState<string[]>([]);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.inferenceMode) setInferenceModeState(parsed.inferenceMode);
        
        if (parsed.comfyUIConfig) {
          const config = parsed.comfyUIConfig;
          // Migrate old host/port format to baseUrl
          if (config.host !== undefined && config.port !== undefined) {
            const newConfig = { ...defaultComfyUIConfig };
            setComfyUIConfigState(newConfig);
          } else if (config.baseUrl) {
            setComfyUIConfigState({
              baseUrl: config.baseUrl,
              selectedCheckpoint: config.selectedCheckpoint || null,
            });
          }
        }
        
        // Load video settings
        if (parsed.videoSettings) {
          setVideoSettingsState({ ...DEFAULT_VIDEO_SETTINGS, ...parsed.videoSettings });
        }
        if (parsed.selectedPresetId !== undefined) {
          setSelectedPresetId(parsed.selectedPresetId);
        }
        if (parsed.customPresets) {
          setCustomPresets(parsed.customPresets);
        }
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }, []);

  // Save settings to localStorage
  const saveSettings = (
    mode: InferenceMode, 
    config: ComfyUIConfig,
    vidSettings: VideoSettings,
    presetId: string | null,
    customPres: VideoPreset[]
  ) => {
    try {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ 
          inferenceMode: mode, 
          comfyUIConfig: config,
          videoSettings: vidSettings,
          selectedPresetId: presetId,
          customPresets: customPres,
        })
      );
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  };

  const setInferenceMode = (mode: InferenceMode) => {
    setInferenceModeState(mode);
    saveSettings(mode, comfyUIConfig, videoSettings, selectedPresetId, customPresets);
  };

  const setComfyUIConfig = (config: ComfyUIConfig) => {
    setComfyUIConfigState(config);
    saveSettings(inferenceMode, config, videoSettings, selectedPresetId, customPresets);
  };

  const setVideoSettings = (settings: VideoSettings) => {
    setVideoSettingsState(settings);
    setSelectedPresetId(null); // Clear preset when manually changing settings
    saveSettings(inferenceMode, comfyUIConfig, settings, null, customPresets);
  };

  const applyPreset = (presetId: string) => {
    const allPresets = [...VIDEO_PRESETS, ...customPresets];
    const preset = allPresets.find(p => p.id === presetId);
    if (preset) {
      setVideoSettingsState(preset.settings);
      setSelectedPresetId(presetId);
      saveSettings(inferenceMode, comfyUIConfig, preset.settings, presetId, customPresets);
    }
  };

  const saveCustomPreset = (name: string, description: string) => {
    const newPreset: VideoPreset = {
      id: `custom_${Date.now()}`,
      name,
      description,
      settings: { ...videoSettings },
    };
    const updated = [...customPresets, newPreset];
    setCustomPresets(updated);
    setSelectedPresetId(newPreset.id);
    saveSettings(inferenceMode, comfyUIConfig, videoSettings, newPreset.id, updated);
  };

  const deleteCustomPreset = (id: string) => {
    const updated = customPresets.filter(p => p.id !== id);
    setCustomPresets(updated);
    if (selectedPresetId === id) {
      setSelectedPresetId("balanced");
      const balanced = VIDEO_PRESETS.find(p => p.id === "balanced");
      if (balanced) {
        setVideoSettingsState(balanced.settings);
      }
    }
    saveSettings(inferenceMode, comfyUIConfig, videoSettings, selectedPresetId === id ? "balanced" : selectedPresetId, updated);
  };

  const checkComfyUIConnection = async (): Promise<boolean> => {
    try {
      const comfyUrl = comfyUIConfig.baseUrl.replace(/\/$/, "");
      
      const { data, error } = await supabase.functions.invoke("comfyui-proxy", {
        body: { action: "system_stats", comfyUrl },
      });

      if (error || data?.error) {
        console.error("ComfyUI connection check failed:", error || data?.error);
        setIsComfyUIConnected(false);
        return false;
      }

      setIsComfyUIConnected(true);
      return true;
    } catch (err) {
      console.error("ComfyUI connection check error:", err);
      setIsComfyUIConnected(false);
      return false;
    }
  };

  const fetchCheckpoints = async (): Promise<string[]> => {
    try {
      const comfyUrl = comfyUIConfig.baseUrl.replace(/\/$/, "");
      
      const { data, error } = await supabase.functions.invoke("comfyui-proxy", {
        body: { action: "get_models", comfyUrl },
      });

      if (error || data?.error) {
        console.error("Failed to fetch checkpoints:", error || data?.error);
        return [];
      }

      const checkpoints: string[] = data.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
      setAvailableCheckpoints(checkpoints);
      
      // Auto-select first checkpoint if none selected
      if (checkpoints.length > 0 && !comfyUIConfig.selectedCheckpoint) {
        setComfyUIConfig({ ...comfyUIConfig, selectedCheckpoint: checkpoints[0] });
      }
      
      return checkpoints;
    } catch (err) {
      console.error("Fetch checkpoints error:", err);
      return [];
    }
  };

  return (
    <SettingsContext.Provider
      value={{
        inferenceMode,
        setInferenceMode,
        comfyUIConfig,
        setComfyUIConfig,
        isComfyUIConnected,
        setIsComfyUIConnected,
        checkComfyUIConnection,
        availableCheckpoints,
        setAvailableCheckpoints,
        fetchCheckpoints,
        videoSettings,
        setVideoSettings,
        selectedPresetId,
        setSelectedPresetId,
        applyPreset,
        customPresets,
        saveCustomPreset,
        deleteCustomPreset,
        availableMotionModels,
        setAvailableMotionModels,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
