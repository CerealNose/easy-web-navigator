import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type InferenceMode = "cloud" | "hybrid" | "local";

interface ComfyUIConfig {
  host: string;
  port: number;
}

interface SettingsContextType {
  inferenceMode: InferenceMode;
  setInferenceMode: (mode: InferenceMode) => void;
  comfyUIConfig: ComfyUIConfig;
  setComfyUIConfig: (config: ComfyUIConfig) => void;
  isComfyUIConnected: boolean;
  setIsComfyUIConnected: (connected: boolean) => void;
  checkComfyUIConnection: () => Promise<boolean>;
}

const defaultComfyUIConfig: ComfyUIConfig = {
  host: "192.168.68.113",
  port: 8188,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const SETTINGS_STORAGE_KEY = "lyricvision_settings";

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [inferenceMode, setInferenceModeState] = useState<InferenceMode>("cloud");
  const [comfyUIConfig, setComfyUIConfigState] = useState<ComfyUIConfig>(defaultComfyUIConfig);
  const [isComfyUIConnected, setIsComfyUIConnected] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.inferenceMode) setInferenceModeState(parsed.inferenceMode);
        if (parsed.comfyUIConfig) setComfyUIConfigState(parsed.comfyUIConfig);
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
      const comfyUrl = `http://${comfyUIConfig.host}:${comfyUIConfig.port}`;
      
      // Use the proxy edge function to check connection
      const { data, error } = await supabase.functions.invoke('comfyui-proxy', {
        body: { action: 'system_stats', comfyUrl }
      });
      
      if (error || data?.error) {
        console.error('ComfyUI connection check failed:', error || data?.error);
        setIsComfyUIConnected(false);
        return false;
      }
      
      setIsComfyUIConnected(true);
      return true;
    } catch (err) {
      console.error('ComfyUI connection check error:', err);
      setIsComfyUIConnected(false);
      return false;
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
