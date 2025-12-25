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

  // Load settings from localStorage on mount - migrate stale localhost configs
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.inferenceMode) setInferenceModeState(parsed.inferenceMode);
        
        // Migrate stale localhost config to the new default IP
        if (parsed.comfyUIConfig) {
          const config = parsed.comfyUIConfig;
          if (config.host === "localhost" || config.host === "127.0.0.1") {
            // Update to the new default and save
            console.log("Migrating ComfyUI config from localhost to", defaultComfyUIConfig.host);
            setComfyUIConfigState(defaultComfyUIConfig);
            localStorage.setItem(
              SETTINGS_STORAGE_KEY,
              JSON.stringify({ inferenceMode: parsed.inferenceMode || "cloud", comfyUIConfig: defaultComfyUIConfig })
            );
          } else {
            setComfyUIConfigState(config);
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
    const tryCheck = async (host: string, port: number) => {
      const comfyUrl = `http://${host}:${port}`;
      const { data, error } = await supabase.functions.invoke("comfyui-proxy", {
        body: { action: "system_stats", comfyUrl },
      });

      if (error || data?.error) {
        throw new Error((data?.error as string) || error?.message || "Connection check failed");
      }

      return true;
    };

    try {
      // 1) Try the currently configured host first
      await tryCheck(comfyUIConfig.host, comfyUIConfig.port);
      setIsComfyUIConnected(true);
      return true;
    } catch (err) {
      // 2) If user has stale saved config pointing to localhost, try the new default IP once
      const shouldFallback =
        comfyUIConfig.host === "localhost" &&
        defaultComfyUIConfig.host !== "localhost" &&
        (defaultComfyUIConfig.host !== comfyUIConfig.host || defaultComfyUIConfig.port !== comfyUIConfig.port);

      if (shouldFallback) {
        try {
          await tryCheck(defaultComfyUIConfig.host, defaultComfyUIConfig.port);
          setComfyUIConfigState(defaultComfyUIConfig);
          saveSettings(inferenceMode, defaultComfyUIConfig);
          setIsComfyUIConnected(true);
          return true;
        } catch (fallbackErr) {
          console.error("ComfyUI connection check failed (fallback also failed):", fallbackErr);
        }
      }

      console.error("ComfyUI connection check failed:", err);
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
