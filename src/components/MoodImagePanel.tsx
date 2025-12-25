import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Image, Copy, Download, Wand2, Check, Loader2, Video, Play, Cpu, Cloud } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { useComfyUI } from "@/hooks/useComfyUI";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  
  // Video generation state
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [videoPrompt, setVideoPrompt] = useState("cinematic motion, slow camera movement, atmospheric");
  const [videoPreviewOpen, setVideoPreviewOpen] = useState(false);

  // Settings and ComfyUI integration
  const { inferenceMode, isComfyUIConnected } = useSettings();
  const { generateImage: generateLocalImage, progress: localProgress } = useComfyUI();

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
      const useLocalGeneration = inferenceMode === "local" || 
        (inferenceMode === "hybrid" && isComfyUIConnected);

      if (useLocalGeneration) {
        // Use local ComfyUI
        toast.info("Generating with local ComfyUI...");
        const result = await generateLocalImage(prompt.trim(), {
          width: 1280,
          height: 720,
        });
        setGeneratedImage(result.imageUrl);
        toast.success(`Image generated locally! (seed: ${result.seed})`);
      } else {
        // Use cloud (Replicate)
        const { data, error } = await supabase.functions.invoke("generate-image", {
          body: { prompt: prompt.trim() }
        });

        if (error) throw new Error(error.message);
        if (data.error) throw new Error(data.error);

        setGeneratedImage(data.imageUrl);
        toast.success("Image generated via cloud!");
      }
      
      setGeneratedVideo(null); // Reset video when new image is generated
    } catch (err) {
      console.error("Image generation error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to generate image");
    } finally {
      setIsGenerating(false);
    }
  };

  const pollForVideoCompletion = async (taskId: string): Promise<string> => {
    const maxAttempts = 120; // 10 minutes max (5s intervals)
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      const { data, error } = await supabase.functions.invoke("generate-video", {
        body: { taskId }
      });
      
      if (error) throw new Error(error.message);
      
      if (data.status === "succeeded" && data.videoUrl) {
        return data.videoUrl;
      } else if (data.status === "failed") {
        throw new Error(data.error || "Video generation failed");
      }
      
      attempts++;
      console.log(`Polling attempt ${attempts}: status = ${data.status}`);
    }
    
    throw new Error("Video generation timed out");
  };

  const generateVideo = async () => {
    if (!generatedImage) {
      toast.error("Please generate an image first");
      return;
    }

    setIsGeneratingVideo(true);
    try {
      // Start async generation
      const { data, error } = await supabase.functions.invoke("generate-video", {
        body: { 
          imageUrl: generatedImage,
          prompt: videoPrompt,
          duration: 3
        }
      });

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      toast.info("Video generation started, this may take a few minutes...");
      
      // Poll for completion
      const videoUrl = await pollForVideoCompletion(data.taskId);
      setGeneratedVideo(videoUrl);
      toast.success("Video generated successfully!");
    } catch (err) {
      console.error("Video generation error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to generate video");
    } finally {
      setIsGeneratingVideo(false);
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

  const downloadVideo = async () => {
    if (!generatedVideo) return;
    
    try {
      const response = await fetch(generatedVideo);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mood-video.mp4";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success("Video downloaded!");
    } catch {
      toast.error("Failed to download video");
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
            title={inferenceMode === "local" ? "Using local ComfyUI" : inferenceMode === "hybrid" ? "Hybrid mode" : "Using cloud"}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {inferenceMode === "local" || (inferenceMode === "hybrid" && isComfyUIConnected) 
                  ? `Local ${localProgress > 0 ? `(${Math.round(localProgress)}%)` : "..."}` 
                  : "Cloud..."}
              </>
            ) : (
              <>
                {inferenceMode === "local" || (inferenceMode === "hybrid" && isComfyUIConnected) ? (
                  <Cpu className="w-4 h-4" />
                ) : (
                  <Cloud className="w-4 h-4" />
                )}
                Generate Image
              </>
            )}
          </Button>
          
          {/* Mode indicator */}
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            {inferenceMode === "local" ? (
              <>
                <Cpu className="w-3 h-3" />
                Local
              </>
            ) : inferenceMode === "hybrid" ? (
              <>
                {isComfyUIConnected ? <Cpu className="w-3 h-3 text-green-500" /> : <Cloud className="w-3 h-3" />}
                {isComfyUIConnected ? "Local" : "Cloud"}
              </>
            ) : (
              <>
                <Cloud className="w-3 h-3" />
                Cloud
              </>
            )}
          </span>
        </div>
      </div>

      {/* Image Preview Area */}
      <Card className="aspect-video relative overflow-hidden glass-card border-border/50 group">
        {generatedImage ? (
          <>
            <img 
              src={generatedImage} 
              alt="Generated mood image" 
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
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

      {/* Video Generation Section */}
      {generatedImage && (
        <Card className="p-4 glass-card border-border/50 space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Video className="w-4 h-4" />
            Generate Video from Image
          </h3>
          
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground/60">Motion Prompt</label>
            <Input
              value={videoPrompt}
              onChange={(e) => setVideoPrompt(e.target.value)}
              placeholder="cinematic motion, slow camera movement..."
              className="font-mono text-sm bg-muted/30"
            />
          </div>

          <div className="flex gap-2">
            <Button 
              variant="neon" 
              size="sm" 
              onClick={generateVideo} 
              disabled={isGeneratingVideo}
            >
              {isGeneratingVideo ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating Video...
                </>
              ) : (
                <>
                  <Video className="w-4 h-4" />
                  Generate Video
                </>
              )}
            </Button>
            
            {generatedVideo && (
              <>
                <Button variant="glass" size="sm" onClick={() => setVideoPreviewOpen(true)}>
                  <Play className="w-4 h-4" />
                  Preview
                </Button>
                <Button variant="glass" size="sm" onClick={downloadVideo}>
                  <Download className="w-4 h-4" />
                  Download
                </Button>
              </>
            )}
          </div>

          {/* Video Thumbnail Preview */}
          {generatedVideo && (
            <div 
              className="relative aspect-video rounded-lg overflow-hidden cursor-pointer group"
              onClick={() => setVideoPreviewOpen(true)}
            >
              <video 
                src={generatedVideo} 
                className="w-full h-full object-cover"
                muted
                loop
                playsInline
                onMouseEnter={(e) => e.currentTarget.play()}
                onMouseLeave={(e) => {
                  e.currentTarget.pause();
                  e.currentTarget.currentTime = 0;
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center bg-background/20 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-12 h-12 rounded-full bg-primary/80 flex items-center justify-center">
                  <Play className="w-6 h-6 text-primary-foreground fill-current" />
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Video Preview Dialog */}
      <Dialog open={videoPreviewOpen} onOpenChange={setVideoPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Video Preview</DialogTitle>
          </DialogHeader>
          {generatedVideo && (
            <div className="space-y-4">
              <video 
                src={generatedVideo} 
                controls 
                autoPlay
                loop
                className="w-full rounded-lg"
              />
              <div className="flex justify-end gap-2">
                <Button variant="glass" onClick={downloadVideo}>
                  <Download className="w-4 h-4" />
                  Download Video
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card className="p-4 glass-card border-border/50">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">
          {inferenceMode === "cloud" ? "Powered by FLUX & WAN 2.1 (Cloud)" : 
           inferenceMode === "local" ? "Powered by Local ComfyUI" :
           "Hybrid Mode: Local + Cloud"}
        </h3>
        <ul className="text-sm text-muted-foreground/80 space-y-1">
          {inferenceMode === "local" || (inferenceMode === "hybrid" && isComfyUIConnected) ? (
            <>
              <li>• FLUX.1 Schnell (GGUF): Local 720p images</li>
              <li>• Your RTX 4060 does all the work</li>
              <li>• No cloud costs for image generation</li>
            </>
          ) : (
            <>
              <li>• FLUX Schnell: 720p (16:9) cinematic images</li>
              <li>• WAN 2.1 I2V: Image-to-video animation</li>
            </>
          )}
          <li>• Up to 81 frames (~3.4 seconds at 24fps)</li>
          <li>• Hover video thumbnail to preview</li>
        </ul>
      </Card>
    </div>
  );
}
