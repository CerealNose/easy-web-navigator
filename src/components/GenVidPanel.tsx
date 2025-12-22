import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Video, Play, Download, Settings, Loader2, ImageIcon, Film, Clock, Layers, Upload, FileJson, FileText } from "lucide-react";
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

interface ScheduleItem {
  start: number;
  end: number;
  text: string;
  prompt?: string;
}

interface GeneratedScene {
  section: string;
  prompt: string;
  duration: number;
  start: number;
  end: number;
  imageUrl?: string;
  videoUrl?: string;
  status: 'pending' | 'generating-image' | 'generating-video' | 'complete' | 'error';
}

interface GenVidPanelProps {
  sections: Section[];
  timestamps: Timestamp[];
  moodPrompt?: string;
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

const VIDEO_SIZES = {
  "480p": { label: "480p (854×480)", width: 854, height: 480, maxArea: "480p" },
  "720p": { label: "720p (1280×720)", width: 1280, height: 720, maxArea: "720p" },
  "portrait": { label: "Portrait (480×854)", width: 480, height: 854, maxArea: "480p" },
  "square": { label: "Square (720×720)", width: 720, height: 720, maxArea: "720p" },
};

const FPS_OPTIONS = {
  "16": { label: "16 FPS (Slower, more frames)", value: 16 },
  "24": { label: "24 FPS (Film standard)", value: 24 },
};

// Parse SRT file content
function parseSRT(content: string): ScheduleItem[] {
  const blocks = content.trim().split(/\n\n+/);
  const items: ScheduleItem[] = [];
  
  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length >= 3) {
      const timeLine = lines[1];
      const textLines = lines.slice(2).join(' ');
      
      // Parse time: 00:00:01,000 --> 00:00:04,000
      const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
      if (timeMatch) {
        const startSec = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
        const endSec = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;
        
        items.push({
          start: startSec,
          end: endSec,
          text: textLines.trim()
        });
      }
    }
  }
  
  return items;
}

