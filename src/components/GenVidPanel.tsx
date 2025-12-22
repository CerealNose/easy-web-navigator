import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Video, Play, Download, Settings, Loader2, ImageIcon, Film, Clock, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Section {
  name: string;
  text: string;
}

interface Timestamp {
  time: string;
  text: string;
  start: number;
  end: number;
  section?: string;
}

interface GeneratedScene {
  section: string;
  prompt: string;
  duration: number;
  imageUrl?: string;
  videoUrl?: string;
  status: 'pending' | 'generating-image' | 'generating-video' | 'complete' | 'error';
}

interface GenVidPanelProps {
  sections: Section[];
  timestamps: Timestamp[];
}

const STYLE_PRESETS = {
  cinematic: { label: "Cinematic", prefix: "cinematic scene, moody lighting, film grain, 35mm" },
  anime: { label: "Anime", prefix: "anime style, studio ghibli, soft lighting, detailed" },
  abstract: { label: "Abstract", prefix: "abstract art, flowing colors, ethereal, artistic" },
  noir: { label: "Film Noir", prefix: "film noir, black and white, dramatic shadows, 1940s" },
  cyberpunk: { label: "Cyberpunk", prefix: "cyberpunk, neon lights, rain, blade runner style" },
  dreamy: { label: "Dreamy", prefix: "dreamy surreal, soft focus, pastel colors, magical" },
  nature: { label: "Nature", prefix: "nature cinematic, golden hour, serene landscape" },
  retro: { label: "Retro VHS", prefix: "retro VHS aesthetic, scan lines, 80s style, analog" },
};

const MOTION_PRESETS = {
  slow: { label: "Slow & Smooth", prompt: "slow camera movement, smooth pan, atmospheric" },
  dynamic: { label: "Dynamic", prompt: "dynamic camera movement, action-oriented" },
  static: { label: "Static", prompt: "still camera, minimal movement, contemplative" },
  zoom: { label: "Slow Zoom", prompt: "slow zoom in, focus on details, cinematic" },
};

