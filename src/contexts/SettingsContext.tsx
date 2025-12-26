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
  motionLora: string; // Camera motion LoRA (e.g., PanLeft, ZoomIn)
  motionLoraStrength: number; // Strength of motion LoRA (0-1)
  
  // Video size
  width: number;
  height: number;
  
  // Output settings
  format: string;
  quality: number; // CRF for h264 (lower = better, 15-25 typical)
  pingpong: boolean;
}

// Motion LoRA options for camera movement effects
export interface MotionLoraOption {
  value: string;
  label: string;
  description: string;
  icon?: string;
}

export const MOTION_LORA_OPTIONS: MotionLoraOption[] = [
  { value: "none", label: "None", description: "No camera motion LoRA" },
  { value: "v2_lora_PanLeft.ckpt", label: "Pan Left", description: "Camera pans left" },
  { value: "v2_lora_PanRight.ckpt", label: "Pan Right", description: "Camera pans right" },
  { value: "v2_lora_ZoomIn.ckpt", label: "Zoom In", description: "Camera zooms in" },
  { value: "v2_lora_ZoomOut.ckpt", label: "Zoom Out", description: "Camera zooms out" },
  { value: "v2_lora_TiltUp.ckpt", label: "Tilt Up", description: "Camera tilts up" },
  { value: "v2_lora_TiltDown.ckpt", label: "Tilt Down", description: "Camera tilts down" },
  { value: "v2_lora_RollingClockwise.ckpt", label: "Roll Clockwise", description: "Camera rotates clockwise" },
  { value: "v2_lora_RollingAnticlockwise.ckpt", label: "Roll Counter-clockwise", description: "Camera rotates counter-clockwise" },
];

// Setting info with descriptions and recommendations
export interface SettingInfo {
  name: string;
  description: string;
  recommendation: string;
  rating?: number; // 1-5 for quality/speed balance
}

export const SAMPLER_INFO: Record<string, SettingInfo> = {
  euler: { name: "Euler", description: "Fast, simple sampler. Good baseline.", recommendation: "★★★★☆ Best for speed", rating: 4 },
  euler_ancestral: { name: "Euler Ancestral", description: "Adds randomness for more variety.", recommendation: "★★★☆☆ Good variety", rating: 3 },
  dpmpp_2m: { name: "DPM++ 2M", description: "High quality with good convergence.", recommendation: "★★★★★ Recommended", rating: 5 },
  dpmpp_2m_sde: { name: "DPM++ 2M SDE", description: "Best quality, stochastic. Great for details.", recommendation: "★★★★★ Best quality", rating: 5 },
  dpmpp_sde: { name: "DPM++ SDE", description: "Stochastic sampler, good variety.", recommendation: "★★★★☆ Good balance", rating: 4 },
  heun: { name: "Heun", description: "More accurate but slower.", recommendation: "★★★☆☆ Accurate", rating: 3 },
  ddim: { name: "DDIM", description: "Deterministic, consistent results.", recommendation: "★★★☆☆ Consistent", rating: 3 },
  lcm: { name: "LCM", description: "Very fast, needs LCM LoRA.", recommendation: "★★★★☆ Ultra fast", rating: 4 },
  uni_pc: { name: "UniPC", description: "Fast with good quality.", recommendation: "★★★★☆ Fast & good", rating: 4 },
};

export const SCHEDULER_INFO: Record<string, SettingInfo> = {
  normal: { name: "Normal", description: "Standard linear schedule.", recommendation: "★★★☆☆ Default", rating: 3 },
  karras: { name: "Karras", description: "Better noise schedule, sharper results.", recommendation: "★★★★★ Recommended", rating: 5 },
  exponential: { name: "Exponential", description: "Smooth transitions.", recommendation: "★★★★☆ Smooth", rating: 4 },
  sgm_uniform: { name: "SGM Uniform", description: "Uniform steps, predictable.", recommendation: "★★★☆☆ Predictable", rating: 3 },
  simple: { name: "Simple", description: "Basic linear schedule.", recommendation: "★★☆☆☆ Basic", rating: 2 },
  ddim_uniform: { name: "DDIM Uniform", description: "For DDIM sampler.", recommendation: "★★★☆☆ DDIM only", rating: 3 },
  beta: { name: "Beta", description: "Beta distribution schedule.", recommendation: "★★★☆☆ Experimental", rating: 3 },
};

export const CFG_INFO: SettingInfo = {
  name: "CFG Scale",
  description: "How closely to follow the prompt. Higher = more literal, lower = more creative.",
  recommendation: "★★★★☆ 6-8 recommended. Above 10 can cause artifacts.",
};

export const STEPS_INFO: SettingInfo = {
  name: "Steps",
  description: "Number of denoising steps. More = better quality but slower.",
  recommendation: "★★★★☆ 20-30 for quality. 10-15 for speed.",
};

export const DENOISE_INFO: SettingInfo = {
  name: "Denoise Strength",
  description: "How much to change from input. Lower = more faithful to image.",
  recommendation: "★★★★☆ 0.5-0.7 recommended. Below 0.4 = minimal motion.",
};

export const VIDEO_SIZE_OPTIONS = [
  { value: "512x512", width: 512, height: 512, label: "512×512 (1:1)", description: "Square, fastest" },
  { value: "512x768", width: 512, height: 768, label: "512×768 (2:3)", description: "Portrait" },
  { value: "768x512", width: 768, height: 512, label: "768×512 (3:2)", description: "Landscape" },
  { value: "576x1024", width: 576, height: 1024, label: "576×1024 (9:16)", description: "Mobile/TikTok" },
  { value: "1024x576", width: 1024, height: 576, label: "1024×576 (16:9)", description: "Widescreen" },
  { value: "768x768", width: 768, height: 768, label: "768×768 (1:1)", description: "Large square" },
];

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
  motionLora: "none",
  motionLoraStrength: 0.8,
  width: 512,
  height: 512,
  format: "video/h264-mp4",
  quality: 19,
  pingpong: false,
};

// Built-in presets
export const VIDEO_PRESETS: VideoPreset[] = [
  {
    id: "5s-fast",
    name: "5s Fast (8GB)",
    description: "Optimized 5-second video for 8GB VRAM. ~15-20 min generation.",
    settings: {
      sampler: "euler",
      scheduler: "normal",
      steps: 8,
      cfgScale: 6,
      denoise: 0.5,
      frames: 30,
      frameRate: 6,
      motionModel: "v3_sd15_mm.ckpt",
      motionLora: "none",
      motionLoraStrength: 0.8,
      width: 512,
      height: 512,
      format: "video/h264-mp4",
      quality: 21,
      pingpong: false,
    },
  },
  {
    id: "fast",
    name: "Fast Preview",
    description: "Quick generation for previewing motion. Lower quality but fast.",
    settings: {
      sampler: "euler",
      scheduler: "normal",
      steps: 8,
      cfgScale: 6,
      denoise: 0.5,
      frames: 12,
      frameRate: 8,
      motionModel: "v3_sd15_mm.ckpt",
      motionLora: "none",
      motionLoraStrength: 0.8,
      width: 512,
      height: 512,
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
      motionLora: "none",
      motionLoraStrength: 0.8,
      width: 512,
      height: 512,
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
      motionLora: "none",
      motionLoraStrength: 0.8,
      width: 768,
      height: 768,
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
      motionLora: "none",
      motionLoraStrength: 0.8,
      width: 512,
      height: 512,
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
      motionLora: "none",
      motionLoraStrength: 0.8,
      width: 512,
      height: 512,
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
      motionLora: "none",
      motionLoraStrength: 0.8,
      width: 1024,
      height: 576,
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
