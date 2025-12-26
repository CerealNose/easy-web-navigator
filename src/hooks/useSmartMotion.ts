import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SmartMotionSuggestion {
  motion: string;
  reason: string;
  strength: number;
}

// Map AI motion names to LoRA filenames
const MOTION_TO_LORA: Record<string, string> = {
  'PanLeft': 'v2_lora_PanLeft.ckpt',
  'PanRight': 'v2_lora_PanRight.ckpt',
  'ZoomIn': 'v2_lora_ZoomIn.ckpt',
  'ZoomOut': 'v2_lora_ZoomOut.ckpt',
  'TiltUp': 'v2_lora_TiltUp.ckpt',
  'TiltDown': 'v2_lora_TiltDown.ckpt',
  'RollingClockwise': 'v2_lora_RollingClockwise.ckpt',
  'RollingAnticlockwise': 'v2_lora_RollingAnticlockwise.ckpt',
};

export function useSmartMotion() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastSuggestion, setLastSuggestion] = useState<SmartMotionSuggestion | null>(null);

  const suggestMotion = useCallback(async (prompt: string): Promise<SmartMotionSuggestion | null> => {
    if (!prompt.trim()) {
      return null;
    }

    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-motion', {
        body: { prompt }
      });

      if (error) {
        console.error('Error suggesting motion:', error);
        toast.error('Failed to analyze prompt for motion');
        return null;
      }

      if (data.error) {
        console.error('Motion suggestion error:', data.error);
        toast.error(data.error);
        return null;
      }

      const suggestion: SmartMotionSuggestion = {
        motion: data.motion,
        reason: data.reason,
        strength: Math.min(1, Math.max(0.4, data.strength || 0.7))
      };

      setLastSuggestion(suggestion);
      return suggestion;
    } catch (err) {
      console.error('Failed to suggest motion:', err);
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // Convert AI motion name to LoRA filename
  const getLoraFilename = useCallback((motionName: string): string => {
    return MOTION_TO_LORA[motionName] || 'v2_lora_ZoomIn.ckpt';
  }, []);

  // Resolve "auto" motion to actual LoRA based on prompt
  const resolveMotion = useCallback(async (
    currentMotion: string, 
    prompt: string
  ): Promise<{ lora: string; strength: number; reason?: string }> => {
    // If not auto, return as-is
    if (currentMotion !== 'auto') {
      return { lora: currentMotion, strength: 0.7 };
    }

    // Analyze with AI
    const suggestion = await suggestMotion(prompt);
    
    if (!suggestion) {
      // Fallback to ZoomIn if AI fails
      return { lora: 'v2_lora_ZoomIn.ckpt', strength: 0.7, reason: 'Default (AI unavailable)' };
    }

    const lora = getLoraFilename(suggestion.motion);
    toast.success(`Smart Motion: ${suggestion.motion}`, {
      description: suggestion.reason
    });

    return { 
      lora, 
      strength: suggestion.strength, 
      reason: suggestion.reason 
    };
  }, [suggestMotion, getLoraFilename]);

  return {
    isAnalyzing,
    lastSuggestion,
    suggestMotion,
    resolveMotion,
    getLoraFilename
  };
}
