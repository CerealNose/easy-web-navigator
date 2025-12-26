import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Video, Play, Download, Settings, Loader2, ImageIcon, Film, Clock, Layers, Upload, FileJson, FileText, Images, X, AlertCircle, Music, Sparkles, RefreshCw, Archive, StopCircle, Edit3, ChevronDown, Cpu, Cloud } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { VideoPreviewPlayer } from "./VideoPreviewPlayer";
import { SceneData } from "./remotion/MusicVideoComposition";
import { SceneEditor, EditableScene } from "./SceneEditor";
import JSZip from "jszip";
import { useSettings } from "@/contexts/SettingsContext";
import { useComfyUI } from "@/hooks/useComfyUI";
import { VideoSettingsCompact } from "./VideoSettingsCompact";

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
  taskId?: string; // Store Minimax task ID for manual status checks
  status: 'pending' | 'generating-image' | 'generating-video' | 'processing' | 'complete' | 'error';
}

interface UploadedImage {
  file: File;
  preview: string;
  name: string;
}

interface SectionPrompt {
  section: string;
  prompt: string;
  narrativeBeat?: string;
}

interface Storyline {
  type: "literal" | "metaphorical" | "abstract";
  title: string;
  summary: string;
  protagonist: string;
  setting: string;
  emotionalArc: string;
  visualMotifs: string[];
  colorPalette?: string;
  cinematicStyle?: string;
}

interface LyricsAnalysis {
  themes: { name: string; intensity: number; color: string }[];
  emotions: string[];
  storylines: Storyline[];
  moodPrompt: string;
  sectionPrompts: SectionPrompt[];
}

interface GenVidPanelProps {
  sections: Section[];
  timestamps: Timestamp[];
  moodPrompt?: string;
  sectionPrompts?: SectionPrompt[];
  storyline?: Storyline;
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
  slow: { label: "Slow & Smooth", prompt: "slow camera movement, smooth pan, atmospheric", description: "Gentle flowing motion, great for emotional moments" },
  dynamic: { label: "Dynamic", prompt: "dynamic camera movement, action-oriented", description: "Energetic movement, good for upbeat sections" },
  static: { label: "Static", prompt: "still camera, minimal movement, contemplative", description: "Minimal motion, focuses on the scene itself" },
  zoom: { label: "Slow Zoom", prompt: "slow zoom in, focus on details, cinematic", description: "Gradual zoom creates intensity and focus" },
  cinematic: { label: "Cinematic Mix", prompt: "cinematic camera movement, dramatic angles", description: "Varied cinematic movements for professional look" },
  drift: { label: "Gentle Drift", prompt: "subtle camera drift, floating movement, dreamy", description: "Soft floating motion, ethereal feel" },
};

const VIDEO_SIZES = {
  "480p": { label: "480p (SD)", width: 854, height: 480, maxArea: "480p" },
  "720p": { label: "720p (HD)", width: 1280, height: 720, maxArea: "720p" },
  "1080p": { label: "1080p (Full HD)", width: 1920, height: 1080, maxArea: "1080p" },
};

