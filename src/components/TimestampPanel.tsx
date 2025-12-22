import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Mic, Play, Upload, Clock, AudioLines, Download, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Timestamp {
  time: string;
  text: string;
  start: number;
}

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

const FPS = 24;

function formatTime(seconds: number): string {
  // Convert seconds to frame number at 24 FPS
  const frame = Math.round(seconds * FPS);
  return `@${frame}`;
}

export function TimestampPanel() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [timestamps, setTimestamps] = useState<Timestamp[]>([]);
  const [fullTranscript, setFullTranscript] = useState("");

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

      // Extract word timestamps and group into lines
      const words: WordTimestamp[] = data.words || [];
      setFullTranscript(data.transcription || data.text || "");

      if (words.length > 0) {
        // Group words into ~5 second chunks or by natural pauses
        const groupedTimestamps: Timestamp[] = [];
        let currentGroup: string[] = [];
        let groupStart = words[0].start;

        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          currentGroup.push(word.word);

          // Check if we should start a new group (pause > 1s or group > 5s)
          const nextWord = words[i + 1];
          const shouldBreak = !nextWord || 
            (nextWord.start - word.end > 1) || 
            (word.end - groupStart > 5);

          if (shouldBreak && currentGroup.length > 0) {
            groupedTimestamps.push({
              time: formatTime(groupStart),
              text: currentGroup.join(" ").trim(),
              start: groupStart
            });
            currentGroup = [];
            if (nextWord) groupStart = nextWord.start;
          }
        }

        setTimestamps(groupedTimestamps);
        toast.success(`Generated ${groupedTimestamps.length} timestamps`);
      } else {
        // Fallback if no word timestamps
        setTimestamps([{
          time: "00:00:00:00",
          text: data.transcription || data.text || "No transcription available",
          start: 0
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
    const header = `FPS = ${FPS}:`;
    const lines = timestamps.map(ts => `${ts.time}: ${ts.text}`);
    const text = [header, ...lines].join("\n");
    navigator.clipboard.writeText(text);
    toast.success("Timestamps copied to clipboard");
  };

  const downloadSRT = () => {
    const srtContent = timestamps.map((ts, i) => {
      const startTime = ts.time.replace(/:/g, ',').slice(0, -3) + ',' + ts.time.slice(-2) + '0';
      const nextTs = timestamps[i + 1];
      const endTime = nextTs 
        ? nextTs.time.replace(/:/g, ',').slice(0, -3) + ',' + nextTs.time.slice(-2) + '0'
        : startTime.replace(/,(\d{2})0$/, (_, s) => `,${String(Number(s) + 2).padStart(2, '0')}0`);
      
      return `${i + 1}\n${startTime.replace(',', ':')} --> ${endTime.replace(',', ':')}\n${ts.text}\n`;
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
            </div>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {timestamps.map((ts, index) => (
              <div
                key={index}
                className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <span className="font-mono text-sm text-secondary min-w-[100px]">
                  {ts.time}
                </span>
                <span className="text-sm text-foreground flex-1">
                  {ts.text}
                </span>
              </div>
            ))}
          </div>
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
