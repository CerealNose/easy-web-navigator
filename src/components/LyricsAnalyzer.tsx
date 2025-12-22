import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Sparkles, FileText, Zap } from "lucide-react";

interface Theme {
  name: string;
  count: number;
  color: string;
}

interface LyricsAnalyzerProps {
  onAnalyze: (prompt: string, themes: Theme[]) => void;
}

export function LyricsAnalyzer({ onAnalyze }: LyricsAnalyzerProps) {
  const [lyrics, setLyrics] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const analyzeLyrics = () => {
    if (!lyrics.trim()) return;
    
    setIsAnalyzing(true);
    
    // Simulate analysis
    setTimeout(() => {
      const lowerLyrics = lyrics.toLowerCase();
      const themes: Theme[] = [
        { name: "love", count: (lowerLyrics.match(/love/g) || []).length, color: "from-pink-500 to-red-500" },
        { name: "heart", count: (lowerLyrics.match(/heart/g) || []).length, color: "from-red-500 to-orange-500" },
        { name: "night", count: (lowerLyrics.match(/night/g) || []).length, color: "from-indigo-500 to-purple-500" },
        { name: "dream", count: (lowerLyrics.match(/dream/g) || []).length, color: "from-purple-500 to-pink-500" },
        { name: "soul", count: (lowerLyrics.match(/soul/g) || []).length, color: "from-cyan-500 to-blue-500" },
      ].filter(t => t.count > 0);

      const moodPrompt = `moody neon city night, glowing red heart on chain leash, rainy street reflection, emotional silhouette, cinematic lighting, 720p, emotional distance, urban isolation, blue purple neon glow`;
      
      onAnalyze(moodPrompt, themes);
      setIsAnalyzing(false);
    }, 1500);
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
          AI-powered theme detection
        </div>
      </div>

      <Card className="p-4 glass-card border-border/50">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">How it works</h3>
        <ul className="text-sm text-muted-foreground/80 space-y-1">
          <li>• Paste your song lyrics above</li>
          <li>• AI detects emotional themes & keywords</li>
          <li>• Generates a cinematic mood prompt</li>
          <li>• Use the prompt to create matching visuals</li>
        </ul>
      </Card>
    </div>
  );
}
