import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { 
  Upload, 
  Play, 
  Download, 
  Loader2, 
  ImageIcon, 
  Film, 
  Clock, 
  Trash2,
  Plus,
  Sparkles
} from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/contexts/SettingsContext";
import { useComfyUI } from "@/hooks/useComfyUI";
import { useWanVideo } from "@/hooks/useWanVideo";
import { useVideoStitcher } from "@/hooks/useVideoStitcher";

interface Scene {
  id: string;
  imageUrl: string;
  imageFile?: File;
  prompt: string;
  duration: number; // seconds
  videoUrl?: string;
  status: 'pending' | 'generating' | 'complete' | 'error';
}

export function SimpleVideoPanel() {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);

  const { isComfyUIConnected, comfyUIConfig } = useSettings();
  const { generateImage, isGenerating: isGeneratingImage, progress: imageProgress } = useComfyUI();
  const { generateVideo, isGenerating: isGeneratingVideo, progress: videoProgress, progressMessage } = useWanVideo();
  const { stitchVideos, isStitching, progress: stitchProgress } = useVideoStitcher();

  // Add image from file
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newScenes: Scene[] = [];
    
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const imageUrl = event.target?.result as string;
        newScenes.push({
          id: `scene_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          imageUrl,
          imageFile: file,
          prompt: "",
          duration: 5,
          status: 'pending'
        });
        
        if (newScenes.length === files.length) {
          setScenes(prev => [...prev, ...newScenes]);
        }
      };
      reader.readAsDataURL(file);
    });
    
    e.target.value = '';
  }, []);

  // Generate image for a scene using ComfyUI
  const handleGenerateImage = useCallback(async (sceneId: string) => {
    if (!isComfyUIConnected) {
      toast.error("ComfyUI not connected. Check Settings.");
      return;
    }

    const scene = scenes.find(s => s.id === sceneId);
    if (!scene || !scene.prompt.trim()) {
      toast.error("Enter a prompt first");
      return;
    }

    try {
      const result = await generateImage(scene.prompt, {
        width: 832,
        height: 480
      });

      if (result?.imageUrl) {
        setScenes(prev => prev.map(s => 
          s.id === sceneId ? { ...s, imageUrl: result.imageUrl } : s
        ));
        toast.success("Image generated!");
      }
    } catch (err) {
      toast.error("Image generation failed");
    }
  }, [isComfyUIConnected, scenes, generateImage]);

  // Update scene
  const updateScene = useCallback((sceneId: string, updates: Partial<Scene>) => {
    setScenes(prev => prev.map(s => 
      s.id === sceneId ? { ...s, ...updates } : s
    ));
  }, []);

  // Remove scene
  const removeScene = useCallback((sceneId: string) => {
    setScenes(prev => prev.filter(s => s.id !== sceneId));
  }, []);

  // Add empty scene
  const addEmptyScene = useCallback(() => {
    setScenes(prev => [...prev, {
      id: `scene_${Date.now()}`,
      imageUrl: "",
      prompt: "",
      duration: 5,
      status: 'pending'
    }]);
  }, []);

  // Generate all videos
  const handleGenerateAllVideos = useCallback(async () => {
    if (!isComfyUIConnected) {
      toast.error("ComfyUI not connected");
      return;
    }

    const scenesWithImages = scenes.filter(s => s.imageUrl);
    if (scenesWithImages.length === 0) {
      toast.error("Add images first");
      return;
    }

    setIsGenerating(true);
    setFinalVideoUrl(null);

    try {
      const videoUrls: string[] = [];

      for (let i = 0; i < scenesWithImages.length; i++) {
        const scene = scenesWithImages[i];
        setCurrentSceneIndex(i);
        
        // Update status
        setScenes(prev => prev.map(s => 
          s.id === scene.id ? { ...s, status: 'generating' } : s
        ));

        toast.info(`Generating video ${i + 1}/${scenesWithImages.length}...`);

        const result = await generateVideo(scene.imageUrl, scene.prompt || "smooth motion, cinematic", {
          duration: scene.duration,
          width: 832,
          height: 480
        });

        if (result?.videoUrl) {
          videoUrls.push(result.videoUrl);
          setScenes(prev => prev.map(s => 
            s.id === scene.id ? { ...s, videoUrl: result.videoUrl, status: 'complete' } : s
          ));
        } else {
          setScenes(prev => prev.map(s => 
            s.id === scene.id ? { ...s, status: 'error' } : s
          ));
        }
      }

      // Stitch videos together
      if (videoUrls.length > 1) {
        toast.info("Stitching videos together...");
        const stitchedResult = await stitchVideos(videoUrls);
        if (stitchedResult?.url) {
          setFinalVideoUrl(stitchedResult.url);
          toast.success("Video complete!");
        }
      } else if (videoUrls.length === 1) {
        setFinalVideoUrl(videoUrls[0]);
        toast.success("Video complete!");
      }

    } catch (err) {
      console.error("Generation error:", err);
      toast.error("Video generation failed");
    } finally {
      setIsGenerating(false);
    }
  }, [isComfyUIConnected, scenes, generateVideo, stitchVideos]);

  // Download final video
  const handleDownload = useCallback(() => {
    if (!finalVideoUrl) return;
    
    const a = document.createElement('a');
    a.href = finalVideoUrl;
    a.download = `music_video_${Date.now()}.mp4`;
    a.click();
  }, [finalVideoUrl]);

  // Calculate total duration
  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
  const formattedDuration = `${Math.floor(totalDuration / 60)}:${String(totalDuration % 60).padStart(2, '0')}`;

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Simple Video Generator</h2>
          <p className="text-sm text-muted-foreground">
            Upload images → Set durations → Generate video clips → Auto-stitch
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${isComfyUIConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm">{isComfyUIConnected ? 'ComfyUI Connected' : 'Not Connected'}</span>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-1">
          <ImageIcon className="h-4 w-4" />
          <span>{scenes.length} scenes</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-4 w-4" />
          <span>{formattedDuration} total</span>
        </div>
      </div>

      {/* Upload area */}
      <div className="flex gap-2">
        <label className="flex-1">
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleImageUpload}
            className="hidden"
          />
          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors">
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drop images or click to upload
            </p>
          </div>
        </label>
        <Button variant="outline" onClick={addEmptyScene}>
          <Plus className="h-4 w-4 mr-2" />
          Add Scene
        </Button>
      </div>

      {/* Scenes list */}
      <div className="space-y-4">
        {scenes.map((scene, index) => (
          <Card key={scene.id} className="p-4">
            <div className="flex gap-4">
              {/* Image preview or placeholder */}
              <div className="w-40 h-24 bg-muted rounded-md overflow-hidden flex-shrink-0">
                {scene.imageUrl ? (
                  <img 
                    src={scene.imageUrl} 
                    alt={`Scene ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-8 w-8" />
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Scene {index + 1}</span>
                  {scene.status === 'generating' && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  )}
                  {scene.status === 'complete' && (
                    <span className="text-xs text-green-500">✓ Complete</span>
                  )}
                  {scene.status === 'error' && (
                    <span className="text-xs text-red-500">Error</span>
                  )}
                </div>

                {/* Prompt input */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Scene prompt (motion description)..."
                    value={scene.prompt}
                    onChange={(e) => updateScene(scene.id, { prompt: e.target.value })}
                    className="flex-1"
                  />
                  {!scene.imageUrl && (
                    <Button 
                      size="sm" 
                      variant="secondary"
                      onClick={() => handleGenerateImage(scene.id)}
                      disabled={isGeneratingImage || !scene.prompt.trim()}
                    >
                      <Sparkles className="h-4 w-4 mr-1" />
                      Generate
                    </Button>
                  )}
                </div>

                {/* Duration slider */}
                <div className="flex items-center gap-3">
                  <Label className="text-xs text-muted-foreground w-16">Duration:</Label>
                  <Slider
                    value={[scene.duration]}
                    onValueChange={([val]) => updateScene(scene.id, { duration: val })}
                    min={3}
                    max={10}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-sm w-8">{scene.duration}s</span>
                </div>
              </div>

              {/* Remove button */}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => removeScene(scene.id)}
                className="flex-shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Progress */}
      {isGenerating && (
        <Card className="p-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>
                {isGeneratingVideo 
                  ? `Generating scene ${currentSceneIndex + 1}/${scenes.length}: ${progressMessage}`
                  : isStitching 
                    ? `Stitching: ${stitchProgress?.stage || 'Processing'}`
                    : 'Preparing...'}
              </span>
              <span>{isGeneratingVideo ? videoProgress : isStitching ? (stitchProgress?.percent || 0) : 0}%</span>
            </div>
            <Progress value={isGeneratingVideo ? videoProgress : isStitching ? (stitchProgress?.percent || 0) : 0} />
          </div>
        </Card>
      )}

      {/* Generate button */}
      <div className="flex gap-3">
        <Button
          size="lg"
          className="flex-1"
          onClick={handleGenerateAllVideos}
          disabled={isGenerating || scenes.length === 0 || !scenes.some(s => s.imageUrl)}
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Film className="h-5 w-5 mr-2" />
              Generate {scenes.filter(s => s.imageUrl).length} Video Clips
            </>
          )}
        </Button>

        {finalVideoUrl && (
          <Button size="lg" variant="outline" onClick={handleDownload}>
            <Download className="h-5 w-5 mr-2" />
            Download
          </Button>
        )}
      </div>

      {/* Final video preview */}
      {finalVideoUrl && (
        <Card className="p-4">
          <h3 className="font-medium mb-2">Final Video</h3>
          <video 
            src={finalVideoUrl} 
            controls 
            className="w-full rounded-md"
          />
        </Card>
      )}

      {/* WAN Model Setup Info */}
      <Card className="p-4 bg-muted/50">
        <h3 className="font-medium mb-2">WAN Model Setup</h3>
        <p className="text-sm text-muted-foreground mb-3">
          For image-to-video generation, install these models in your ComfyUI:
        </p>
        <pre className="text-xs bg-background p-3 rounded overflow-x-auto">
{`ComfyUI/models/
├── diffusion_models/
│   └── wan2.1_i2v_480p_14B_fp8_scaled.safetensors
├── text_encoders/
│   └── umt5_xxl_fp8_e4m3fn_scaled.safetensors
├── vae/
│   └── wan_2.1_vae.safetensors
└── clip_vision/
    └── clip_vision_h.safetensors`}
        </pre>
        <p className="text-xs text-muted-foreground mt-2">
          Download from: <code className="bg-background px-1 rounded">Comfy-Org/Wan_2.1_ComfyUI_repackaged</code> on Hugging Face
        </p>
      </Card>
    </div>
  );
}
