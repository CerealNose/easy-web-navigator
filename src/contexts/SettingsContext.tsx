import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type InferenceMode = "cloud" | "hybrid" | "local";

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

  // Load settings from localStorage on mount - migrate old configs
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
            localStorage.setItem(
              SETTINGS_STORAGE_KEY,
              JSON.stringify({ inferenceMode: parsed.inferenceMode || "cloud", comfyUIConfig: newConfig })
            );
          } else if (config.baseUrl) {
            setComfyUIConfigState({
              baseUrl: config.baseUrl,
              selectedCheckpoint: config.selectedCheckpoint || null,
            });
          }
        }
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }, []);

  // Save settings to localStorage when they change
  const saveSettings = (mode: InferenceMode, config: ComfyUIConfig) => {
    try {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ inferenceMode: mode, comfyUIConfig: config })
      );
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  };

  const setInferenceMode = (mode: InferenceMode) => {
    setInferenceModeState(mode);
    saveSettings(mode, comfyUIConfig);
  };

  const setComfyUIConfig = (config: ComfyUIConfig) => {
    setComfyUIConfigState(config);
    saveSettings(inferenceMode, config);
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