export function GenVidPanel({ sections, timestamps }: GenVidPanelProps) {
  const [scenes, setScenes] = useState<GeneratedScene[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  
  // Settings
  const [stylePreset, setStylePreset] = useState<keyof typeof STYLE_PRESETS>("cinematic");
  const [motionPreset, setMotionPreset] = useState<keyof typeof MOTION_PRESETS>("slow");
  const [customStylePrefix, setCustomStylePrefix] = useState("");
  const [useCustomStyle, setUseCustomStyle] = useState(false);
  const [imageQuality, setImageQuality] = useState([80]);
  const [videoDurationMultiplier, setVideoDurationMultiplier] = useState([1]);
  const [autoGenerateVideo, setAutoGenerateVideo] = useState(true);

  // Calculate scenes from sections and timestamps
  const calculateScenes = (): GeneratedScene[] => {
    if (sections.length === 0) {
      toast.error("No sections detected. Please analyze lyrics first with [Section] markers.");
      return [];
    }

    // Map sections to their durations using timestamps
    const sceneList: GeneratedScene[] = sections.map((section, index) => {
      // Find timestamps that belong to this section
      const sectionTimestamps = timestamps.filter(ts => {
        const words = ts.text.toLowerCase().split(/\s+/);
        const sectionWords = section.text.toLowerCase();
        return words.some(word => sectionWords.includes(word));
      });

      // Calculate duration from timestamps
      let duration = 3; // default 3 seconds
      if (sectionTimestamps.length > 0) {
        const start = Math.min(...sectionTimestamps.map(ts => ts.start));
        const end = Math.max(...sectionTimestamps.map(ts => ts.end));
        duration = Math.max(3, end - start); // minimum 3 seconds
      }

      // Build prompt from section
      const stylePrefix = useCustomStyle ? customStylePrefix : STYLE_PRESETS[stylePreset].prefix;
      const prompt = `${stylePrefix}, ${section.name.toLowerCase()}: ${section.text.slice(0, 100)}`;

      return {
        section: section.name,
        prompt,
        duration: duration * videoDurationMultiplier[0],
        status: 'pending' as const,
      };
    });

    return sceneList;
  };

  const generateAllScenes = async () => {
    const sceneList = calculateScenes();
    if (sceneList.length === 0) return;

    setScenes(sceneList);
    setIsGenerating(true);
    setCurrentSceneIndex(0);

    for (let i = 0; i < sceneList.length; i++) {
      setCurrentSceneIndex(i);
      
      try {
        // Update status to generating image
        setScenes(prev => prev.map((s, idx) => 
          idx === i ? { ...s, status: 'generating-image' } : s
        ));

        // Generate image
        const imageRes = await supabase.functions.invoke("generate-image", {
          body: { prompt: sceneList[i].prompt },
        });

        if (imageRes.error) throw imageRes.error;
        const imageUrl = imageRes.data.imageUrl;

        setScenes(prev => prev.map((s, idx) => 
          idx === i ? { ...s, imageUrl, status: autoGenerateVideo ? 'generating-video' : 'complete' } : s
        ));

        // Generate video if enabled
        if (autoGenerateVideo) {
          const motionPrompt = MOTION_PRESETS[motionPreset].prompt;
          const videoRes = await supabase.functions.invoke("generate-video", {
            body: {
              imageUrl,
              prompt: `${sceneList[i].prompt}, ${motionPrompt}`,
              duration: Math.min(sceneList[i].duration, 3), // API limit
            },
          });

          if (videoRes.error) throw videoRes.error;

          setScenes(prev => prev.map((s, idx) => 
            idx === i ? { ...s, videoUrl: videoRes.data.videoUrl, status: 'complete' } : s
          ));
        }

        toast.success(`Scene ${i + 1}/${sceneList.length} complete`);
      } catch (error) {
        console.error(`Error generating scene ${i}:`, error);
        setScenes(prev => prev.map((s, idx) => 
          idx === i ? { ...s, status: 'error' } : s
        ));
        toast.error(`Failed to generate scene ${i + 1}`);
      }
    }

    setIsGenerating(false);
    toast.success("Video generation complete!");
  };

  const downloadAllVideos = () => {
    const videos = scenes.filter(s => s.videoUrl);
    if (videos.length === 0) {
      toast.error("No videos to download");
      return;
    }

    videos.forEach((scene, i) => {
      const a = document.createElement("a");
      a.href = scene.videoUrl!;
      a.download = `scene_${i + 1}_${scene.section}.mp4`;
      a.click();
    });

    toast.success(`Downloading ${videos.length} videos`);
  };

  const totalDuration = scenes.reduce((acc, s) => acc + s.duration, 0);
  const completedScenes = scenes.filter(s => s.status === 'complete').length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Settings Card */}
      <Card className="p-6 glass-card border-border/50">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Video Generation Settings</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Style Preset */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Visual Style</Label>
            <Select value={stylePreset} onValueChange={(v) => setStylePreset(v as keyof typeof STYLE_PRESETS)}>
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background border-border">
                {Object.entries(STYLE_PRESETS).map(([key, value]) => (
                  <SelectItem key={key} value={key}>{value.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Motion Preset */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Camera Motion</Label>
            <Select value={motionPreset} onValueChange={(v) => setMotionPreset(v as keyof typeof MOTION_PRESETS)}>
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background border-border">
                {Object.entries(MOTION_PRESETS).map(([key, value]) => (
                  <SelectItem key={key} value={key}>{value.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Style Toggle */}
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground">Custom Style Prefix</Label>
              <Switch checked={useCustomStyle} onCheckedChange={setUseCustomStyle} />
            </div>
            {useCustomStyle && (
              <Input
                value={customStylePrefix}
                onChange={(e) => setCustomStylePrefix(e.target.value)}
                placeholder="e.g., watercolor painting, soft brushstrokes, artistic"
                className="bg-background"
              />
            )}
          </div>

          {/* Duration Multiplier */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">
              Duration Multiplier: {videoDurationMultiplier[0].toFixed(1)}x
            </Label>
            <Slider
              value={videoDurationMultiplier}
              onValueChange={setVideoDurationMultiplier}
              min={0.5}
              max={2}
              step={0.1}
              className="w-full"
            />
          </div>

          {/* Image Quality */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">
              Image Quality: {imageQuality[0]}%
            </Label>
            <Slider
              value={imageQuality}
              onValueChange={setImageQuality}
              min={50}
              max={100}
              step={5}
              className="w-full"
            />
          </div>

          {/* Auto Generate Video */}
          <div className="flex items-center justify-between md:col-span-2">
            <div>
              <Label className="text-sm">Auto-generate videos from images</Label>
              <p className="text-xs text-muted-foreground">Generate video clips automatically after each image</p>
            </div>
            <Switch checked={autoGenerateVideo} onCheckedChange={setAutoGenerateVideo} />
          </div>
        </div>
      </Card>

      {/* Sections Preview */}
      <Card className="p-6 glass-card border-border/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-secondary" />
            <h3 className="font-semibold">Detected Sections ({sections.length})</h3>
          </div>
          {sections.length > 0 && (
            <div className="text-sm text-muted-foreground">
              <Clock className="w-4 h-4 inline mr-1" />
              Est. {Math.round(totalDuration)}s total
            </div>
          )}
        </div>

        {sections.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Film className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No sections detected yet.</p>
            <p className="text-sm">Go to "Analyze Lyrics" and add [Intro], [Verse], [Chorus] markers to your lyrics.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {sections.map((section, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-1 rounded">
                  {section.name}
                </span>
                <span className="text-sm text-foreground/80 flex-1 truncate">
                  {section.text.slice(0, 80)}...
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Generate Button */}
      <div className="flex gap-3">
        <Button
          onClick={generateAllScenes}
          disabled={isGenerating || sections.length === 0}
          variant="neon"
          size="lg"
          className="flex-1"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating Scene {currentSceneIndex + 1}/{scenes.length}...
            </>
          ) : (
            <>
              <Video className="w-5 h-5" />
              Generate All Scenes
            </>
          )}
        </Button>

        {scenes.some(s => s.videoUrl) && (
          <Button variant="outline" size="lg" onClick={downloadAllVideos}>
            <Download className="w-5 h-5 mr-2" />
            Download All
          </Button>
        )}
      </div>

      {/* Progress */}
      {isGenerating && (
        <Card className="p-4 glass-card border-primary/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Generation Progress</span>
            <span className="text-sm text-muted-foreground">
              {completedScenes}/{scenes.length} complete
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-500"
              style={{ width: `${(completedScenes / scenes.length) * 100}%` }}
            />
          </div>
        </Card>
      )}

      {/* Generated Scenes */}
      {scenes.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Film className="w-5 h-5 text-primary" />
            Generated Scenes
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scenes.map((scene, index) => (
              <Card 
                key={index} 
                className={`p-4 glass-card border-border/50 ${
                  scene.status === 'complete' ? 'border-green-500/30' : 
                  scene.status === 'error' ? 'border-red-500/30' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-primary">{scene.section}</span>
                  <span className="text-xs text-muted-foreground">{scene.duration.toFixed(1)}s</span>
                </div>

                {/* Preview */}
                <div className="aspect-video rounded-lg bg-muted/50 overflow-hidden mb-3 relative">
                  {scene.status === 'pending' && (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                      <ImageIcon className="w-8 h-8" />
                    </div>
                  )}
                  {(scene.status === 'generating-image' || scene.status === 'generating-video') && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-primary">
                      <Loader2 className="w-8 h-8 animate-spin mb-2" />
                      <span className="text-xs">
                        {scene.status === 'generating-image' ? 'Generating image...' : 'Generating video...'}
                      </span>
                    </div>
                  )}
                  {scene.imageUrl && !scene.videoUrl && scene.status === 'complete' && (
                    <img src={scene.imageUrl} alt={scene.section} className="w-full h-full object-cover" />
                  )}
                  {scene.videoUrl && (
                    <video 
                      src={scene.videoUrl} 
                      className="w-full h-full object-cover" 
                      controls 
                      loop
                      muted
                    />
                  )}
                  {scene.status === 'error' && (
                    <div className="absolute inset-0 flex items-center justify-center text-red-500">
                      <span className="text-sm">Generation failed</span>
                    </div>
                  )}
                </div>

                <p className="text-xs text-muted-foreground line-clamp-2">{scene.prompt}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Info Card */}
      <Card className="p-4 glass-card border-border/50">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">How GenVid Works</h3>
        <ul className="text-sm text-muted-foreground/80 space-y-1">
          <li>• Add [Section] markers to your lyrics (e.g., [Intro], [Verse 1], [Chorus])</li>
          <li>• Upload audio in the Timestamps tab to get timing data</li>
          <li>• GenVid uses sections as scene prompts with your chosen style</li>
          <li>• Timestamps determine each scene's duration</li>
          <li>• Videos are generated using AI image-to-video models</li>
        </ul>
      </Card>
    </div>
  );
}
