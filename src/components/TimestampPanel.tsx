import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mic, Play, Upload, Clock, AudioLines, Download, Copy, FileJson } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const PROMPT_PRESETS = {
  cinematic: "cinematic scene of {text}, moody night city lights, emotional closeup, 720p",
  anime: "anime style illustration of {text}, studio ghibli inspired, soft lighting, detailed background",
  abstract: "abstract visual interpretation of {text}, flowing colors, ethereal atmosphere, artistic",
  noir: "film noir scene of {text}, high contrast black and white, dramatic shadows, 1940s aesthetic",
  dreamy: "dreamy surreal scene of {text}, soft focus, pastel colors, floating elements, magical",
  cyberpunk: "cyberpunk scene of {text}, neon lights, rain-soaked streets, futuristic city, blade runner style",
  nature: "serene nature scene inspired by {text}, golden hour lighting, cinematic landscape, peaceful",
  minimal: "{text}, minimal style, clean composition, soft colors"
};

export interface Timestamp {
  time: string;
  text: string;
  start: number;
  end: number;
  section?: string;
}

interface Section {
  name: string;
  text: string;
}

interface TimestampPanelProps {
  sections?: Section[];
  onTimestampsGenerated?: (timestamps: Timestamp[]) => void;
}

const FPS = 24;

function formatTime(seconds: number): string {
  const frame = Math.round(seconds * FPS);
  return `@${frame}`;
}

// Match timestamp text to section
function matchSection(text: string, sections: Section[]): string {
  const words = text.toLowerCase().split(/\s+/).slice(0, 3);
  for (const section of sections) {
    const sectionWords = section.text.toLowerCase();
    if (words.some(word => sectionWords.includes(word))) {
      return section.name;
    }
  }
  return "Verse";
}

