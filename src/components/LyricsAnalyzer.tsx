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

interface Section {
  name: string;
  text: string;
}

interface SectionPrompt {
  section: string;
  prompt: string;
  narrativeBeat?: string;
}

interface Storyline {
  summary: string;
  protagonist: string;
  setting: string;
  emotionalArc: string;
  visualMotifs: string[];
}

interface LyricsAnalyzerProps {
  onAnalyze: (prompt: string, themes: Theme[], sections: Section[], sectionPrompts: SectionPrompt[], storyline?: Storyline) => void;
}

// Parse [Section] markers from lyrics
function parseSections(lyrics: string): Section[] {
  const sections: Section[] = [];
  const regex = /\[([^\]]+)\]\s*([\s\S]*?)(?=\[|$)/g;
  let match;
  
  while ((match = regex.exec(lyrics)) !== null) {
    const name = match[1].trim();
    const text = match[2].trim();
    if (text) {
      sections.push({ name, text });
    }
  }
  
  // If no sections found, treat entire lyrics as one section
  if (sections.length === 0 && lyrics.trim()) {
    sections.push({ name: "Verse", text: lyrics.trim() });
  }
  
  return sections;
}

export function LyricsAnalyzer({ onAnalyze }: LyricsAnalyzerProps) {
  const [lyrics, setLyrics] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedSections, setDetectedSections] = useState<Section[]>([]);

  const handleLyricsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newLyrics = e.target.value;
    setLyrics(newLyrics);
    
    // Parse sections in real-time
    const sections = parseSections(newLyrics);
    setDetectedSections(sections);
  };

  const analyzeLyrics = async () => {
    if (!lyrics.trim()) return;
    
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const sections = parseSections(lyrics);
      
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

      const sectionPrompts: SectionPrompt[] = data.sectionPrompts || [];
      const storyline: Storyline | undefined = data.storyline;
      
      console.log("Generated storyline:", storyline);
      
      onAnalyze(data.moodPrompt || "", themes, sections, sectionPrompts, storyline);
      toast.success(`Analyzed ${sections.length} sections with storyline!`);
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
          Paste your lyrics (use [Section] markers for smart prompts)
        </label>
        <Textarea
          placeholder="Enter your song lyrics with section markers...

Example:
[Verse 1]
Being cautious with my heart
Late nights in the city glow

[Chorus]
Love echoes through the streets
Neon signs reflect my soul

[Bridge]
When the night falls down..."
          value={lyrics}
          onChange={handleLyricsChange}
          className="min-h-[200px] bg-muted/30 border-border focus:border-primary focus:ring-primary/20 resize-none font-mono text-sm"
        />
      </div>

      {/* Detected Sections Preview */}
      {detectedSections.length > 0 && (
        <Card className="p-3 glass-card border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-muted-foreground">Detected Sections:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {detectedSections.map((section, index) => (
              <span
                key={index}
                className="px-2 py-1 text-xs rounded-md bg-primary/20 text-primary border border-primary/30"
              >
                [{section.name}] - {section.text.split('\n').length} lines
              </span>
            ))}
          </div>
        </Card>
      )}

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
          <li>• Paste your song lyrics with [Section] markers</li>
          <li>• AI detects emotional themes & moods</li>
          <li>• Sections are matched to timestamps for smart prompts</li>
          <li>• Generate images/videos with section-aware styling</li>
        </ul>
      </Card>
    </div>
  );
}
