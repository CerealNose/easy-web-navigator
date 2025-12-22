import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Sparkles, FileText, Zap, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Theme {
  name: string;
  intensity?: number;
  count?: number;
  color: string;
}

interface LyricsAnalyzerProps {
  onAnalyze: (prompt: string, themes: Theme[]) => void;
}

export function LyricsAnalyzer({ onAnalyze }: LyricsAnalyzerProps) {
  const [lyrics, setLyrics] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeLyrics = async () => {
    if (!lyrics.trim()) return;
    
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke("analyze-lyrics", {
        body: { lyrics: lyrics.trim() }
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      const themes: Theme[] = (data.themes || []).map((t: { name: string; intensity?: number; color?: string }) => ({
        name: t.name,
        intensity: t.intensity || 3,
        color: t.color || "from-purple-500 to-pink-500"
      }));

      onAnalyze(data.moodPrompt || "", themes);
      toast.success("Lyrics analyzed successfully!");
    } catch (err) {
      console.error("Analysis error:", err);
      setError(err instanceof Error ? err.message : "Failed to analyze lyrics");
      toast.error("Failed to analyze lyrics");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <FileText className="w-4 h-4" />
          Paste your lyrics
        </label>
        <Textarea
          placeholder="Enter your song lyrics here...

Example:
Being cautious with my heart
Late nights in the city glow
Love echoes through the streets..."
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          className="min-h-[200px] bg-muted/30 border-border focus:border-primary focus:ring-primary/20 resize-none font-mono text-sm"
        />
      </div>

      {error && (
        <Card className="p-3 border-destructive/50 bg-destructive/10">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        </Card>
      )}

      <div className="flex items-center gap-4">
        <Button
          onClick={analyzeLyrics}
          disabled={!lyrics.trim() || isAnalyzing}
          variant="neon"
          size="lg"
          className="flex-1 sm:flex-none"
        >
          {isAnalyzing ? (
            <>
              <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Analyze Lyrics
            </>
          )}
        </Button>

        <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
          <Zap className="w-4 h-4 text-secondary" />
          Real AI-powered analysis
        </div>
      </div>

      <Card className="p-4 glass-card border-border/50">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">How it works</h3>
        <ul className="text-sm text-muted-foreground/80 space-y-1">
          <li>• Paste your song lyrics above</li>
          <li>• AI detects emotional themes & moods</li>
          <li>• Generates a cinematic image prompt</li>
          <li>• Use the prompt to create matching visuals</li>
        </ul>
      </Card>
    </div>
  );
}