export function TimestampPanel({ sections = [], onTimestampsGenerated }: TimestampPanelProps) {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [timestamps, setTimestamps] = useState<Timestamp[]>([]);
  const [fullTranscript, setFullTranscript] = useState("");
  const [promptTemplate, setPromptTemplate] = useState("cinematic scene of {text}, moody night city lights, emotional closeup, 720p");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
      setTimestamps([]);
      setFullTranscript("");
    }
  };

  const generateTimestamps = async () => {
    if (!audioFile) return;
    
    setIsProcessing(true);
    
    try {
      const formData = new FormData();
      formData.append("audio", audioFile);

      const { data, error } = await supabase.functions.invoke("transcribe-audio", {
        body: formData,
      });

      if (error) throw error;

      console.log("Transcription result:", data);

      // Use segments from Whisper (has proper start/end times)
      const segments = data.segments || [];
      setFullTranscript(data.transcription || data.text || "");

      if (segments.length > 0) {
        const segmentTimestamps: Timestamp[] = segments.map((seg: { start: number; end: number; text: string }) => ({
          time: formatTime(seg.start),
          text: seg.text.trim(),
          start: seg.start,
          end: seg.end
        }));

        setTimestamps(segmentTimestamps);
        onTimestampsGenerated?.(segmentTimestamps);
        toast.success(`Generated ${segmentTimestamps.length} timestamps from segments`);
      } else {
        // Fallback if no segments
        setTimestamps([{
          time: "00:00:00:00",
          text: data.transcription || data.text || "No transcription available",
          start: 0,
          end: 0
        }]);
      }

    } catch (error) {
      console.error("Transcription error:", error);
      toast.error("Failed to transcribe audio");
    } finally {
      setIsProcessing(false);
    }
  };

  const copyTimestamps = () => {
    if (timestamps.length === 0) return;
    
    // First line: FPS = 24: @frame: text
    // Subsequent lines: @frame: text
    const firstLine = `FPS = ${FPS}: ${timestamps[0].time}: ${timestamps[0].text}`;
    const remainingLines = timestamps.slice(1).map(ts => `${ts.time}: ${ts.text}`);
    const text = [firstLine, ...remainingLines].join("\n");
    
    navigator.clipboard.writeText(text);
    toast.success("Timestamps copied to clipboard");
  };

  // Format seconds to SRT timecode: HH:MM:SS,mmm (YouTube requirement)
  const formatSRTTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };

  const downloadSRT = () => {
    const srtContent = timestamps.map((ts, i) => {
      const startTime = formatSRTTime(ts.start);
      const endTime = formatSRTTime(ts.end);
      
      return `${i + 1}\n${startTime} --> ${endTime}\n${ts.text}\n`;
    }).join("\n");

    const blob = new Blob([srtContent], { type: "text/srt" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "timestamps.srt";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("SRT file downloaded");
  };

  const downloadReplicateSchedule = () => {
    if (timestamps.length === 0) return;
    
    const schedule = timestamps.map((ts) => {
      const startSec = Math.round(ts.start * 10) / 10;
      const endSec = Math.round(ts.end * 10) / 10; // Use actual Whisper end time
      
      return {
        start: startSec,
        end: endSec,
        text: ts.text.trim(),
        prompt: promptTemplate.replace("{text}", ts.text.trim())
      };
    });

    const blob = new Blob([JSON.stringify(schedule, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "replicate_schedule.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Replicate schedule downloaded");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Upload Section */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Mic className="w-4 h-4" />
          Vocal Stem Audio
        </label>
        
        <div className="relative">
          <Input
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            className="hidden"
            id="audio-upload"
          />
          <label
            htmlFor="audio-upload"
            className="flex items-center justify-center gap-3 h-32 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-all group"
          >
            <div className="flex flex-col items-center gap-2 text-muted-foreground group-hover:text-foreground transition-colors">
              <Upload className="w-8 h-8" />
              <span className="text-sm font-medium">
                {audioFile ? audioFile.name : "Drop audio file or click to upload"}
              </span>
              <span className="text-xs text-muted-foreground/60">
                MP3, WAV, M4A supported
              </span>
            </div>
          </label>
        </div>
      </div>

      {/* Generate Button */}
      <Button
        onClick={generateTimestamps}
        disabled={!audioFile || isProcessing}
        variant="neon"
        size="lg"
        className="w-full sm:w-auto"
      >
        {isProcessing ? (
          <>
            <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            Processing with Whisper...
          </>
        ) : (
          <>
            <AudioLines className="w-5 h-5" />
            Generate Timestamps
          </>
        )}
      </Button>

      {/* Timestamps Display */}
      {timestamps.length > 0 && (
        <Card className="p-4 glass-card border-border/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Generated Timestamps ({timestamps.length})
            </h3>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={copyTimestamps}>
                <Copy className="w-4 h-4 mr-1" />
                Copy
              </Button>
              <Button variant="ghost" size="sm" onClick={downloadSRT}>
                <Download className="w-4 h-4 mr-1" />
                SRT
              </Button>
              <Button variant="ghost" size="sm" onClick={downloadReplicateSchedule}>
                <FileJson className="w-4 h-4 mr-1" />
                Replicate JSON
              </Button>
            </div>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {timestamps.map((ts, index) => (
              <div
                key={index}
                className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <span className="font-mono text-sm text-secondary min-w-[80px]">
                  {ts.time}
                </span>
                <span className="font-mono text-xs text-muted-foreground min-w-[50px]">
                  {(ts.end - ts.start).toFixed(1)}s
                </span>
                <span className="text-sm text-foreground flex-1">
                  {ts.text}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Prompt Template */}
      {timestamps.length > 0 && (
        <Card className="p-4 glass-card border-border/50">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Prompt Template</h3>
          <p className="text-xs text-muted-foreground/60 mb-3">Use {"{text}"} as placeholder for lyrics</p>
          
          <div className="flex gap-2 mb-3">
            <Select onValueChange={(value) => setPromptTemplate(PROMPT_PRESETS[value as keyof typeof PROMPT_PRESETS])}>
              <SelectTrigger className="w-[180px] bg-background">
                <SelectValue placeholder="Choose preset..." />
              </SelectTrigger>
              <SelectContent className="bg-background border-border z-50">
                <SelectItem value="cinematic">Cinematic</SelectItem>
                <SelectItem value="anime">Anime</SelectItem>
                <SelectItem value="abstract">Abstract</SelectItem>
                <SelectItem value="noir">Film Noir</SelectItem>
                <SelectItem value="dreamy">Dreamy</SelectItem>
                <SelectItem value="cyberpunk">Cyberpunk</SelectItem>
                <SelectItem value="nature">Nature</SelectItem>
                <SelectItem value="minimal">Minimal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Input
            value={promptTemplate}
            onChange={(e) => setPromptTemplate(e.target.value)}
            placeholder="cinematic scene of {text}, moody lighting, 720p"
            className="font-mono text-sm"
          />
        </Card>
      )}

      {/* Full Transcript */}
      {fullTranscript && (
        <Card className="p-4 glass-card border-border/50">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Full Transcript</h3>
          <p className="text-sm text-foreground/80 whitespace-pre-wrap">{fullTranscript}</p>
        </Card>
      )}

      {/* Info Card */}
      <Card className="p-4 glass-card border-border/50">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">About Whisper</h3>
        <ul className="text-sm text-muted-foreground/80 space-y-1">
          <li>• Powered by OpenAI Whisper large-v3 via Replicate</li>
          <li>• Word-level timestamp accuracy</li>
          <li>• Frame-accurate output at {FPS} FPS</li>
          <li>• Export to SRT for video editing</li>
        </ul>
      </Card>
    </div>
  );
}