export function GenVidPanel({ sections, timestamps, moodPrompt = "" }: GenVidPanelProps) {
  const [scenes, setScenes] = useState<GeneratedScene[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [uploadedSchedule, setUploadedSchedule] = useState<ScheduleItem[]>([]);
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  
  // Settings
  const [stylePreset, setStylePreset] = useState<keyof typeof STYLE_PRESETS>("cinematic");
  const [motionPreset, setMotionPreset] = useState<keyof typeof MOTION_PRESETS>("slow");
  const [videoSize, setVideoSize] = useState<keyof typeof VIDEO_SIZES>("720p");
  const [videoFps, setVideoFps] = useState<keyof typeof FPS_OPTIONS>("24");
  const [styleSource, setStyleSource] = useState<"preset" | "mood" | "manual">(moodPrompt ? "mood" : "preset");
  const [manualStylePrefix, setManualStylePrefix] = useState("");
  const [imageQuality, setImageQuality] = useState([80]);
  const [videoDurationMultiplier, setVideoDurationMultiplier] = useState([1]);
  const [autoGenerateVideo, setAutoGenerateVideo] = useState(true);

  // Get the active style prefix based on source selection
  const getStylePrefix = (): string => {
    switch (styleSource) {
      case "mood":
        return moodPrompt || STYLE_PRESETS[stylePreset].prefix;
      case "manual":
        return manualStylePrefix || STYLE_PRESETS[stylePreset].prefix;
      case "preset":
      default:
        return STYLE_PRESETS[stylePreset].prefix;
    }
  };

  // Handle file upload (JSON or SRT)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const content = await file.text();
      const fileName = file.name.toLowerCase();
      
      if (fileName.endsWith('.json')) {
        const schedule = JSON.parse(content) as ScheduleItem[];
        setUploadedSchedule(schedule);
        setUploadedFileName(file.name);
        toast.success(`Loaded ${schedule.length} scenes from JSON`);
      } else if (fileName.endsWith('.srt')) {
        const schedule = parseSRT(content);
        setUploadedSchedule(schedule);
        setUploadedFileName(file.name);
        toast.success(`Loaded ${schedule.length} scenes from SRT`);
      } else {
        toast.error("Please upload a .json or .srt file");
      }
    } catch (err) {
      console.error("File parse error:", err);
      toast.error("Failed to parse file");
    }
  };

  // Match section to timestamp text
  const matchSectionToText = (text: string): string => {
    const words = text.toLowerCase().split(/\s+/);
    for (const section of sections) {
      const sectionWords = section.text.toLowerCase();
      if (words.some(word => word.length > 3 && sectionWords.includes(word))) {
        return section.name;
      }
    }
    return "Scene";
  };

  // Calculate scenes from uploaded schedule OR sections + timestamps
  const calculateScenes = (): GeneratedScene[] => {
    const stylePrefix = getStylePrefix();
    
    // Priority 1: Use uploaded schedule
    if (uploadedSchedule.length > 0) {
      return uploadedSchedule.map((item, index) => {
        const duration = (item.end - item.start) * videoDurationMultiplier[0];
        const sectionName = matchSectionToText(item.text);
        
        // Use prompt from schedule if available, otherwise build from text
        const prompt = item.prompt 
          ? `${stylePrefix}, ${item.prompt}` 
          : `${stylePrefix}, ${sectionName.toLowerCase()}: ${item.text.slice(0, 100)}`;
        
        return {
          section: sectionName || `Scene ${index + 1}`,
          prompt,
          duration: Math.max(3, duration),
          start: item.start,
          end: item.end,
          status: 'pending' as const,
        };
      });
    }
    
    // Priority 2: Use sections + timestamps  
    if (sections.length > 0) {
      return sections.map((section, index) => {
        // Find timestamps that belong to this section
        const sectionTimestamps = timestamps.filter(ts => {
          const words = ts.text.toLowerCase().split(/\s+/);
          const sectionWords = section.text.toLowerCase();
          return words.some(word => word.length > 3 && sectionWords.includes(word));
        });

        // Calculate duration from timestamps
        let start = index * 10; // default staggered
        let end = start + 5;
        let duration = 5;
        
        if (sectionTimestamps.length > 0) {
          start = Math.min(...sectionTimestamps.map(ts => ts.start));
          end = Math.max(...sectionTimestamps.map(ts => ts.end));
          duration = Math.max(3, (end - start) * videoDurationMultiplier[0]);
        }

        const prompt = `${stylePrefix}, ${section.name.toLowerCase()}: ${section.text.slice(0, 100)}`;

        return {
          section: section.name,
          prompt,
          duration,
          start,
          end,
          status: 'pending' as const,
        };
      });
    }
    
    toast.error("Upload a schedule file or analyze lyrics with [Section] markers first.");
    return [];
  };

  const generateAllScenes = async () => {
    const sceneList = calculateScenes();
    if (sceneList.length === 0) return;

    setScenes(sceneList);
    setIsGenerating(true);
    setCurrentSceneIndex(0);

    const sizeConfig = VIDEO_SIZES[videoSize];
    const fpsValue = FPS_OPTIONS[videoFps].value;

    for (let i = 0; i < sceneList.length; i++) {
      setCurrentSceneIndex(i);
      
      try {
        // Update status to generating image
        setScenes(prev => prev.map((s, idx) => 
          idx === i ? { ...s, status: 'generating-image' } : s
        ));

        // Generate image
        const imageRes = await supabase.functions.invoke("generate-image", {
          body: { 
            prompt: sceneList[i].prompt,
            width: sizeConfig.width,
            height: sizeConfig.height
          },
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
              duration: Math.min(sceneList[i].duration, 3),
              maxArea: sizeConfig.maxArea,
              fps: fpsValue,
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

  const previewScenes = calculateScenes();
  const totalDuration = previewScenes.reduce((acc, s) => acc + s.duration, 0);
  const completedScenes = scenes.filter(s => s.status === 'complete').length;
  const hasSourceData = uploadedSchedule.length > 0 || sections.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* File Upload Card */}
      <Card className="p-6 glass-card border-border/50">
        <div className="flex items-center gap-2 mb-4">
          <Upload className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Import Schedule</h3>
        </div>
        
        <div className="space-y-4">
          <div className="relative">
            <Input
              type="file"
              accept=".json,.srt"
              onChange={handleFileUpload}
              className="hidden"
              id="schedule-upload"
            />
            <label
              htmlFor="schedule-upload"
              className="flex items-center justify-center gap-3 h-24 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-all group"
            >
              <div className="flex flex-col items-center gap-2 text-muted-foreground group-hover:text-foreground transition-colors">
                <div className="flex gap-2">
                  <FileJson className="w-6 h-6" />
                  <FileText className="w-6 h-6" />
                </div>
                <span className="text-sm font-medium">
                  {uploadedFileName || "Upload replicate_schedule.json or .srt file"}
                </span>
                <span className="text-xs text-muted-foreground/60">
                  Timestamps determine each scene's duration
                </span>
              </div>
            </label>
          </div>
          
          {uploadedSchedule.length > 0 && (
            <div className="text-sm text-muted-foreground">
              ✓ {uploadedSchedule.length} scenes loaded • Total: {Math.round(uploadedSchedule.reduce((a, s) => a + (s.end - s.start), 0))}s
            </div>
          )}
        </div>
      </Card>

      {/* Settings Card */}
      <Card className="p-6 glass-card border-border/50">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Video Generation Settings</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Video Size */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Video Size</Label>
            <Select value={videoSize} onValueChange={(v) => setVideoSize(v as keyof typeof VIDEO_SIZES)}>
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background border-border">
                {Object.entries(VIDEO_SIZES).map(([key, value]) => (
                  <SelectItem key={key} value={key}>{value.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Video FPS */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Frame Rate (FPS)</Label>
            <Select value={videoFps} onValueChange={(v) => setVideoFps(v as keyof typeof FPS_OPTIONS)}>
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background border-border">
                {Object.entries(FPS_OPTIONS).map(([key, value]) => (
                  <SelectItem key={key} value={key}>{value.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Style Source */}
          <div className="space-y-2 md:col-span-2">
            <Label className="text-sm text-muted-foreground">Style Source</Label>
            <Select value={styleSource} onValueChange={(v) => setStyleSource(v as "preset" | "mood" | "manual")}>
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background border-border">
                <SelectItem value="preset">Use Preset Style</SelectItem>
                <SelectItem value="mood" disabled={!moodPrompt}>
                  Use Mood Image Prompt {!moodPrompt && "(analyze lyrics first)"}
                </SelectItem>
                <SelectItem value="manual">Manual Custom Style</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Visual Style Preset - only show when preset is selected */}
          {styleSource === "preset" && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Visual Style</Label>
              <Select 
                value={stylePreset} 
                onValueChange={(v) => setStylePreset(v as keyof typeof STYLE_PRESETS)}
              >
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
          )}

          {/* Show mood prompt preview when mood is selected */}
          {styleSource === "mood" && moodPrompt && (
            <div className="space-y-2 md:col-span-2">
              <Label className="text-sm text-muted-foreground">Mood Prompt (from Mood Image tab)</Label>
              <div className="p-3 rounded-lg bg-muted/30 text-sm text-foreground/80 max-h-20 overflow-y-auto">
                {moodPrompt}
              </div>
            </div>
          )}

          {/* Manual style input when manual is selected */}
          {styleSource === "manual" && (
            <div className="space-y-2 md:col-span-2">
              <Label className="text-sm text-muted-foreground">Custom Style Prefix</Label>
              <Input
                value={manualStylePrefix}
                onChange={(e) => setManualStylePrefix(e.target.value)}
                placeholder="e.g., watercolor painting, soft brushstrokes, artistic"
                className="bg-background"
              />
            </div>
          )}

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
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Auto-generate videos</Label>
              <p className="text-xs text-muted-foreground">Create video clips from images</p>
            </div>
            <Switch checked={autoGenerateVideo} onCheckedChange={setAutoGenerateVideo} />
          </div>
        </div>
      </Card>

      {/* Scenes Preview */}
      <Card className="p-6 glass-card border-border/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-secondary" />
            <h3 className="font-semibold">
              {uploadedSchedule.length > 0 ? `Imported Scenes (${uploadedSchedule.length})` : `Detected Sections (${sections.length})`}
            </h3>
          </div>
          {hasSourceData && (
            <div className="text-sm text-muted-foreground">
              <Clock className="w-4 h-4 inline mr-1" />
              Est. {Math.round(totalDuration)}s total
            </div>
          )}
        </div>

        {!hasSourceData ? (
          <div className="text-center py-8 text-muted-foreground">
            <Film className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No scenes detected yet.</p>
            <p className="text-sm">Upload a schedule file above, or analyze lyrics with [Section] markers.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {previewScenes.map((scene, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <span className="text-xs font-mono text-secondary min-w-[60px]">
                  {scene.start.toFixed(1)}s
                </span>
                <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-1 rounded">
                  {scene.section}
                </span>
                <span className="text-xs text-muted-foreground">
                  {scene.duration.toFixed(1)}s
                </span>
                <span className="text-sm text-foreground/80 flex-1 truncate">
                  {scene.prompt.slice(0, 60)}...
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
          disabled={isGenerating || !hasSourceData}
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
              Generate All Scenes ({previewScenes.length})
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
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-secondary">{scene.start.toFixed(1)}s</span>
                    <span className="text-sm font-medium text-primary">{scene.section}</span>
                  </div>
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
          <li>• Upload replicate_schedule.json or SRT from the Timestamps tab</li>
          <li>• OR add [Section] markers to lyrics (e.g., [Intro], [Verse 1], [Chorus])</li>
          <li>• Timestamps determine each scene's duration automatically</li>
          <li>• Mood Image prompt is used for consistent visual style</li>
          <li>• Choose video size: 480p, 720p, Portrait, or Square</li>
        </ul>
      </Card>
    </div>
  );
}