const ASPECT_RATIOS = {
  "16:9": { label: "16:9 (Landscape)", value: "16:9" },
  "9:16": { label: "9:16 (Portrait)", value: "9:16" },
  "1:1": { label: "1:1 (Square)", value: "1:1" },
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

export function GenVidPanel({ sections, timestamps, moodPrompt = "", sectionPrompts = [], storyline }: GenVidPanelProps) {
  const [scenes, setScenes] = useState<GeneratedScene[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [uploadedSchedule, setUploadedSchedule] = useState<ScheduleItem[]>([]);
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  
  // Settings context and ComfyUI hook
  const { inferenceMode, isComfyUIConnected, videoSettings } = useSettings();
  const {
    generateImage: generateLocalImage,
    generateVideo: generateLocalVideo,
    progress: localProgress,
    videoProgressInfo,
  } = useComfyUI();
  
  // Settings
  const [stylePreset, setStylePreset] = useState<keyof typeof STYLE_PRESETS>("cinematic");
  const [motionPreset, setMotionPreset] = useState<keyof typeof MOTION_PRESETS>("slow");
  const [videoSize, setVideoSize] = useState<keyof typeof VIDEO_SIZES>("720p");
  const [aspectRatio, setAspectRatio] = useState<keyof typeof ASPECT_RATIOS>("16:9");
  const [videoFps, setVideoFps] = useState<keyof typeof FPS_OPTIONS>("24");
  const [styleSource, setStyleSource] = useState<"preset" | "mood" | "manual" | "reference">(moodPrompt ? "mood" : "preset");
  const [manualStylePrefix, setManualStylePrefix] = useState("");
  const [imageQuality, setImageQuality] = useState([80]);
  const [videoDurationMultiplier, setVideoDurationMultiplier] = useState([1]);
  const [autoGenerateVideo, setAutoGenerateVideo] = useState(true);
  const [baseSeed, setBaseSeed] = useState<number | null>(null);
  const [useConsistentSeed, setUseConsistentSeed] = useState(true);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [lyricsFile, setLyricsFile] = useState<File | null>(null);
  const [lyricsContent, setLyricsContent] = useState<string>("");
  const [referenceImage, setReferenceImage] = useState<{ file: File; preview: string } | null>(null);
  const [referenceStylePrompt, setReferenceStylePrompt] = useState<string>("");
  const [isAnalyzingStyle, setIsAnalyzingStyle] = useState(false);
  const [useFrameContinuity, setUseFrameContinuity] = useState(true);
  const [isExtractingFrame, setIsExtractingFrame] = useState(false);
  const [useSilhouetteMode, setUseSilhouetteMode] = useState(true);
  
  // Progress estimation state
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [estimatedClips, setEstimatedClips] = useState<number | null>(null);
  const [avgClipDuration, setAvgClipDuration] = useState<number | null>(null);
  const [completedClipDurations, setCompletedClipDurations] = useState<number[]>([]);
  const [isCancelling, setIsCancelling] = useState(false);
  const [orphanedTaskIds, setOrphanedTaskIds] = useState<string[]>([]);
  const [autoCancelOnLeave, setAutoCancelOnLeave] = useState(false);
  
  // Scene editor state
  const [editableScenes, setEditableScenes] = useState<EditableScene[]>([]);
  const [isPrepared, setIsPrepared] = useState(false);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState<number | null>(null);
  
  // Lyrics analysis state
  const [lyricsAnalysis, setLyricsAnalysis] = useState<LyricsAnalysis | null>(null);
  const [isAnalyzingLyrics, setIsAnalyzingLyrics] = useState(false);
  const [selectedStorylineIndex, setSelectedStorylineIndex] = useState<number>(0);
  
  // Manual duration mode for uploaded images
  const [useManualDuration, setUseManualDuration] = useState(false);
  const [manualTotalDuration, setManualTotalDuration] = useState(240); // 4 minutes default
  const [manualSceneDuration, setManualSceneDuration] = useState(10); // 10 seconds per scene
  
  // Quick target generation state
  const [isGeneratingQuickTarget, setIsGeneratingQuickTarget] = useState(false);
  const [quickTargetProgress, setQuickTargetProgress] = useState<{ current: number; total: number } | null>(null);

  // Ref to signal cancellation to the generation loop
  const cancelGenerationRef = useRef(false);

  // LocalStorage key for pending jobs
  const PENDING_JOBS_KEY = 'genvid_pending_jobs';
  
  // Helper to determine if we should use local generation
  const useLocalGeneration = inferenceMode === "local" || 
    (inferenceMode === "hybrid" && isComfyUIConnected);

  // Save pending jobs to localStorage
  const savePendingJobs = useCallback((taskIds: string[]) => {
    try {
      if (taskIds.length > 0) {
        localStorage.setItem(PENDING_JOBS_KEY, JSON.stringify(taskIds));
      } else {
        localStorage.removeItem(PENDING_JOBS_KEY);
      }
    } catch (e) {
      console.error('Failed to save pending jobs:', e);
    }
  }, []);

  // Load orphaned jobs on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PENDING_JOBS_KEY);
      if (stored) {
        const taskIds = JSON.parse(stored) as string[];
        if (taskIds.length > 0) {
          setOrphanedTaskIds(taskIds);
          toast.warning(`Found ${taskIds.length} orphaned video jobs from previous session. Cancel them to stop credit usage.`);
        }
      }
    } catch (e) {
      console.error('Failed to load pending jobs:', e);
    }
  }, []);

  // Update localStorage when scenes change
  useEffect(() => {
    const pendingTaskIds = scenes
      .filter(s => s.taskId && (s.status === 'processing' || s.status === 'generating-video'))
      .map(s => s.taskId!)
      .filter(Boolean);
    
    // Merge with orphaned (but filter out completed ones)
    const allPending = [...new Set([...pendingTaskIds, ...orphanedTaskIds])];
    savePendingJobs(allPending);
  }, [scenes, orphanedTaskIds, savePendingJobs]);

  // Warn before leaving page if jobs are pending, and optionally auto-cancel them (best-effort)
  useEffect(() => {
    const pendingTaskIds = scenes
      .filter((s) => s.taskId && (s.status === "processing" || s.status === "generating-video"))
      .map((s) => s.taskId!);
    const allTaskIds = [...new Set([...pendingTaskIds, ...orphanedTaskIds])];
    const pendingCount = allTaskIds.length;

    const cancelPendingJobsBestEffort = async () => {
      if (pendingCount === 0) return;

      // Fire-and-forget; on some browsers this may not fully complete.
      try {
        await Promise.allSettled(
          allTaskIds.map((taskId) =>
            supabase.functions.invoke("generate-video", {
              body: { action: "cancel", taskId },
            })
          )
        );
      } catch {
        // ignore
      } finally {
        try {
          localStorage.removeItem(PENDING_JOBS_KEY);
        } catch {
          // ignore
        }
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingCount > 0 && !autoCancelOnLeave) {
        e.preventDefault();
        e.returnValue =
          "You have pending video generation jobs. They will continue to use credits if you leave. Are you sure?";
        return e.returnValue;
      }
    };

    const handleVisibilityChange = () => {
      if (autoCancelOnLeave && document.visibilityState === "hidden") {
        void cancelPendingJobsBestEffort();
      }
    };

    const handlePageHide = () => {
      if (autoCancelOnLeave) {
        void cancelPendingJobsBestEffort();
      }
    };

    if (pendingCount > 0) {
      window.addEventListener("beforeunload", handleBeforeUnload);
      document.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("pagehide", handlePageHide);

      return () => {
        window.removeEventListener("beforeunload", handleBeforeUnload);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        window.removeEventListener("pagehide", handlePageHide);
      };
    }
  }, [scenes, orphanedTaskIds, autoCancelOnLeave]);

  // Extract the last frame from a video URL as base64 (compressed and resized)
  const extractLastFrame = async (videoUrl: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      
      const timeoutId = setTimeout(() => {
        console.warn('Frame extraction timed out');
        video.remove();
        resolve(null);
      }, 30000); // 30s timeout
      
      video.onloadedmetadata = () => {
        // Seek to near the end (last 0.1 seconds)
        video.currentTime = Math.max(0, video.duration - 0.1);
      };
      
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          
          // Resize to max 1280px on longest side to reduce file size
          // This helps avoid Replicate's size limits while maintaining quality
          const maxSize = 1280;
          let width = video.videoWidth;
          let height = video.videoHeight;
          
          if (width > height && width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            // Use better quality interpolation
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(video, 0, 0, width, height);
            
            // Compress to JPEG with 0.8 quality (good balance of size vs quality)
            const base64 = canvas.toDataURL('image/jpeg', 0.8);
            
            // Log the size for debugging
            const sizeKB = Math.round((base64.length * 3 / 4) / 1024);
            console.log(`Extracted frame: ${width}x${height}, ~${sizeKB}KB`);
            
            clearTimeout(timeoutId);
            video.remove();
            canvas.remove();
            resolve(base64);
          } else {
            clearTimeout(timeoutId);
            video.remove();
            resolve(null);
          }
        } catch (err) {
          console.error('Frame extraction error:', err);
          clearTimeout(timeoutId);
          video.remove();
          resolve(null);
        }
      };
      
      video.onerror = () => {
        console.error('Video load error for frame extraction');
        clearTimeout(timeoutId);
        video.remove();
        resolve(null);
      };
      
      video.src = videoUrl;
      video.load();
    });
  };

  // Get the active style prefix based on source selection
  const getStylePrefix = (): string => {
    switch (styleSource) {
      case "reference":
        return referenceStylePrompt || STYLE_PRESETS[stylePreset].prefix;
      case "mood":
        return moodPrompt || STYLE_PRESETS[stylePreset].prefix;
      case "manual":
        return manualStylePrefix || STYLE_PRESETS[stylePreset].prefix;
      case "preset":
      default:
        return STYLE_PRESETS[stylePreset].prefix;
    }
  };

  // Handle reference image upload and style analysis
  const handleReferenceImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      toast.error("Please upload an image file");
      return;
    }
    
    // Clean up previous reference image
    if (referenceImage) {
      URL.revokeObjectURL(referenceImage.preview);
    }
    
    const preview = URL.createObjectURL(file);
    setReferenceImage({ file, preview });
    setStyleSource("reference");
    
    // Analyze the image style
    setIsAnalyzingStyle(true);
    try {
      const base64 = await fileToBase64(file);
      
      const response = await supabase.functions.invoke("analyze-image-style", {
        body: { imageBase64: base64 }
      });
      
      if (response.error) throw response.error;
      
      const styleDescription = response.data.styleDescription;
      setReferenceStylePrompt(styleDescription);
      toast.success("Style analyzed! Will apply to all generated images.");
    } catch (err) {
      console.error("Style analysis error:", err);
      toast.error("Failed to analyze image style");
    } finally {
      setIsAnalyzingStyle(false);
    }
  };

  // Remove reference image
  const removeReferenceImage = () => {
    if (referenceImage) {
      URL.revokeObjectURL(referenceImage.preview);
    }
    setReferenceImage(null);
    setReferenceStylePrompt("");
    if (styleSource === "reference") {
      setStyleSource("preset");
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

  // Handle audio file upload and extract duration
  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('audio/')) {
      toast.error("Please upload an audio file");
      return;
    }
    
    // Revoke previous URL if exists
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    
    const url = URL.createObjectURL(file);
    setAudioFile(file);
    setAudioUrl(url);
    
    // Extract audio duration
    const audio = new Audio(url);
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      setAudioDuration(duration);
      
      // Calculate initial estimated clips based on default clip duration (5s)
      const defaultClipDuration = 5;
      const estimated = Math.ceil(duration / defaultClipDuration);
      setEstimatedClips(estimated);
      setCompletedClipDurations([]);
      setAvgClipDuration(null);
      
      toast.success(`Loaded audio: ${file.name} (${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')})`);
    };
    audio.onerror = () => {
      toast.success(`Loaded audio: ${file.name}`);
    };
  };

  // Handle lyrics file upload
  const handleLyricsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.txt')) {
      toast.error("Please upload a .txt file");
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setLyricsFile(file);
      setLyricsContent(content);
      toast.success(`Loaded lyrics: ${file.name}`);
    };
    reader.onerror = () => {
      toast.error("Failed to read lyrics file");
    };
    reader.readAsText(file);
  };

  // Analyze lyrics and generate storylines
  const analyzeLyrics = async () => {
    if (!lyricsContent.trim()) {
      toast.error("Please upload a lyrics file first");
      return;
    }
    
    setIsAnalyzingLyrics(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-lyrics', {
        body: { lyrics: lyricsContent }
      });
      
      if (error) {
        console.error("Lyrics analysis error:", error);
        toast.error("Failed to analyze lyrics");
        return;
      }
      
      if (data.error) {
        toast.error(data.error);
        return;
      }
      
      setLyricsAnalysis(data);
      setSelectedStorylineIndex(0);
      toast.success(`Generated ${data.storylines?.length || 0} storyline interpretations!`);
    } catch (err) {
      console.error("Lyrics analysis error:", err);
      toast.error("Failed to analyze lyrics");
    } finally {
      setIsAnalyzingLyrics(false);
    }
  };

  // Generate scene prompts from selected storyline
  const [isGeneratingScenePrompts, setIsGeneratingScenePrompts] = useState(false);
  const [generatedScenePrompts, setGeneratedScenePrompts] = useState<{ section: string; prompt: string; narrativeBeat?: string }[]>([]);
  
  const generateScenePromptsFromStoryline = async () => {
    if (!lyricsAnalysis || !uploadedSchedule.length) {
      toast.error("Upload a schedule file and analyze lyrics first");
      return;
    }
    
    const selectedStoryline = lyricsAnalysis.storylines[selectedStorylineIndex];
    if (!selectedStoryline) {
      toast.error("Select a storyline first");
      return;
    }
    
    setIsGeneratingScenePrompts(true);
    const prompts: { section: string; prompt: string; narrativeBeat?: string }[] = [];
    
    try {
      toast.info(`Generating prompts for ${uploadedSchedule.length} scenes...`);
      
      for (let i = 0; i < uploadedSchedule.length; i++) {
        const scene = uploadedSchedule[i];
        const lyricText = scene.text || `Scene ${i + 1}`;
        
        // Calculate narrative position for this scene
        const progress = i / uploadedSchedule.length;
        let narrativeBeat = "";
        if (progress < 0.2) narrativeBeat = "Opening/Introduction - establish the world and protagonist";
        else if (progress < 0.4) narrativeBeat = "Rising action - building tension and stakes";
        else if (progress < 0.6) narrativeBeat = "Midpoint/Climax - peak emotional intensity";
        else if (progress < 0.8) narrativeBeat = "Falling action - consequences and reflection";
        else narrativeBeat = "Resolution/Conclusion - emotional resolution";
        
        const { data, error } = await supabase.functions.invoke('generate-scene-prompt', {
          body: {
            lyricLine: lyricText,
            sceneIndex: i,
            totalScenes: uploadedSchedule.length,
            styleHint: `${selectedStoryline.cinematicStyle || ''} ${selectedStoryline.colorPalette || ''}`,
            previousPrompt: prompts[i - 1]?.prompt || "",
            storyline: selectedStoryline,
            narrativeBeat,
            useSilhouetteMode,
            motionHint: MOTION_PRESETS[motionPreset].prompt
          }
        });
        
        if (error) {
          console.error(`Failed to generate prompt for scene ${i + 1}:`, error);
          prompts.push({ section: lyricText.slice(0, 30), prompt: `Scene ${i + 1}: ${lyricText}`, narrativeBeat });
        } else {
          prompts.push({ 
            section: lyricText.slice(0, 30), 
            prompt: data.prompt || `Scene ${i + 1}`, 
            narrativeBeat 
          });
        }
        
        // Small delay to avoid rate limiting
        if (i < uploadedSchedule.length - 1) {
          await new Promise(r => setTimeout(r, 300));
        }
      }
      
      setGeneratedScenePrompts(prompts);
      
      // Also update uploadedSchedule with the generated prompts so they're used in calculateScenes
      setUploadedSchedule(prev => prev.map((item, idx) => ({
        ...item,
        prompt: prompts[idx]?.prompt || item.prompt
      })));
      
      toast.success(`Generated ${prompts.length} scene prompts! They will be used for video generation.`);
    } catch (err) {
      console.error("Scene prompt generation error:", err);
      toast.error("Failed to generate scene prompts");
    } finally {
      setIsGeneratingScenePrompts(false);
    }
  };

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
  
  // Generate images for quick target duration
  const generateQuickTargetImages = async (targetSeconds: number) => {
    // Validate prerequisites
    if (!lyricsAnalysis || !lyricsAnalysis.storylines || lyricsAnalysis.storylines.length === 0) {
      toast.error("Please analyze lyrics first to generate scene images");
      return;
    }
    
    const selectedStoryline = lyricsAnalysis.storylines[selectedStorylineIndex];
    if (!selectedStoryline) {
      toast.error("Please select a storyline first");
      return;
    }
    
    const imagesNeeded = Math.ceil(targetSeconds / manualSceneDuration);
    
    // Split lyrics into scenes
    const lyricsLines = lyricsContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.match(/^\[.*\]$/)); // Remove empty lines and section markers
    
    // Distribute lyrics across scenes
    const sceneLyrics: string[] = [];
    const linesPerScene = Math.max(1, Math.ceil(lyricsLines.length / imagesNeeded));
    
    for (let i = 0; i < imagesNeeded; i++) {
      const startIdx = i * linesPerScene;
      const endIdx = Math.min(startIdx + linesPerScene, lyricsLines.length);
      const sceneText = lyricsLines.slice(startIdx, endIdx).join(' ') || `Scene ${i + 1}`;
      sceneLyrics.push(sceneText);
    }
    
    setIsGeneratingQuickTarget(true);
    setQuickTargetProgress({ current: 0, total: imagesNeeded });
    
    // Clear existing uploaded images
    uploadedImages.forEach(img => URL.revokeObjectURL(img.preview));
    setUploadedImages([]);
    
    // Enable manual duration mode
    setUseManualDuration(true);
    
    const generatedImages: UploadedImage[] = [];
    const stylePrefix = getStylePrefix();
    
    try {
      toast.info(`Generating ${imagesNeeded} scene images for ${Math.floor(targetSeconds / 60)} minute video...`);
      
      // Generate seed for consistency if enabled
      const baseSeedForRun = useConsistentSeed ? (baseSeed ?? Math.floor(Math.random() * 2147483647)) : null;
      if (useConsistentSeed && !baseSeed) {
        setBaseSeed(baseSeedForRun);
      }
      
      for (let i = 0; i < imagesNeeded; i++) {
        const lyricText = sceneLyrics[i] || `Scene ${i + 1}`;
        
        // Calculate narrative position
        const progress = i / imagesNeeded;
        let narrativeBeat = "";
        if (progress < 0.2) narrativeBeat = "Opening/Introduction - establish the world and protagonist";
        else if (progress < 0.4) narrativeBeat = "Rising action - building tension and stakes";
        else if (progress < 0.6) narrativeBeat = "Midpoint/Climax - peak emotional intensity";
        else if (progress < 0.8) narrativeBeat = "Falling action - consequences and reflection";
        else narrativeBeat = "Resolution/Conclusion - emotional resolution";
        
        // Generate scene prompt using AI
        let scenePrompt = `${stylePrefix}, ${lyricText.slice(0, 100)}`;
        
        try {
          const { data: promptData, error: promptError } = await supabase.functions.invoke('generate-scene-prompt', {
            body: {
              lyricLine: lyricText,
              sceneIndex: i,
              totalScenes: imagesNeeded,
              styleHint: `${selectedStoryline.cinematicStyle || ''} ${selectedStoryline.colorPalette || ''}`,
              previousPrompt: generatedImages.length > 0 ? scenePrompt : "",
              storyline: selectedStoryline,
              narrativeBeat,
              useSilhouetteMode,
              motionHint: MOTION_PRESETS[motionPreset].prompt
            }
          });
          
          if (!promptError && promptData?.prompt) {
            scenePrompt = promptData.prompt;
          }
        } catch (promptErr) {
          console.warn(`Scene ${i + 1} prompt generation failed, using fallback:`, promptErr);
        }
        
        // Determine dimensions based on aspect ratio
        let width = 1280, height = 720;
        if (aspectRatio === "9:16") { width = 720; height = 1280; }
        else if (aspectRatio === "1:1") { width = 1024; height = 1024; }
        
        // Generate image - use local ComfyUI if in local mode, otherwise cloud
        const seed = baseSeedForRun ? baseSeedForRun + i : undefined;
        
        let imageUrl: string | null = null;
        
        // Check if user wants local generation
        if (useLocalGeneration) {
          if (!isComfyUIConnected) {
            toast.error("ComfyUI is not connected. Please check your tunnel URL in Settings.");
            setIsGeneratingQuickTarget(false);
            setQuickTargetProgress(null);
            return;
          }
          
          // Use local ComfyUI
          try {
            const localResult = await generateLocalImage(scenePrompt, { 
              seed: seed ?? undefined,
              width,
              height
            });
            if (localResult?.imageUrl) {
              imageUrl = localResult.imageUrl;
            } else {
              toast.error(`Local generation returned no image for scene ${i + 1}`);
              continue;
            }
          } catch (localErr) {
            console.error(`Local generation failed for image ${i + 1}:`, localErr);
            toast.error(`Local generation failed: ${localErr instanceof Error ? localErr.message : 'Unknown error'}`);
            continue;
          }
        } else {
          // Use cloud API
          const { data: imageData, error: imageError } = await supabase.functions.invoke('generate-image', {
            body: {
              prompt: scenePrompt,
              seed,
              width,
              height,
              quality: imageQuality[0]
            }
          });
          
          if (imageError) {
            console.error(`Failed to generate image ${i + 1}:`, imageError);
            toast.error(`Failed to generate image ${i + 1}: ${imageError.message || 'Unknown error'}`);
            continue;
          }
          
          imageUrl = imageData?.imageUrl;
        }
        
        if (imageUrl) {
          // Fetch the image and convert to blob for local preview
          try {
            const imageResponse = await fetch(imageUrl);
            const blob = await imageResponse.blob();
            const file = new File([blob], `scene_${i + 1}.webp`, { type: 'image/webp' });
            const preview = URL.createObjectURL(blob);
            
            generatedImages.push({
              file,
              preview,
              name: `Scene ${i + 1} - ${lyricText.slice(0, 20)}...`
            });
          } catch (fetchErr) {
            console.error(`Failed to fetch generated image ${i + 1}:`, fetchErr);
          }
        }
        
        setQuickTargetProgress({ current: i + 1, total: imagesNeeded });
        setUploadedImages([...generatedImages]);
        
        // Small delay to avoid rate limiting
        if (i < imagesNeeded - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      
      setUploadedImages(generatedImages);
      toast.success(`Generated ${generatedImages.length} scene images for ${Math.floor(targetSeconds / 60)} min video!`);
      
    } catch (err) {
      console.error("Quick target generation error:", err);
      toast.error("Failed to generate scene images");
    } finally {
      setIsGeneratingQuickTarget(false);
      setQuickTargetProgress(null);
    }
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

  // Get section-specific prompt if available, otherwise fall back to global style
  const getSectionPrompt = (sectionName: string): string | null => {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[^a-z0-9 ]/g, "");

    const stripNumbering = (s: string) =>
      normalize(s)
        // "verse 1" -> "verse", "chorus 2" -> "chorus"
        .replace(/\b(verse|chorus|bridge|intro|outro|hook|prechorus|pre chorus)\s*\d+\b/g, "$1")
        // remove any remaining standalone numbers
        .replace(/\b\d+\b/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const target = normalize(sectionName);
    const targetLoose = stripNumbering(sectionName);

    // 1) Exact match (preferred)
    const exact = sectionPrompts.find((sp) => normalize(sp.section) === target);
    if (exact?.prompt) return exact.prompt;

    // 2) Loose match ignoring numbering/punctuation (common AI mismatch)
    const loose = sectionPrompts.find((sp) => stripNumbering(sp.section) === targetLoose);
    if (loose?.prompt) return loose.prompt;

    // 3) Prefix/contains match (handles "Verse" vs "Verse 1" and similar)
    const fuzzy = sectionPrompts.find((sp) => {
      const a = normalize(sp.section);
      const b = target;
      return a.startsWith(b) || b.startsWith(a) || a.includes(b) || b.includes(a);
    });
    return fuzzy?.prompt || null;
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
      console.log("Available sectionPrompts:", sectionPrompts);
      
      // Create one scene per section group
      return sectionGroups.map((group, idx) => {
        const duration = (group.endTime - group.startTime) * videoDurationMultiplier[0];
        const sectionContent = sections.find(s => s.name === group.name)?.text || 
                               group.items.map(i => i.text).join(' ');
        
        // Use section-specific prompt if available, otherwise fall back to global style
        const sectionSpecificPrompt = getSectionPrompt(group.name);
        
        // Debug: log matching attempt
        console.log(`Scene ${idx + 1} "${group.name}" -> matched prompt:`, 
          sectionSpecificPrompt ? 'YES' : 'NO (using fallback)');
        
        // If no match found but we have sectionPrompts, use the one at this index as fallback
        let prompt: string;
        if (sectionSpecificPrompt) {
          prompt = sectionSpecificPrompt;
        } else if (sectionPrompts.length > idx && sectionPrompts[idx]?.prompt) {
          // Fallback: use prompt at same index position
          console.log(`Scene ${idx + 1}: Using index-based fallback from sectionPrompts[${idx}]`);
          prompt = sectionPrompts[idx].prompt;
        } else {
          prompt = `${stylePrefix}, ${group.name.toLowerCase()}: ${sectionContent.slice(0, 100)}`;
        }
        
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
        
        // Check if we have a section-specific prompt at this index
        let prompt: string;
        if (item.prompt) {
          prompt = `${stylePrefix}, ${item.prompt}`;
        } else if (sectionPrompts.length > index && sectionPrompts[index]?.prompt) {
          // Use the AI-generated section prompt at this index
          prompt = sectionPrompts[index].prompt;
        } else {
          prompt = `${stylePrefix}, scene: ${item.text.slice(0, 100)}`;
        }
        
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
      
      return sectionGroups.map((group, idx) => {
        const duration = (group.endTime - group.startTime) * videoDurationMultiplier[0];
        const sectionContent = sections.find(s => s.name === group.name)?.text || 
                               group.timestamps.map(t => t.text).join(' ');
        
        // Use section-specific prompt if available, otherwise fall back to global style
        const sectionSpecificPrompt = getSectionPrompt(group.name);
        
        // If no match found but we have sectionPrompts, use the one at this index as fallback
        let prompt: string;
        if (sectionSpecificPrompt) {
          prompt = sectionSpecificPrompt;
        } else if (sectionPrompts.length > idx && sectionPrompts[idx]?.prompt) {
          prompt = sectionPrompts[idx].prompt;
        } else {
          prompt = `${stylePrefix}, ${group.name.toLowerCase()}: ${sectionContent.slice(0, 100)}`;
        }
        
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
        
        // Use section-specific prompt if available, otherwise fall back to global style
        const sectionSpecificPrompt = getSectionPrompt(section.name);
        
        // If no match found but we have sectionPrompts, use the one at this index as fallback
        let prompt: string;
        if (sectionSpecificPrompt) {
          prompt = sectionSpecificPrompt;
        } else if (sectionPrompts.length > index && sectionPrompts[index]?.prompt) {
          prompt = sectionPrompts[index].prompt;
        } else {
          prompt = `${stylePrefix}, ${section.name.toLowerCase()}: ${section.text.slice(0, 100)}`;
        }
        
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
    
    // Manual duration mode: create scenes from uploaded images
    if (useManualDuration && uploadedImages.length > 0) {
      const sceneDuration = manualSceneDuration * videoDurationMultiplier[0];
      return uploadedImages.map((img, index) => {
        const start = index * sceneDuration;
        const end = start + sceneDuration;
        
        return {
          section: `Scene ${index + 1}`,
          prompt: `${stylePrefix}, scene from uploaded image`,
          duration: sceneDuration,
          start,
          end,
          uploadedImage: img.preview,
          status: 'pending' as const,
        };
      });
    }
    
    return [];
  };

  // Prepare scenes for editing before generation
  const prepareScenes = async () => {
    const sceneList = calculateScenes();
    if (sceneList.length === 0) return;

    toast.info("Preparing scenes...");

    // Convert to editable format with lyrics extraction
    const prepared: EditableScene[] = sceneList.map((scene, i) => {
      // Extract lyrics for this scene
      let lyricText = "";
      if (uploadedSchedule[i]?.text) {
        lyricText = uploadedSchedule[i].text;
      } else if (timestamps.length > 0) {
        const sceneTimestamps = timestamps.filter(
          ts => ts.start >= scene.start && ts.start < scene.end
        );
        if (sceneTimestamps.length > 0) {
          lyricText = sceneTimestamps.map(ts => ts.text).join(' ');
        }
      }
      if (!lyricText && sections[i]?.text) {
        lyricText = sections[i].text;
      }
      if (!lyricText) {
        lyricText = scene.section;
      }

      // Copy uploaded image if exists for this index
      const existingImage = uploadedImages[i];

      return {
        section: scene.section,
        prompt: scene.prompt,
        lyrics: lyricText,
        duration: scene.duration,
        start: scene.start,
        end: scene.end,
        uploadedImage: existingImage ? { file: existingImage.file, preview: existingImage.preview } : undefined
      };
    });

    setEditableScenes(prepared);
    setIsPrepared(true);
    toast.success(`${prepared.length} scenes ready for editing`);
  };

  // Generate AI prompt for a single scene
  const generatePromptForScene = async (index: number, lyrics: string): Promise<string | null> => {
    setIsGeneratingPrompt(index);
    try {
      const scene = editableScenes[index];
      const sectionPromptData = sectionPrompts.find(sp => sp.section === scene.section);
      const narrativeBeat = sectionPromptData?.narrativeBeat;

      const promptRes = await supabase.functions.invoke("generate-scene-prompt", {
        body: {
          lyricLine: lyrics,
          sceneIndex: index,
          totalScenes: editableScenes.length,
          styleHint: moodPrompt || getStylePrefix(),
          previousPrompt: index > 0 ? editableScenes[index - 1]?.prompt : null,
          storyline: storyline,
          narrativeBeat: narrativeBeat,
          useSilhouetteMode: useSilhouetteMode,
          motionHint: MOTION_PRESETS[motionPreset].prompt
        }
      });

      if (promptRes.data?.prompt) {
        return promptRes.data.prompt;
      }
      return null;
    } catch (error) {
      console.error("Failed to generate prompt:", error);
      toast.error("Failed to generate prompt");
      return null;
    } finally {
      setIsGeneratingPrompt(null);
    }
  };

  const generateAllScenes = async () => {
    // Use editable scenes if prepared, otherwise calculate fresh
    const sceneList = isPrepared ? editableScenes.map(es => ({
      section: es.section,
      prompt: es.prompt,
      duration: es.duration,
      start: es.start,
      end: es.end,
      status: 'pending' as const
    })) : calculateScenes();
    
    if (sceneList.length === 0) return;

    // Check if we have enough images when using uploaded images
    if (uploadedImages.length > 0 && uploadedImages.length < sceneList.length) {
      toast.error(`Need ${sceneList.length} images, but only ${uploadedImages.length} uploaded. Upload more or generate remaining.`);
    }

    setScenes(sceneList);
    setIsGenerating(true);
    setCurrentSceneIndex(0);
    cancelGenerationRef.current = false; // Reset cancellation flag

    // Give React a tick to commit the initial scenes before we start patching them
    // (Otherwise early per-scene setScenes(prev => prev.map(...)) can run against an empty array)
    await new Promise((resolve) => setTimeout(resolve, 0));

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

    // Track the last frame from previous video for continuity
    let previousVideoLastFrame: string | null = null;

    // Track the previous prompt for variation
    let previousScenePrompt: string | null = null;

    for (let i = 0; i < sceneList.length; i++) {
      // Check if generation was cancelled
      if (cancelGenerationRef.current) {
        toast.info(`Generation stopped at scene ${i + 1}/${sceneList.length}`);
        break;
      }
      
      setCurrentSceneIndex(i);
      try {
        // Step 1: Get or generate prompt for this scene
        let scenePrompt = sceneList[i].prompt;
        
        // Skip prompt generation if scenes were prepared (user already edited prompts)
        if (!isPrepared) {
          // Get the lyric text for this scene to generate a unique prompt
          // Priority: uploaded schedule text > timestamp lyrics > section lyrics > section name
          let lyricText = "";
          if (uploadedSchedule[i]?.text) {
            lyricText = uploadedSchedule[i].text;
          } else if (timestamps.length > 0) {
            // Find timestamps that fall within this scene's time range
            const sceneTimestamps = timestamps.filter(
              ts => ts.start >= sceneList[i].start && ts.start < sceneList[i].end
            );
            if (sceneTimestamps.length > 0) {
              lyricText = sceneTimestamps.map(ts => ts.text).join(' ');
            }
          }
          // Fallback to section text or section name
          if (!lyricText && sections[i]?.text) {
            lyricText = sections[i].text;
          }
          if (!lyricText) {
            lyricText = sceneList[i].section;
          }
          
          console.log(`Scene ${i + 1} lyrics:`, lyricText.slice(0, 100));
          
          // Call AI to generate a unique prompt for this scene
          toast.info(`Scene ${i + 1}: Generating unique visual prompt...`);
          setScenes(prev => prev.map((s, idx) => 
            idx === i ? { ...s, status: 'generating-image' } : s
          ));
          
          try {
            // Find the narrative beat for this scene from sectionPrompts
            const sectionName = sceneList[i].section;
            const sectionPromptData = sectionPrompts.find(sp => sp.section === sectionName);
            const narrativeBeat = sectionPromptData?.narrativeBeat;
            
            const promptRes = await supabase.functions.invoke("generate-scene-prompt", {
              body: {
                lyricLine: lyricText,
                sceneIndex: i,
                totalScenes: sceneList.length,
                styleHint: moodPrompt || getStylePrefix(),
                previousPrompt: previousScenePrompt,
                storyline: storyline,
                narrativeBeat: narrativeBeat,
                useSilhouetteMode: useSilhouetteMode,
                motionHint: MOTION_PRESETS[motionPreset].prompt
              }
            });
            
            if (promptRes.data?.prompt) {
              scenePrompt = promptRes.data.prompt;
              console.log(`Scene ${i + 1} AI prompt:`, scenePrompt);
              
              // Update the scene with the new prompt
              setScenes(prev => prev.map((s, idx) => 
                idx === i ? { ...s, prompt: scenePrompt } : s
              ));
            }
          } catch (promptError) {
            console.warn(`Scene ${i + 1}: Failed to generate AI prompt, using fallback`, promptError);
          }
        } else {
          // Using prepared scenes - prompts already set by user
          console.log(`Scene ${i + 1} using prepared prompt:`, scenePrompt.slice(0, 100));
          toast.info(`Scene ${i + 1}: Using prepared prompt`);
        }
        
        previousScenePrompt = scenePrompt;
        
        let imageUrl: string;
        
        // Priority for image source:
        // 1. Frame continuity - use last frame from previous video (if enabled and available)
        // 2. Uploaded image for this specific scene
        // 3. Generate new image with AI
        
        if (useFrameContinuity && previousVideoLastFrame && i > 0) {
          // Use the last frame from previous video as starting point
          console.log(`Scene ${i + 1}: Using last frame from scene ${i} for continuity`);
          imageUrl = previousVideoLastFrame;
          
          setScenes(prev => prev.map((s, idx) => 
            idx === i ? { ...s, imageUrl: previousVideoLastFrame!, status: autoGenerateVideo ? 'generating-video' : 'complete' } : s
          ));
          
          toast.info(`Scene ${i + 1}: Using frame continuity from previous clip`);
        } else if (isPrepared && editableScenes[i]?.uploadedImage) {
          // Use image from editable scene
          const file = editableScenes[i].uploadedImage!.file;
          const base64 = await fileToBase64(file);
          imageUrl = base64;
          
          setScenes(prev => prev.map((s, idx) => 
            idx === i ? { ...s, imageUrl: editableScenes[i].uploadedImage!.preview, uploadedImage: base64, status: autoGenerateVideo ? 'generating-video' : 'complete' } : s
          ));
        } else if (uploadedImages[i]) {
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

          // Check if we should use local ComfyUI generation
          if (useLocalGeneration) {
            // Use local ComfyUI
            toast.info(`Scene ${i + 1}: Generating image locally...`);
            try {
              const localResult = await generateLocalImage(scenePrompt, {
                seed: sceneSeed,
                width: sizeConfig.width,
                height: sizeConfig.height,
              });
              imageUrl = localResult.imageUrl;
              console.log(`Scene ${i + 1}: Local image generated (seed: ${localResult.seed})`);
            } catch (localError) {
              console.error(`Scene ${i + 1}: Local generation failed, falling back to cloud`, localError);
              toast.warning(`Scene ${i + 1}: Local failed, using cloud...`);
              
              // Fallback to cloud
              const imageRes = await supabase.functions.invoke("generate-image", {
                body: { 
                  prompt: scenePrompt,
                  seed: sceneSeed,
                  width: sizeConfig.width,
                  height: sizeConfig.height,
                  quality: imageQuality[0]
                },
              });
              if (imageRes.error) throw imageRes.error;
              imageUrl = imageRes.data.imageUrl;
            }
          } else {
            // Use cloud (Replicate)
            const imageRes = await supabase.functions.invoke("generate-image", {
              body: { 
                prompt: scenePrompt, // Use the AI-generated prompt
                seed: sceneSeed,
                width: sizeConfig.width,
                height: sizeConfig.height,
                quality: imageQuality[0]
              },
            });

            if (imageRes.error) throw imageRes.error;
            imageUrl = imageRes.data.imageUrl;
          }

          const shouldGenerateVideo = autoGenerateVideo;
          setScenes(prev => prev.map((s, idx) => 
            idx === i ? { ...s, imageUrl, status: shouldGenerateVideo ? 'generating-video' : 'complete' } : s
          ));
        }

        // Generate video if enabled
        if (autoGenerateVideo) {
          const motionPrompt = MOTION_PRESETS[motionPreset].prompt;
          const sizeConfig = VIDEO_SIZES[videoSize];
          const fpsValue = FPS_OPTIONS[videoFps].value;
          
          // Analyze the image and generate a motion-aware video prompt
          let videoPrompt = `${scenePrompt}, ${motionPrompt}`;
          
          try {
            console.log(`Scene ${i + 1}: Analyzing image for video motion prompt...`);
            const lyricText = sceneList[i].section;
            
            const videoPromptRes = await supabase.functions.invoke("generate-video-prompt", {
              body: {
                imageUrl: imageUrl,
                motionHint: motionPrompt,
                lyricContext: lyricText,
              },
            });
            
            if (videoPromptRes.data?.videoPrompt) {
              videoPrompt = videoPromptRes.data.videoPrompt;
              console.log(`Scene ${i + 1}: AI video prompt:`, videoPrompt.slice(0, 100) + "...");
            }
          } catch (videoPromptError) {
            console.warn(`Scene ${i + 1}: Failed to generate video prompt from image, using fallback`, videoPromptError);
            // Fall back to motion variations
            const motionVariations = [
              "gentle forward camera push with subtle parallax",
              "slow pan left to right across scene", 
              "subtle zoom out revealing the full scene",
              "smooth dolly forward movement",
              "slow tracking shot moving right",
              "gentle parallax shift with depth layers",
              "subtle floating camera drift upward",
              "slow reveal with increasing depth of field",
              "smooth arc movement around subject",
              "gentle pull back with widening view",
              "slow pan right to left exploring scene",
              "subtle push in focusing on details",
              "dreamy floating drift motion",
              "cinematic dolly zoom effect",
              "gentle sway with natural movement",
              "slow diagonal drift top-left to bottom-right",
            ];
            const sceneMotion = motionVariations[i % motionVariations.length];
            videoPrompt = `${scenePrompt}, ${motionPrompt}, ${sceneMotion}`;
          }
          
          // Use unique seed per scene for video (same base + offset for consistency with variation)
          const videoSeed = batchSeed ? batchSeed + i * 100 : undefined;

          if (useLocalGeneration) {
            try {
              toast.info(`Scene ${i + 1}: Generating video locally (ComfyUI AnimateDiff)...`, { duration: 8000 });

              // Local duration is controlled by frames / frameRate (NOT a separate "seconds" param)
              const targetSeconds = Math.min(sceneList[i].duration, 10);
              const localFps = Math.max(1, Math.min(videoSettings.frameRate ?? 6, 60));

              // Safety cap to avoid accidental OOM on consumer GPUs
              const maxLocalFrames = 120;
              const requestedFrames = Math.max(8, Math.round(targetSeconds * localFps));
              const localFrames = Math.min(maxLocalFrames, requestedFrames);

              if (localFrames !== requestedFrames) {
                const cappedSeconds = (localFrames / localFps).toFixed(1);
                toast.warning(
                  `Scene ${i + 1}: Capped to ${localFrames} frames (~${cappedSeconds}s) to avoid VRAM spikes.`,
                  { duration: 8000 }
                );
              }

              const localVideo = await generateLocalVideo(imageUrl, videoPrompt, {
                seed: typeof videoSeed === "number" ? videoSeed : undefined,
                settingsOverride: {
                  frameRate: localFps,
                  frames: localFrames,
                },
              });

              const videoUrl = localVideo.videoUrl;

              setScenes(prev => prev.map((s, idx) =>
                idx === i ? { ...s, videoUrl, status: 'complete' } : s
              ));

              // Track clip duration and recalculate estimated clips
              const clipDuration = sceneList[i].duration;
              setCompletedClipDurations(prev => {
                const newDurations = [...prev, clipDuration];
                const avgDuration = newDurations.reduce((a, b) => a + b, 0) / newDurations.length;
                setAvgClipDuration(avgDuration);

                if (audioDuration) {
                  const completedTime = newDurations.reduce((a, b) => a + b, 0);
                  const remainingTime = audioDuration - completedTime;
                  const remainingClips = Math.ceil(remainingTime / avgDuration);
                  setEstimatedClips(newDurations.length + Math.max(0, remainingClips));
                }

                return newDurations;
              });

              // Extract last frame for continuity with next scene
              if (useFrameContinuity && videoUrl) {
                setIsExtractingFrame(true);
                console.log(`Scene ${i + 1}: Extracting last frame for continuity...`);
                const lastFrame = await extractLastFrame(videoUrl);
                setIsExtractingFrame(false);

                if (lastFrame) {
                  previousVideoLastFrame = lastFrame;
                  console.log(`Scene ${i + 1}: Last frame extracted successfully`);
                } else {
                  console.warn(`Scene ${i + 1}: Failed to extract last frame, next scene will use AI generation`);
                  previousVideoLastFrame = null;
                }
              }
            } catch (localVideoError: any) {
              console.error(`Scene ${i + 1}: Local video generation failed`, localVideoError);
              setScenes(prev => prev.map((s, idx) =>
                idx === i ? { ...s, status: 'error' } : s
              ));

              const msg = localVideoError instanceof Error ? localVideoError.message : String(localVideoError);
              if (msg.includes("ANIMATEDIFF_NOT_INSTALLED")) {
                toast.error("Local video needs AnimateDiff installed in ComfyUI.");
              } else if (msg.includes("NO_SD15_CHECKPOINT")) {
                toast.error("Local video needs at least one SD1.5 checkpoint in ComfyUI.");
              } else {
                toast.error(`Scene ${i + 1}: Local video failed`);
              }

              previousVideoLastFrame = null;
            }
          } else {
            const videoPayload: Record<string, unknown> = {
              imageUrl,
              prompt: videoPrompt,
              duration: Math.min(sceneList[i].duration, 10), // seedance supports up to 12s
              resolution: sizeConfig.maxArea, // "480p", "720p", or "1080p"
              aspectRatio: ASPECT_RATIOS[aspectRatio].value, // "16:9", "9:16", or "1:1"
              fps: fpsValue,
              seed: videoSeed,
            };
          
          console.log(`Scene ${i + 1}: Using unique motion prompt and seed for variation`);
          
          // Start async video generation
          const videoRes = await supabase.functions.invoke("generate-video", {
            body: videoPayload,
          });

          if (videoRes.error) {
            // Handle WORKER_LIMIT by waiting and retrying
            if (videoRes.error.message?.includes('WORKER_LIMIT')) {
              console.log("Worker limit hit, waiting 30s before retry...");
              await new Promise(resolve => setTimeout(resolve, 30000));
              continue;
            }
            throw videoRes.error;
          }
          
          // Poll for video completion - videos can take 3-5 minutes
          const taskId = videoRes.data.taskId;
          let videoUrl: string | null = null;
          let attempts = 0;
          const maxAttempts = 90; // ~7.5 minutes max (5s intervals)
          
          toast.info(`Scene ${i + 1}: Video generating (ID: ${taskId.slice(0, 8)}...)`, {
            duration: 10000,
          });
          
          while (attempts < maxAttempts && !videoUrl) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            try {
              const pollRes = await supabase.functions.invoke("generate-video", {
                body: { taskId }
              });
              
              // Handle any error by just continuing to poll
              if (pollRes.error) {
                console.log(`Poll attempt ${attempts + 1} error:`, pollRes.error.message);
                // Don't increment attempts on error, just wait and retry
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
              }
              
              const status = pollRes.data?.status;
              console.log(`Scene ${i + 1} poll ${attempts + 1}: status=${status}`);
              
              if (status === "succeeded" && pollRes.data?.videoUrl) {
                videoUrl = pollRes.data.videoUrl;
                console.log(`Scene ${i + 1} video ready:`, videoUrl);
              } else if (status === "failed") {
                // If Replicate internal error, mark scene as failed and move on
                console.error(`Scene ${i + 1} failed:`, pollRes.data.error);
                setScenes(prev => prev.map((s, idx) => 
                  idx === i ? { ...s, status: 'error' } : s
                ));
                toast.error(`Scene ${i + 1} failed: ${pollRes.data.error || 'Video generation failed'}. Skipping to next scene.`);
                // Clear the last frame so next scene generates fresh image
                previousVideoLastFrame = null;
                break; // Exit polling loop and continue to next scene
              }
              // For "preparing", "queueing", or "processing", just continue polling
            } catch (pollError: any) {
              // Only throw if it's a definite failure from Minimax
              if (pollError.message?.includes("failed on Minimax")) {
                throw pollError;
              }
              console.error("Poll error (will retry):", pollError);
            }
            attempts++;
          }
          
          if (!videoUrl) {
            console.warn(`Scene ${i + 1} timed out after ${attempts} attempts. Task ID: ${taskId}`);
            toast.warning(`Scene ${i + 1} timed out. Use "Check Status" button to retrieve when ready.`);
            // Store task ID and mark as processing so user can check later
            setScenes(prev => prev.map((s, idx) => 
              idx === i ? { ...s, taskId, status: 'processing' } : s
            ));
            // Continue to next scene
            continue;
          }

          setScenes(prev => prev.map((s, idx) => 
            idx === i ? { ...s, videoUrl, status: 'complete' } : s
          ));
          
          // Track clip duration and recalculate estimated clips
          const clipDuration = sceneList[i].duration;
          setCompletedClipDurations(prev => {
            const newDurations = [...prev, clipDuration];
            const avgDuration = newDurations.reduce((a, b) => a + b, 0) / newDurations.length;
            setAvgClipDuration(avgDuration);
            
            // Recalculate estimated clips based on actual average
            if (audioDuration) {
              const completedTime = newDurations.reduce((a, b) => a + b, 0);
              const remainingTime = audioDuration - completedTime;
              const remainingClips = Math.ceil(remainingTime / avgDuration);
              setEstimatedClips(newDurations.length + Math.max(0, remainingClips));
            }
            
            return newDurations;
          });
          
          // Extract last frame for continuity with next scene
          if (useFrameContinuity && videoUrl) {
            setIsExtractingFrame(true);
            console.log(`Scene ${i + 1}: Extracting last frame for continuity...`);
            const lastFrame = await extractLastFrame(videoUrl);
            setIsExtractingFrame(false);
            
            if (lastFrame) {
              previousVideoLastFrame = lastFrame;
              console.log(`Scene ${i + 1}: Last frame extracted successfully`);
            } else {
              console.warn(`Scene ${i + 1}: Failed to extract last frame, next scene will use AI generation`);
              previousVideoLastFrame = null;
            }
          }
          
          // Add delay between scene video generations to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 2000));
          }
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

  // Stop the scene generation loop and cancel any already-submitted video jobs
  const stopGenerating = async () => {
    cancelGenerationRef.current = true;
    toast.info("Stopping generation and cancelling running jobs...");
    await cancelAllJobs();
  };

  // Cancel all pending/processing video generation jobs (including orphaned ones)
  const cancelAllJobs = async () => {
    const pendingScenes = scenes.filter(s => s.taskId && (s.status === 'processing' || s.status === 'generating-video'));
    const allTaskIds = [...new Set([
      ...pendingScenes.map(s => s.taskId!),
      ...orphanedTaskIds
    ])];
    
    if (allTaskIds.length === 0) {
      toast.info("No pending jobs to cancel");
      return;
    }

    setIsCancelling(true);
    toast.info(`Cancelling ${allTaskIds.length} pending jobs...`);

    let cancelled = 0;
    for (const taskId of allTaskIds) {
      try {
        await supabase.functions.invoke("generate-video", {
          body: { action: "cancel", taskId }
        });
        cancelled++;
        
        // Update scene status if it exists in scenes
        setScenes(prev => prev.map(s => 
          s.taskId === taskId ? { ...s, status: 'error' as const } : s
        ));
      } catch (err) {
        console.error(`Failed to cancel job ${taskId}:`, err);
      }
    }

    // Clear orphaned task IDs and localStorage
    setOrphanedTaskIds([]);
    localStorage.removeItem(PENDING_JOBS_KEY);
    
    setIsCancelling(false);
    setIsGenerating(false);
    toast.success(`Cancelled ${cancelled} jobs`);
  };

  // Check status of a specific scene by its task ID
  const checkSceneStatus = async (sceneIndex: number) => {
    const scene = scenes[sceneIndex];
    if (!scene.taskId) {
      toast.error("No task ID for this scene");
      return;
    }

    toast.info(`Checking status for scene ${sceneIndex + 1}...`);
    
    try {
      const res = await supabase.functions.invoke("generate-video", {
        body: { taskId: scene.taskId }
      });
      
      if (res.error) {
        toast.error(`Error checking status: ${res.error.message}`);
        return;
      }
      
      const status = res.data?.status;
      console.log(`Scene ${sceneIndex + 1} status:`, status, res.data);
      
      if (status === "succeeded" && res.data?.videoUrl) {
        setScenes(prev => prev.map((s, idx) => 
          idx === sceneIndex ? { ...s, videoUrl: res.data.videoUrl, status: 'complete' } : s
        ));
        toast.success(`Scene ${sceneIndex + 1} video retrieved!`);
      } else if (status === "failed") {
        setScenes(prev => prev.map((s, idx) => 
          idx === sceneIndex ? { ...s, status: 'error' } : s
        ));
        toast.error(`Scene ${sceneIndex + 1} failed on Minimax`);
      } else {
        toast.info(`Scene ${sceneIndex + 1} still ${status}. Try again in a minute.`);
      }
    } catch (error: any) {
      console.error("Check status error:", error);
      toast.error(`Failed to check status: ${error.message}`);
    }
  };

  // Check all processing scenes at once
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  
  const checkAllProcessingScenes = async () => {
    const processingScenes = scenes
      .map((s, i) => ({ scene: s, index: i }))
      .filter(({ scene }) => scene.status === 'processing' && scene.taskId);
    
    if (processingScenes.length === 0) {
      toast.info("No scenes currently processing");
      return;
    }

    setIsCheckingAll(true);
    toast.info(`Checking ${processingScenes.length} processing scenes...`);
    
    let retrieved = 0;
    let stillProcessing = 0;
    let failed = 0;
    
    for (const { scene, index } of processingScenes) {
      try {
        const res = await supabase.functions.invoke("generate-video", {
          body: { taskId: scene.taskId }
        });
        
        if (res.error) {
          console.error(`Scene ${index + 1} check error:`, res.error);
          continue;
        }
        
        const status = res.data?.status;
        
        if (status === "succeeded" && res.data?.videoUrl) {
          setScenes(prev => prev.map((s, idx) => 
            idx === index ? { ...s, videoUrl: res.data.videoUrl, status: 'complete' } : s
          ));
          retrieved++;
        } else if (status === "failed") {
          setScenes(prev => prev.map((s, idx) => 
            idx === index ? { ...s, status: 'error' } : s
          ));
          failed++;
        } else {
          stillProcessing++;
        }
        
        // Small delay between checks to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Error checking scene ${index + 1}:`, error);
      }
    }
    
    setIsCheckingAll(false);
    
    if (retrieved > 0) {
      toast.success(`Retrieved ${retrieved} video(s)!`);
    }
    if (stillProcessing > 0) {
      toast.info(`${stillProcessing} scene(s) still processing`);
    }
    if (failed > 0) {
      toast.error(`${failed} scene(s) failed`);
    }
  };

  const processingCount = scenes.filter(s => s.status === 'processing').length;

  const [isCreatingZip, setIsCreatingZip] = useState(false);

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

  const downloadAsZipWithInstructions = async () => {
    const videos = scenes.filter(s => s.videoUrl);
    if (videos.length === 0) {
      toast.error("No videos to download");
      return;
    }

    setIsCreatingZip(true);
    toast.info("Creating ZIP package...");

    try {
      const zip = new JSZip();
      const videosFolder = zip.folder("videos");
      
      // Download each video and add to ZIP
      for (let i = 0; i < videos.length; i++) {
        const scene = videos[i];
        const filename = `${String(i + 1).padStart(2, '0')}_${scene.section.replace(/\s+/g, '_')}.mp4`;
        
        try {
          const response = await fetch(scene.videoUrl!);
          const blob = await response.blob();
          videosFolder?.file(filename, blob);
          console.log(`Added ${filename} to ZIP`);
        } catch (err) {
          console.error(`Failed to fetch ${scene.videoUrl}:`, err);
        }
      }

      // Create file list for FFmpeg
      const fileList = videos.map((_, i) => 
        `file '${String(i + 1).padStart(2, '0')}_${videos[i].section.replace(/\s+/g, '_')}.mp4'`
      ).join('\n');
      
      videosFolder?.file("file_list.txt", fileList);

      // Create README with FFmpeg instructions
      const readme = `# Music Video Export
      
## Files Included
${videos.map((scene, i) => `- ${String(i + 1).padStart(2, '0')}_${scene.section.replace(/\s+/g, '_')}.mp4 (${scene.section})`).join('\n')}

## How to Combine Videos

### Option 1: FFmpeg (Recommended)
1. Install FFmpeg: https://ffmpeg.org/download.html
2. Open terminal/command prompt in the 'videos' folder
3. Run this command:

\`\`\`bash
ffmpeg -f concat -safe 0 -i file_list.txt -c copy combined_video.mp4
\`\`\`

### Option 2: With Audio Track
If you have an audio file (song.mp3), use:

\`\`\`bash
ffmpeg -f concat -safe 0 -i file_list.txt -i song.mp3 -c:v copy -c:a aac -shortest combined_with_audio.mp4
\`\`\`

### Option 3: Online Tools
- Kapwing: https://www.kapwing.com/tools/merge-video
- Clideo: https://clideo.com/merge-video

## Scene Details
${videos.map((scene, i) => `
### Scene ${i + 1}: ${scene.section}
- Start: ${scene.start}s
- End: ${scene.end}s
- Duration: ${scene.end - scene.start}s
`).join('\n')}

Generated by LyricVision on ${new Date().toLocaleDateString()}
`;

      zip.file("README.md", readme);

      // Generate and download ZIP
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = "music_video_export.zip";
      a.click();
      URL.revokeObjectURL(url);

      toast.success("ZIP package downloaded! Check README.md for instructions.");
    } catch (error) {
      console.error("Failed to create ZIP:", error);
      toast.error("Failed to create ZIP package");
    } finally {
      setIsCreatingZip(false);
    }
  };

  const previewScenes = calculateScenes();

  // When generating, show the live (mutating) scenes array, otherwise show the calculated preview.
  const scenesForDisplay = isGenerating && scenes.length > 0 ? scenes : previewScenes;
  const totalDuration = scenesForDisplay.reduce((acc, s) => acc + s.duration, 0);
  const completedScenes = scenes.filter(s => s.status === 'complete').length;
  const hasSourceData = uploadedSchedule.length > 0 || sections.length > 0 || (useManualDuration && uploadedImages.length > 0);
  
  // Get FPS for Remotion
  const fps = FPS_OPTIONS[videoFps].value;
  const sizeConfig = VIDEO_SIZES[videoSize];
  
  // Motion types for Ken Burns
  const MOTION_TYPES: SceneData["motionType"][] = [
    "zoomIn", "panRight", "zoomOut", "panLeft", "panUp", "panDown"
  ];
  
  // Convert generated scenes to Remotion format
  const remotionScenes: SceneData[] = useMemo(() => {
    return scenes
      .filter(s => s.imageUrl && s.status === 'complete')
      .map((scene, index) => ({
        imageUrl: scene.imageUrl!,
        startFrame: Math.round(scene.start * fps),
        durationInFrames: Math.round((scene.end - scene.start) * fps),
        motionType: MOTION_TYPES[index % MOTION_TYPES.length],
        sectionName: scene.section,
      }));
  }, [scenes, fps]);
  
  const hasCompletedScenes = remotionScenes.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Import Schedule & Audio Track - Side by Side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

        {/* Audio Upload Card */}
        <Card className="p-6 glass-card border-border/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Music className="w-5 h-5 text-accent" />
              <h3 className="font-semibold">Audio Track</h3>
            </div>
            {audioFile && (
              <Button variant="ghost" size="sm" onClick={() => { 
                if (audioUrl) URL.revokeObjectURL(audioUrl);
                setAudioFile(null); 
                setAudioUrl(""); 
              }}>
                <X className="w-4 h-4 mr-1" />
                Remove
              </Button>
            )}
          </div>
          
          <div className="space-y-4">
            <div className="relative">
              <Input
                type="file"
                accept="audio/*"
                onChange={handleAudioUpload}
                className="hidden"
                id="audio-upload"
              />
              <label
                htmlFor="audio-upload"
                className="flex items-center justify-center gap-3 h-24 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-accent/50 hover:bg-muted/20 transition-all group"
              >
                <div className="flex flex-col items-center gap-2 text-muted-foreground group-hover:text-foreground transition-colors">
                  <Music className="w-6 h-6" />
                  <span className="text-sm font-medium">
                    {audioFile ? audioFile.name : "Upload audio for final video"}
                  </span>
                </div>
              </label>
            </div>
            
            {audioFile && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <span className="text-green-500">✓</span>
                Audio loaded: {audioFile.name}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Scene Images & Lyrics - Side by Side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Scene Images Card */}
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
              <div className="grid grid-cols-4 gap-2">
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
            
            {/* Manual Duration Mode & Quick Generate */}
            {(uploadedImages.length > 0 || lyricsAnalysis) && uploadedSchedule.length === 0 && sections.length === 0 && (
              <div className="mt-4 p-4 rounded-lg bg-muted/30 border border-border/50 space-y-4">
                {/* Quick Generate from Lyrics */}
                {lyricsAnalysis && lyricsAnalysis.storylines && lyricsAnalysis.storylines.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-secondary" />
                      <Label className="text-sm font-medium">Quick Generate</Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Click a duration to auto-generate scene images from your lyrics & storyline:
                    </p>
                    
                    {/* Scene Duration Control */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">Seconds per clip:</Label>
                        <span className="text-xs font-mono text-primary">{manualSceneDuration}s</span>
                      </div>
                      <Slider
                        value={[manualSceneDuration]}
                        onValueChange={(v) => setManualSceneDuration(v[0])}
                        min={3}
                        max={10}
                        step={1}
                        className="w-full"
                        disabled={isGeneratingQuickTarget}
                      />
                    </div>
                    
                    {/* Clickable Duration Targets */}
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      {[
                        { label: "1 min", seconds: 60 },
                        { label: "4 min", seconds: 240 },
                        { label: "10 min", seconds: 600 },
                        { label: "30 min", seconds: 1800 },
                      ].map(({ label, seconds }) => {
                        const imagesNeeded = Math.ceil(seconds / manualSceneDuration);
                        const isMet = uploadedImages.length >= imagesNeeded;
                        const isGenerating = isGeneratingQuickTarget && quickTargetProgress;
                        
                        return (
                          <button
                            key={label}
                            onClick={() => generateQuickTargetImages(seconds)}
                            disabled={isGeneratingQuickTarget}
                            className={`p-3 rounded-lg text-center border transition-all ${
                              isMet 
                                ? 'bg-green-500/10 border-green-500/30 text-green-600' 
                                : 'bg-muted/30 border-border/50 hover:border-primary/50 hover:bg-primary/10 cursor-pointer'
                            } ${isGeneratingQuickTarget ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <div className="font-semibold">{label}</div>
                            <div className="text-muted-foreground">{imagesNeeded} imgs</div>
                            {!isMet && !isGenerating && (
                              <div className="text-[10px] text-primary mt-1">Click to generate</div>
                            )}
                            {isMet && (
                              <div className="text-[10px] text-green-500 mt-1">✓ Ready</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    
                    {/* Generation Progress */}
                    {isGeneratingQuickTarget && quickTargetProgress && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            Generating images...
                          </span>
                          <span className="font-mono text-primary">
                            {quickTargetProgress.current}/{quickTargetProgress.total}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${(quickTargetProgress.current / quickTargetProgress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Separator if both sections shown */}
                {lyricsAnalysis && uploadedImages.length > 0 && (
                  <div className="border-t border-border/30 pt-4" />
                )}
                
                {/* Manual Duration Toggle - show when have images */}
                {uploadedImages.length > 0 && (
                  <>
                    <div className="flex items-center gap-3">
                      <Switch
                        id="manual-duration"
                        checked={useManualDuration}
                        onCheckedChange={setUseManualDuration}
                      />
                      <Label htmlFor="manual-duration" className="text-sm font-medium cursor-pointer">
                        Manual Duration Mode
                      </Label>
                    </div>
                    
                    {useManualDuration && (
                      <div className="space-y-4">
                        {!lyricsAnalysis && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-sm text-muted-foreground">Scene Duration (per clip)</Label>
                              <span className="text-sm font-mono text-primary">{manualSceneDuration}s</span>
                            </div>
                            <Slider
                              value={[manualSceneDuration]}
                              onValueChange={(v) => setManualSceneDuration(v[0])}
                              min={3}
                              max={10}
                              step={1}
                              className="w-full"
                            />
                            <p className="text-xs text-muted-foreground">
                              Video API limit: 3-10 seconds per clip. Frame continuity chains clips together.
                            </p>
                          </div>
                        )}
                        
                        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Total Video Duration:</span>
                            <span className="font-mono font-semibold text-primary text-lg">
                              {Math.floor((uploadedImages.length * manualSceneDuration) / 60)}:{String(Math.round((uploadedImages.length * manualSceneDuration) % 60)).padStart(2, '0')}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {uploadedImages.length} images × {manualSceneDuration}s = {uploadedImages.length * manualSceneDuration}s
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                
                {/* Help text when no images yet */}
                {uploadedImages.length === 0 && !lyricsAnalysis && (
                  <p className="text-xs text-muted-foreground">
                    Upload lyrics and analyze them to auto-generate scene images, or upload your own images.
                  </p>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Lyrics Card */}
        <Card className="p-6 glass-card border-border/50 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Lyrics</h3>
            </div>
            {lyricsFile && (
              <Button variant="ghost" size="sm" onClick={() => { 
                setLyricsFile(null); 
                setLyricsContent(""); 
                setLyricsAnalysis(null);
              }}>
                <X className="w-4 h-4 mr-1" />
                Remove
              </Button>
            )}
          </div>
          
          <div className="space-y-4 flex-1">
            <div className="relative">
              <Input
                type="file"
                accept=".txt"
                onChange={handleLyricsUpload}
                className="hidden"
                id="lyrics-upload"
              />
              <label
                htmlFor="lyrics-upload"
                className="flex items-center justify-center gap-3 h-24 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-all group"
              >
                <div className="flex flex-col items-center gap-2 text-muted-foreground group-hover:text-foreground transition-colors">
                  <FileText className="w-8 h-8" />
                  <span className="text-sm font-medium">
                    {lyricsFile ? lyricsFile.name : "Upload lyrics .txt file"}
                  </span>
                  <span className="text-xs text-muted-foreground/60">
                    Plain text file with song lyrics
                  </span>
                </div>
              </label>
            </div>
            
            {lyricsContent && !lyricsAnalysis && (
              <div className="max-h-32 overflow-y-auto p-3 bg-muted/30 rounded-lg">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                  {lyricsContent.slice(0, 300)}{lyricsContent.length > 300 ? '...' : ''}
                </pre>
              </div>
            )}
            
            {lyricsFile && !lyricsAnalysis && (
              <Button 
                onClick={analyzeLyrics} 
                disabled={isAnalyzingLyrics}
                className="w-full"
              >
                {isAnalyzingLyrics ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Analyze & Generate Storylines
                  </>
                )}
              </Button>
            )}
            
            {lyricsAnalysis && (
              <div className="text-sm text-green-600 flex items-center gap-2">
                <span className="text-green-500">✓</span>
                {lyricsAnalysis.storylines?.length || 0} storylines generated
              </div>
            )}
          </div>
        </Card>
      </div>
      
      {/* Storyline Selection */}
      {lyricsAnalysis && lyricsAnalysis.storylines && lyricsAnalysis.storylines.length > 0 && (
        <Card className="p-6 glass-card border-border/50">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-secondary" />
            <h3 className="font-semibold">Choose Your Storyline</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Select one of the 3 interpretations below. Each offers a different creative direction for your music video.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {lyricsAnalysis.storylines.map((storyline, index) => (
              <div
                key={index}
                onClick={() => setSelectedStorylineIndex(index)}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  selectedStorylineIndex === index 
                    ? 'border-primary bg-primary/10' 
                    : 'border-border hover:border-primary/50 hover:bg-muted/20'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    storyline.type === 'literal' ? 'bg-blue-500/20 text-blue-400' :
                    storyline.type === 'metaphorical' ? 'bg-purple-500/20 text-purple-400' :
                    'bg-pink-500/20 text-pink-400'
                  }`}>
                    {storyline.type.charAt(0).toUpperCase() + storyline.type.slice(1)}
                  </span>
                  {selectedStorylineIndex === index && (
                    <span className="text-xs text-primary font-medium">Selected</span>
                  )}
                </div>
                <h4 className="font-semibold text-foreground mb-2">{storyline.title}</h4>
                <p className="text-xs text-muted-foreground mb-3">{storyline.summary}</p>
                
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Arc:</span>{' '}
                    <span className="text-foreground">{storyline.emotionalArc}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Setting:</span>{' '}
                    <span className="text-foreground">{storyline.setting}</span>
                  </div>
                  {storyline.colorPalette && (
                    <div>
                      <span className="text-muted-foreground">Colors:</span>{' '}
                      <span className="text-foreground">{storyline.colorPalette}</span>
                    </div>
                  )}
                </div>
                
                {storyline.visualMotifs && storyline.visualMotifs.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {storyline.visualMotifs.slice(0, 4).map((motif, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-muted rounded text-[10px] text-muted-foreground">
                        {motif}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {/* Selected storyline details */}
          {lyricsAnalysis.storylines[selectedStorylineIndex] && (
            <div className="mt-4 p-4 bg-muted/30 rounded-lg">
              <h4 className="text-sm font-medium mb-2">Protagonist Description</h4>
              <p className="text-xs text-muted-foreground">
                {lyricsAnalysis.storylines[selectedStorylineIndex].protagonist}
              </p>
              {lyricsAnalysis.storylines[selectedStorylineIndex].cinematicStyle && (
                <div className="mt-3">
                  <h4 className="text-sm font-medium mb-1">Cinematic Style</h4>
                  <p className="text-xs text-muted-foreground">
                    {lyricsAnalysis.storylines[selectedStorylineIndex].cinematicStyle}
                  </p>
                </div>
              )}
            </div>
          )}
          
          {/* Generate Scene Prompts Button */}
          <div className="mt-4">
            <Button 
              onClick={generateScenePromptsFromStoryline}
              disabled={isGeneratingScenePrompts || !uploadedSchedule.length}
              className="w-full"
              size="lg"
            >
              {isGeneratingScenePrompts ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating Scene Prompts...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Scene Prompts from Storyline
                </>
              )}
            </Button>
            {!uploadedSchedule.length && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Upload a schedule file first to generate scene prompts
              </p>
            )}
          </div>
        </Card>
      )}
      
      {/* Generated Scene Prompts Preview */}
      {generatedScenePrompts.length > 0 && (
        <Card className="p-6 glass-card border-border/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Film className="w-5 h-5 text-accent" />
              <h3 className="font-semibold">Generated Scene Prompts</h3>
              <span className="text-xs text-muted-foreground">({generatedScenePrompts.length} scenes)</span>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setGeneratedScenePrompts([])}
            >
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          </div>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {generatedScenePrompts.map((scene, index) => (
              <div key={index} className="p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-primary">Scene {index + 1}</span>
                  {scene.narrativeBeat && (
                    <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      {scene.narrativeBeat.split(' - ')[0]}
                    </span>
                  )}
                </div>
                <p className="text-sm text-foreground">{scene.prompt}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Settings Card */}
      <Collapsible defaultOpen={false}>
        <Card className="p-6 glass-card border-border/50">
          <CollapsibleTrigger className="flex items-center justify-between w-full group">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Video Generation Settings</h3>
            </div>
            <ChevronDown className="w-5 h-5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-4">
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

          {/* Aspect Ratio */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Aspect Ratio</Label>
            <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as keyof typeof ASPECT_RATIOS)}>
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background border-border">
                {Object.entries(ASPECT_RATIOS).map(([key, value]) => (
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
            <Select value={styleSource} onValueChange={(v) => setStyleSource(v as "preset" | "mood" | "manual" | "reference")}>
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background border-border">
                <SelectItem value="preset">Use Preset Style</SelectItem>
                <SelectItem value="reference">
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-3 h-3" />
                    Use Reference Image Style {referenceImage ? "✓" : ""}
                  </span>
                </SelectItem>
                <SelectItem value="mood" disabled={!moodPrompt}>
                  Use Mood Image Prompt {!moodPrompt && "(analyze lyrics first)"}
                </SelectItem>
                <SelectItem value="manual">Manual Custom Style</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reference Image Upload - show when reference is selected */}
          {styleSource === "reference" && (
            <div className="space-y-3 md:col-span-2">
              <Label className="text-sm text-muted-foreground">Reference Image</Label>
              
              {!referenceImage ? (
                <div className="relative">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleReferenceImageUpload}
                    className="hidden"
                    id="reference-image-upload"
                  />
                  <label
                    htmlFor="reference-image-upload"
                    className="flex items-center justify-center gap-3 h-20 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-all group"
                  >
                    <div className="flex items-center gap-2 text-muted-foreground group-hover:text-foreground transition-colors">
                      <Sparkles className="w-5 h-5" />
                      <span className="text-sm font-medium">Upload a reference image for style</span>
                    </div>
                  </label>
                </div>
              ) : (
                <div className="flex gap-4 items-start">
                  <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-border">
                    <img 
                      src={referenceImage.preview} 
                      alt="Reference" 
                      className="w-full h-full object-cover"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-1 right-1 w-6 h-6 bg-background/80 hover:bg-background"
                      onClick={removeReferenceImage}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="flex-1 space-y-2">
                    {isAnalyzingStyle ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">Analyzing style...</span>
                      </div>
                    ) : referenceStylePrompt ? (
                      <>
                        <Label className="text-xs text-muted-foreground">Extracted Style:</Label>
                        <div className="p-2 rounded-lg bg-muted/30 text-xs text-foreground/80 max-h-16 overflow-y-auto">
                          {referenceStylePrompt}
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          )}

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

          {/* Frame Continuity Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm flex items-center gap-2">
                Frame continuity
                {isExtractingFrame && <Loader2 className="w-3 h-3 animate-spin" />}
              </Label>
              <p className="text-xs text-muted-foreground">Use last frame of each clip as input for next</p>
            </div>
            <Switch checked={useFrameContinuity} onCheckedChange={setUseFrameContinuity} />
          </div>

          {/* Silhouette Mode Toggle */}
          <div className="flex items-center justify-between md:col-span-2 p-3 rounded-lg bg-muted/50">
            <div className="space-y-0.5">
              <Label className="font-medium flex items-center gap-2">
                Silhouette mode
              </Label>
              <p className="text-xs text-muted-foreground">Use silhouettes for consistent character appearance</p>
            </div>
            <Switch checked={useSilhouetteMode} onCheckedChange={setUseSilhouetteMode} />
          </div>

          {/* Auto-cancel on leave toggle */}
          <div className="flex items-center justify-between md:col-span-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="space-y-0.5">
              <Label className="font-medium flex items-center gap-2 text-destructive">
                <AlertCircle className="w-4 h-4" />
                Auto-cancel on refresh/close
              </Label>
              <p className="text-xs text-muted-foreground">Automatically cancel all pending jobs when you leave the page</p>
              <p className="text-xs text-destructive/70">Warning: This will immediately cancel any running video generations</p>
            </div>
            <Switch checked={autoCancelOnLeave} onCheckedChange={setAutoCancelOnLeave} />
          </div>
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
        </CollapsibleContent>
      </Card>
    </Collapsible>

      {/* Local ComfyUI Video Settings - only show when using local mode */}
      {(inferenceMode === "local" || inferenceMode === "hybrid") && isComfyUIConnected && (
        <Card className="p-4 glass-card border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Local AnimateDiff Settings</span>
            </div>
            <VideoSettingsCompact />
          </div>
        </Card>
      )}

      {/* Scenes Preview */}
      <Card className="p-6 glass-card border-border/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-secondary" />
            <h3 className="font-semibold">
              {isGenerating
                ? `Generating Scenes (${scenesForDisplay.length})`
                : uploadedSchedule.length > 0
                  ? `Imported Scenes (${uploadedSchedule.length})`
                  : `Section Videos (${scenesForDisplay.length})`}
            </h3>
          </div>
          {hasSourceData && (
            <div className="text-sm text-muted-foreground flex items-center gap-3">
              <span>
                <Images className="w-4 h-4 inline mr-1" />
                {uploadedImages.length > 0 
                  ? `${Math.min(uploadedImages.length, scenesForDisplay.length)}/${scenesForDisplay.length} images`
                  : `${scenesForDisplay.length} images needed`
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
            <p className="text-sm">
              {uploadedImages.length > 0 
                ? "Enable Manual Duration Mode in Scene Images to generate from your uploaded images."
                : "Upload a schedule file, analyze lyrics with [Section] markers, or upload images with Manual Duration Mode."}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {scenesForDisplay.map((scene, index) => (
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

      {/* Progress Estimation Panel */}
      {audioDuration && (
        <Card className="p-4 glass-card border-border/50 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Track Duration:</span>
                <span className="text-sm text-muted-foreground">
                  {Math.floor(audioDuration / 60)}:{String(Math.floor(audioDuration % 60)).padStart(2, '0')}
                </span>
              </div>
              
              <div className="h-4 w-px bg-border" />
              
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-secondary" />
                <span className="text-sm font-medium">Est. Clips Needed:</span>
                <span className="text-sm text-muted-foreground">
                  {estimatedClips ?? '—'}
                  {avgClipDuration && (
                    <span className="text-xs text-muted-foreground/60 ml-1">
                      (avg {avgClipDuration.toFixed(1)}s/clip)
                    </span>
                  )}
                </span>
              </div>
            </div>
            
            {completedClipDurations.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-green-500 font-medium">
                  {completedClipDurations.length} clips done
                </span>
                <span className="text-xs text-muted-foreground">
                  ({completedClipDurations.reduce((a, b) => a + b, 0).toFixed(1)}s generated)
                </span>
              </div>
            )}
          </div>
          
          {/* Progress bar */}
          {completedClipDurations.length > 0 && audioDuration && (
            <div className="mt-3">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-500"
                  style={{ 
                    width: `${Math.min(100, (completedClipDurations.reduce((a, b) => a + b, 0) / audioDuration) * 100)}%` 
                  }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-muted-foreground">
                  {((completedClipDurations.reduce((a, b) => a + b, 0) / audioDuration) * 100).toFixed(0)}% of track covered
                </span>
                <span className="text-xs text-muted-foreground">
                  {Math.max(0, audioDuration - completedClipDurations.reduce((a, b) => a + b, 0)).toFixed(0)}s remaining
                </span>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Scene Editor - Show when prepared */}
      {isPrepared && !isGenerating && (
        <SceneEditor
          scenes={editableScenes}
          onScenesChange={setEditableScenes}
          onGeneratePrompt={generatePromptForScene}
          isGeneratingPrompt={isGeneratingPrompt}
          stylePrefix={getStylePrefix()}
        />
      )}

      {/* Generate Buttons */}
      <div className="flex gap-3 flex-wrap">
        {/* Prepare Scenes Button - Show only when not prepared and not generating */}
        {!isPrepared && !isGenerating && (
          <Button
            onClick={prepareScenes}
            disabled={!hasSourceData}
            variant="outline"
            size="lg"
            className="flex-1"
          >
            <Edit3 className="w-5 h-5 mr-2" />
            Prepare &amp; Edit Scenes ({previewScenes.length})
          </Button>
        )}

        {/* Back button when prepared */}
        {isPrepared && !isGenerating && (
          <Button
            onClick={() => setIsPrepared(false)}
            variant="ghost"
            size="lg"
          >
            ← Back
          </Button>
        )}

        {/* Generate Button */}
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
          ) : isPrepared ? (
            <>
              {useLocalGeneration ? <Cpu className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              Generate Videos ({editableScenes.length})
            </>
          ) : (
            <>
              {useLocalGeneration ? <Cpu className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              Quick Generate ({previewScenes.length})
            </>
          )}
        </Button>
        
        {/* Inference Mode Indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {useLocalGeneration ? (
            <>
              <Cpu className="w-4 h-4 text-green-500" />
              <span>Local images</span>
            </>
          ) : (
            <>
              <Cloud className="w-4 h-4" />
              <span>Cloud images</span>
            </>
          )}
        </div>

        {isGenerating && (
          <Button 
            variant="secondary" 
            size="lg" 
            onClick={stopGenerating}
          >
            <StopCircle className="w-5 h-5 mr-2" />
            Stop Generating
          </Button>
        )}

        {(processingCount > 0 || orphanedTaskIds.length > 0) && (
          <Button 
            variant="destructive" 
            size="lg" 
            onClick={cancelAllJobs}
            disabled={isCancelling}
          >
            {isCancelling ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <StopCircle className="w-5 h-5 mr-2" />
            )}
            Cancel All ({processingCount + orphanedTaskIds.length})
          </Button>
        )}

        {processingCount > 0 && (
          <Button 
            variant="outline" 
            size="lg" 
            onClick={checkAllProcessingScenes}
            disabled={isCheckingAll}
          >
            {isCheckingAll ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-5 h-5 mr-2" />
            )}
            Check All ({processingCount})
          </Button>
        )}

        {scenes.some(s => s.videoUrl) && (
          <>
            <Button variant="outline" size="lg" onClick={downloadAllVideos}>
              <Download className="w-5 h-5 mr-2" />
              Download Clips
            </Button>
            <Button 
              variant="neon" 
              size="lg" 
              onClick={downloadAsZipWithInstructions}
              disabled={isCreatingZip}
            >
              {isCreatingZip ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <Archive className="w-5 h-5 mr-2" />
              )}
              Export Full Video
            </Button>
          </>
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
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-primary bg-background/80">
                      {scene.imageUrl && scene.status === 'generating-video' && (
                        <img src={scene.imageUrl} alt={scene.section} className="absolute inset-0 w-full h-full object-cover opacity-30" />
                      )}
                      <div className="relative z-10 flex flex-col items-center">
                        <Loader2 className="w-8 h-8 animate-spin mb-2" />
                        <span className="text-xs font-medium mb-1">
                          {scene.status === 'generating-image' ? 'Generating image...' : 'Generating video...'}
                        </span>
                        {scene.status === 'generating-video' && videoProgressInfo.elapsedSeconds > 0 && (
                          <div className="text-xs text-muted-foreground text-center">
                            <div className="flex items-center gap-1 mb-1">
                              <Clock className="w-3 h-3" />
                              <span>{Math.floor(videoProgressInfo.elapsedSeconds / 60)}:{(videoProgressInfo.elapsedSeconds % 60).toString().padStart(2, '0')} elapsed</span>
                            </div>
                            {videoProgressInfo.estimatedRemainingSeconds !== null && videoProgressInfo.estimatedRemainingSeconds > 0 && (
                              <span className="text-primary/80">
                                ~{Math.ceil(videoProgressInfo.estimatedRemainingSeconds / 60)} min remaining
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {scene.status === 'processing' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80">
                      {scene.imageUrl && (
                        <img src={scene.imageUrl} alt={scene.section} className="absolute inset-0 w-full h-full object-cover opacity-50" />
                      )}
                      <div className="relative z-10 flex flex-col items-center">
                        <Clock className="w-6 h-6 text-yellow-500 mb-2" />
                        <span className="text-xs text-yellow-500 mb-2">Processing on Replicate</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => checkSceneStatus(index)}
                          className="text-xs"
                        >
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Check Status
                        </Button>
                      </div>
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

      {/* Full Video Preview with Remotion */}
      {hasCompletedScenes && (
        <Card className="p-6 glass-card border-primary/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Film className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Full Video Preview</h3>
            </div>
            <div className="text-sm text-muted-foreground">
              {remotionScenes.length} scenes • {Math.round(totalDuration)}s
            </div>
          </div>
          
          <VideoPreviewPlayer
            scenes={remotionScenes}
            audioUrl={audioUrl || undefined}
            fps={fps}
            width={sizeConfig.width}
            height={sizeConfig.height}
          />
          
          <div className="mt-4 p-3 rounded-lg bg-muted/30">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Preview your full music video</strong> with Ken Burns effects. 
              {!audioUrl && " Upload an audio track above to hear the music."}
              {audioUrl && " Audio is synced with the video preview."}
            </p>
          </div>
        </Card>
      )}

      {/* Info Card */}
      <Card className="p-4 glass-card border-border/50">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">How GenVid Works</h3>
        <ul className="text-sm text-muted-foreground/80 space-y-1">
          <li>• Upload replicate_schedule.json or SRT from the Timestamps tab</li>
          <li>• OR add [Section] markers to lyrics (e.g., [Intro], [Verse 1], [Chorus])</li>
          <li>• Upload your audio track for synchronized playback</li>
          <li>• Images get Ken Burns motion (zoom/pan) to match section durations</li>
          <li>• Preview the full video before exporting</li>
        </ul>
      </Card>
    </div>
  );
}
