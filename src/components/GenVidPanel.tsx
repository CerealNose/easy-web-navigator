import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Video, Play, Download, Settings, Loader2, ImageIcon, Film, Clock, Layers, Upload, FileJson, FileText, Images, X, AlertCircle } from "lucide-react";
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
  uploadedImage?: string; // Base64 or object URL for uploaded images
  status: 'pending' | 'generating-image' | 'generating-video' | 'complete' | 'error';
}

interface UploadedImage {
  file: File;
  preview: string;
  name: string;
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
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  
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
  const [baseSeed, setBaseSeed] = useState<number | null>(null);
  const [useConsistentSeed, setUseConsistentSeed] = useState(true);

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

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
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

  // Handle batch image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    const newImages: UploadedImage[] = [];
    
    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/')) {
        const preview = URL.createObjectURL(file);
        newImages.push({
          file,
          preview,
          name: file.name
        });
      }
    });
    
    setUploadedImages(prev => [...prev, ...newImages]);
    toast.success(`Added ${newImages.length} images`);
  };

  // Remove uploaded image
  const removeUploadedImage = (index: number) => {
    setUploadedImages(prev => {
      const newImages = [...prev];
      URL.revokeObjectURL(newImages[index].preview);
      newImages.splice(index, 1);
      return newImages;
    });
  };

  // Clear all uploaded images
  const clearAllImages = () => {
    uploadedImages.forEach(img => URL.revokeObjectURL(img.preview));
    setUploadedImages([]);
  };

  // Match a line of text to its parent section by checking if the section contains this text
  const findSectionForText = (text: string): string => {
    const cleanText = text.toLowerCase().trim();
    
    // Check each section to see if it contains this line
    for (const section of sections) {
      const sectionText = section.text.toLowerCase();
      // Check if the section contains most of the words from this text
      const words = cleanText.split(/\s+/).filter(w => w.length > 2);
      const matchCount = words.filter(word => sectionText.includes(word)).length;
      
      // If more than 60% of words match, it belongs to this section
      if (words.length > 0 && matchCount / words.length > 0.6) {
        return section.name;
      }
    }
    return "Scene";
  };

  // Calculate scenes - group schedule items by their parent sections
  const calculateScenes = (): GeneratedScene[] => {
    const stylePrefix = getStylePrefix();
    
    // When we have both schedule AND sections, group schedule items by section
    if (uploadedSchedule.length > 0 && sections.length > 0) {
      // Assign each schedule item to its section
      const itemsWithSections = uploadedSchedule.map(item => ({
        ...item,
        section: findSectionForText(item.text)
      }));
      
      // Group consecutive items by section (handles repeated sections like multiple Choruses)
      const sectionGroups: { 
        name: string; 
        startTime: number; 
        endTime: number; 
        items: typeof itemsWithSections;
      }[] = [];
      
      let currentGroup: typeof sectionGroups[0] | null = null;
      
      for (const item of itemsWithSections) {
        if (currentGroup && currentGroup.name === item.section) {
          // Extend current group
          currentGroup.endTime = item.end;
          currentGroup.items.push(item);
        } else {
          // Start new group
          if (currentGroup) {
            sectionGroups.push(currentGroup);
          }
          currentGroup = {
            name: item.section,
            startTime: item.start,
            endTime: item.end,
            items: [item]
          };
        }
      }
      
      if (currentGroup) {
        sectionGroups.push(currentGroup);
      }
      
      console.log("Section groups created:", sectionGroups.map(g => ({
        name: g.name,
        start: g.startTime,
        end: g.endTime,
        itemCount: g.items.length
      })));
      
      // Create one scene per section group
      return sectionGroups.map((group) => {
        const duration = (group.endTime - group.startTime) * videoDurationMultiplier[0];
        const sectionContent = sections.find(s => s.name === group.name)?.text || 
                               group.items.map(i => i.text).join(' ');
        
        const prompt = `${stylePrefix}, ${group.name.toLowerCase()}: ${sectionContent.slice(0, 100)}`;
        
        return {
          section: group.name,
          prompt,
          duration: Math.max(3, duration),
          start: group.startTime,
          end: group.endTime,
          status: 'pending' as const,
        };
      });
    }
    
    // Use uploaded schedule only (no sections to group by)
    if (uploadedSchedule.length > 0) {
      return uploadedSchedule.map((item, index) => {
        const duration = (item.end - item.start) * videoDurationMultiplier[0];
        
        const prompt = item.prompt 
          ? `${stylePrefix}, ${item.prompt}` 
          : `${stylePrefix}, scene: ${item.text.slice(0, 100)}`;
        
        return {
          section: `Scene ${index + 1}`,
          prompt,
          duration: Math.max(3, duration),
          start: item.start,
          end: item.end,
          status: 'pending' as const,
        };
      });
    }
    
    // Use sections + timestamps
    if (sections.length > 0 && timestamps.length > 0) {
      const timestampsWithSections = timestamps.map(ts => ({
        ...ts,
        assignedSection: ts.section || findSectionForText(ts.text)
      }));
      
      const sectionGroups: { name: string; startTime: number; endTime: number; timestamps: typeof timestampsWithSections }[] = [];
      let currentGroup: typeof sectionGroups[0] | null = null;
      
      for (const ts of timestampsWithSections) {
        if (currentGroup && currentGroup.name === ts.assignedSection) {
          currentGroup.endTime = ts.end;
          currentGroup.timestamps.push(ts);
        } else {
          if (currentGroup) sectionGroups.push(currentGroup);
          currentGroup = {
            name: ts.assignedSection,
            startTime: ts.start,
            endTime: ts.end,
            timestamps: [ts]
          };
        }
      }
      if (currentGroup) sectionGroups.push(currentGroup);
      
      return sectionGroups.map((group) => {
        const duration = (group.endTime - group.startTime) * videoDurationMultiplier[0];
        const sectionContent = sections.find(s => s.name === group.name)?.text || 
                               group.timestamps.map(t => t.text).join(' ');
        
        const prompt = `${stylePrefix}, ${group.name.toLowerCase()}: ${sectionContent.slice(0, 100)}`;
        
        return {
          section: group.name,
          prompt,
          duration: Math.max(3, duration),
          start: group.startTime,
          end: group.endTime,
          status: 'pending' as const,
        };
      });
    }
    
    // Fallback: Just use sections without timestamps
    if (sections.length > 0) {
      return sections.map((section, index) => {
        const start = index * 10;
        const end = start + 10;
        const prompt = `${stylePrefix}, ${section.name.toLowerCase()}: ${section.text.slice(0, 100)}`;
        
        return {
          section: section.name,
          prompt,
          duration: 10,
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

    // Check if we have enough images when using uploaded images
    if (uploadedImages.length > 0 && uploadedImages.length < sceneList.length) {
      toast.error(`Need ${sceneList.length} images, but only ${uploadedImages.length} uploaded. Upload more or generate remaining.`);
    }

    setScenes(sceneList);
    setIsGenerating(true);
    setCurrentSceneIndex(0);

    const sizeConfig = VIDEO_SIZES[videoSize];
    const fpsValue = FPS_OPTIONS[videoFps].value;
    
    // Generate a base seed for this batch if using consistent seeds
    const batchSeed = useConsistentSeed 
      ? (baseSeed ?? Math.floor(Math.random() * 2147483647))
      : null;
    
    // Store the seed for display
    if (useConsistentSeed && !baseSeed && batchSeed) {
      setBaseSeed(batchSeed);
    }

    for (let i = 0; i < sceneList.length; i++) {
      setCurrentSceneIndex(i);
      
      try {
        let imageUrl: string;
        
        // Check if we have an uploaded image for this scene
        if (uploadedImages[i]) {
          // Convert uploaded image to base64 for the video generation API
          const file = uploadedImages[i].file;
          const base64 = await fileToBase64(file);
          imageUrl = base64;
          
          setScenes(prev => prev.map((s, idx) => 
            idx === i ? { ...s, imageUrl: uploadedImages[i].preview, uploadedImage: base64, status: autoGenerateVideo ? 'generating-video' : 'complete' } : s
          ));
        } else {
          // Generate image using AI with consistent seed
          setScenes(prev => prev.map((s, idx) => 
            idx === i ? { ...s, status: 'generating-image' } : s
          ));

          // Use base seed + scene index for variation while maintaining style consistency
          const sceneSeed = batchSeed ? batchSeed + i : undefined;

          const imageRes = await supabase.functions.invoke("generate-image", {
            body: { 
              prompt: sceneList[i].prompt,
              seed: sceneSeed,
              width: sizeConfig.width,
              height: sizeConfig.height
            },
          });

          if (imageRes.error) throw imageRes.error;
          imageUrl = imageRes.data.imageUrl;

          setScenes(prev => prev.map((s, idx) => 
            idx === i ? { ...s, imageUrl, status: autoGenerateVideo ? 'generating-video' : 'complete' } : s
          ));
        }

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
            <div className="text-sm text-muted-foreground space-y-1">
              <div>✓ {uploadedSchedule.length} lines imported from {uploadedFileName}</div>
              <div className="text-xs">
                → Will generate <strong className="text-foreground">{previewScenes.length} section videos</strong> • 
                Total duration: {Math.round(uploadedSchedule.reduce((a, s) => a + (s.end - s.start), 0))}s
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Batch Image Upload Card */}
      <Card className="p-6 glass-card border-border/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Images className="w-5 h-5 text-secondary" />
            <h3 className="font-semibold">Scene Images</h3>
          </div>
          {uploadedImages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAllImages}>
              <X className="w-4 h-4 mr-1" />
              Clear All
            </Button>
          )}
        </div>
        
        {/* Image requirement indicator */}
        {hasSourceData && (
          <div className={`flex items-center gap-2 mb-4 p-3 rounded-lg ${
            uploadedImages.length === 0 
              ? 'bg-muted/30' 
              : uploadedImages.length >= previewScenes.length 
                ? 'bg-green-500/10 border border-green-500/30' 
                : 'bg-yellow-500/10 border border-yellow-500/30'
          }`}>
            {uploadedImages.length === 0 ? (
              <>
                <ImageIcon className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Upload <strong>{previewScenes.length} images</strong> for your scenes, or let AI generate them
                </span>
              </>
            ) : uploadedImages.length >= previewScenes.length ? (
              <>
                <ImageIcon className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-600">
                  ✓ {uploadedImages.length}/{previewScenes.length} images ready
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-yellow-500" />
                <span className="text-sm text-yellow-600">
                  {uploadedImages.length}/{previewScenes.length} images uploaded • {previewScenes.length - uploadedImages.length} will be AI-generated
                </span>
              </>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div className="relative">
            <Input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
              id="image-upload"
            />
            <label
              htmlFor="image-upload"
              className="flex items-center justify-center gap-3 h-24 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-secondary/50 hover:bg-muted/20 transition-all group"
            >
              <div className="flex flex-col items-center gap-2 text-muted-foreground group-hover:text-foreground transition-colors">
                <Images className="w-8 h-8" />
                <span className="text-sm font-medium">
                  Drop images or click to upload
                </span>
                <span className="text-xs text-muted-foreground/60">
                  Images will be matched to scenes in order
                </span>
              </div>
            </label>
          </div>

          {/* Uploaded images preview */}
          {uploadedImages.length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {uploadedImages.map((img, index) => (
                <div key={index} className="relative group aspect-square">
                  <img 
                    src={img.preview} 
                    alt={img.name}
                    className="w-full h-full object-cover rounded-lg"
                  />
                  <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="w-6 h-6"
                      onClick={() => removeUploadedImage(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <span className="absolute bottom-1 left-1 text-[10px] bg-background/80 px-1 rounded">
                    {index + 1}
                  </span>
                  {/* Show which scene this maps to */}
                  {previewScenes[index] && (
                    <span className="absolute top-1 left-1 text-[9px] bg-primary/80 text-primary-foreground px-1 rounded truncate max-w-[90%]">
                      {previewScenes[index].section}
                    </span>
                  )}
                </div>
              ))}
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

          {/* Consistent Seed Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Consistent visual style</Label>
              <p className="text-xs text-muted-foreground">Use related seeds for cohesive imagery</p>
            </div>
            <Switch checked={useConsistentSeed} onCheckedChange={setUseConsistentSeed} />
          </div>

          {/* Custom Seed Input */}
          {useConsistentSeed && (
            <div className="space-y-2 md:col-span-2">
              <Label className="text-sm text-muted-foreground">
                Base Seed {baseSeed ? `(current: ${baseSeed})` : "(auto-generated on first run)"}
              </Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={baseSeed ?? ""}
                  onChange={(e) => setBaseSeed(e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="Leave empty for random seed"
                  className="bg-background"
                />
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setBaseSeed(Math.floor(Math.random() * 2147483647))}
                >
                  Randomize
                </Button>
              </div>
              <p className="text-xs text-muted-foreground/60">
                Same seed + similar prompts = consistent visual style across scenes
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Scenes Preview */}
      <Card className="p-6 glass-card border-border/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-secondary" />
            <h3 className="font-semibold">
              {uploadedSchedule.length > 0 ? `Imported Scenes (${uploadedSchedule.length})` : `Section Videos (${previewScenes.length})`}
            </h3>
          </div>
          {hasSourceData && (
            <div className="text-sm text-muted-foreground flex items-center gap-3">
              <span>
                <Images className="w-4 h-4 inline mr-1" />
                {uploadedImages.length > 0 
                  ? `${Math.min(uploadedImages.length, previewScenes.length)}/${previewScenes.length} images`
                  : `${previewScenes.length} images needed`
                }
              </span>
              <span>
                <Clock className="w-4 h-4 inline mr-1" />
                {Math.round(totalDuration)}s total
              </span>
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
                <span className="text-xs font-mono text-muted-foreground min-w-[90px]">
                  {scene.start.toFixed(1)}s → {scene.end.toFixed(1)}s
                </span>
                <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-1 rounded min-w-[80px] text-center">
                  {scene.section}
                </span>
                <span className="text-xs text-secondary font-medium min-w-[50px]">
                  {scene.duration.toFixed(1)}s
                </span>
                {uploadedImages[index] ? (
                  <span className="text-xs text-green-500 flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" /> Image #{index + 1}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground/60">AI generated</span>
                )}
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
