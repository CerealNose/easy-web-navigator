import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Image, Copy, Download, Wand2, Check } from "lucide-react";
import { toast } from "sonner";

interface Theme {
  name: string;
  count: number;
  color: string;
}

interface MoodImagePanelProps {
  prompt: string;
  themes: Theme[];
  onPromptChange: (prompt: string) => void;
}

export function MoodImagePanel({ prompt, themes, onPromptChange }: MoodImagePanelProps) {
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    toast.success("Prompt copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
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
                {theme.name} ({theme.count})
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
          <Button variant="glass" size="sm" onClick={copyPrompt}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      </div>

      {/* Preview Area */}
      <Card className="aspect-video relative overflow-hidden glass-card border-border/50 group">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
          <div className="w-16 h-16 rounded-2xl glass-card flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Image className="w-8 h-8" />
          </div>
          <p className="text-sm font-medium">Image Preview</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Connect an image API to generate visuals
          </p>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-secondary/10 rounded-full blur-3xl" />
      </Card>

      <Card className="p-4 glass-card border-border/50">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Next Steps</h3>
        <ul className="text-sm text-muted-foreground/80 space-y-1">
          <li>• Copy the mood prompt above</li>
          <li>• Use it with Flux, DALL-E, or Midjourney</li>
          <li>• Download the generated image</li>
          <li>• Proceed to timestamps for video sync</li>
        </ul>
      </Card>
    </div>
  );
}
