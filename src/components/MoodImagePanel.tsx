import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Image, Copy, Download, Wand2, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Theme {
  name: string;
  count?: number;
  intensity?: number;
  color: string;
}

interface MoodImagePanelProps {
  prompt: string;
  themes: Theme[];
  onPromptChange: (prompt: string) => void;
}

export function MoodImagePanel({ prompt, themes, onPromptChange }: MoodImagePanelProps) {
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    toast.success("Prompt copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const generateImage = async () => {
    if (!prompt.trim()) {
      toast.error("Please analyze lyrics first to generate a mood prompt");
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-image", {
        body: { prompt: prompt.trim() }
      });

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      setGeneratedImage(data.imageUrl);
      toast.success("Image generated successfully!");
    } catch (err) {
      console.error("Image generation error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to generate image");
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadImage = async () => {
    if (!generatedImage) return;
    
    try {
      const response = await fetch(generatedImage);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mood-image.webp";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success("Image downloaded!");
    } catch {
      toast.error("Failed to download image");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Themes Display */}
      {themes.length > 0 && (
        <Card className="p-4 glass-card border-border/50">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            🎭 Detected Themes
          </h3>
          <div className="flex flex-wrap gap-2">
            {themes.map((theme) => (
              <span
                key={theme.name}
                className={`px-3 py-1 rounded-full text-sm font-medium bg-gradient-to-r ${theme.color} text-primary-foreground`}
              >
                {theme.name} {theme.intensity ? `(${theme.intensity}/5)` : theme.count ? `(${theme.count})` : ""}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Mood Prompt */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Wand2 className="w-4 h-4" />
          AI Mood Prompt
        </label>
        <Textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Your mood prompt will appear here after analysis..."
          className="min-h-[120px] bg-muted/30 border-border focus:border-primary focus:ring-primary/20 resize-none font-mono text-sm"
        />
        <div className="flex gap-2">
          <Button variant="glass" size="sm" onClick={copyPrompt} disabled={!prompt}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied!" : "Copy"}
          </Button>
          <Button 
            variant="neon" 
            size="sm" 
            onClick={generateImage} 
            disabled={!prompt.trim() || isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Image className="w-4 h-4" />
                Generate Image
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Preview Area */}
      <Card className="aspect-video relative overflow-hidden glass-card border-border/50 group">
        {generatedImage ? (
          <>
            <img 
              src={generatedImage} 
              alt="Generated mood image" 
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="glass" size="sm" onClick={downloadImage}>
                <Download className="w-4 h-4" />
                Download
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
              <div className="w-16 h-16 rounded-2xl glass-card flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Image className="w-8 h-8" />
              </div>
              <p className="text-sm font-medium">Image Preview</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Click "Generate Image" to create visuals
              </p>
            </div>
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-secondary/10 rounded-full blur-3xl" />
          </>
        )}
      </Card>

      <Card className="p-4 glass-card border-border/50">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Powered by FLUX Schnell</h3>
        <ul className="text-sm text-muted-foreground/80 space-y-1">
          <li>• 720p (16:9) cinematic output</li>
          <li>• ~$0.003 per image</li>
          <li>• Fast 4-step inference</li>
        </ul>
      </Card>
    </div>
  );
}
