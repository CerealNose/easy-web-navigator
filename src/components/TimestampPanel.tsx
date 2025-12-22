import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Mic, Play, Upload, Clock, AudioLines } from "lucide-react";

interface Timestamp {
  time: string;
  text: string;
}

export function TimestampPanel() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [timestamps, setTimestamps] = useState<Timestamp[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
    }
  };

  const generateTimestamps = () => {
    if (!audioFile) return;
    
    setIsProcessing(true);
    
    // Simulate processing
    setTimeout(() => {
      setTimestamps([
        { time: "00:00:00", text: "♪ Intro begins" },
        { time: "00:00:15", text: "Being cautious with my heart" },
        { time: "00:00:28", text: "Late nights in the city glow" },
        { time: "00:00:42", text: "Love echoes through the streets" },
        { time: "00:01:05", text: "♪ Chorus" },
      ]);
      setIsProcessing(false);
    }, 2000);
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
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Generated Timestamps
          </h3>
          <div className="space-y-2">
            {timestamps.map((ts, index) => (
              <div
                key={index}
                className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <span className="font-mono text-sm text-secondary">
                  {ts.time}
                </span>
                <span className="text-sm text-foreground flex-1">
                  {ts.text}
                </span>
                <Button variant="ghost" size="icon" className="w-8 h-8">
                  <Play className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Info Card */}
      <Card className="p-4 glass-card border-border/50">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">About Whisper</h3>
        <ul className="text-sm text-muted-foreground/80 space-y-1">
          <li>• Powered by OpenAI Whisper AI</li>
          <li>• Accurate speech-to-text transcription</li>
          <li>• Frame-accurate timestamps at 25 FPS</li>
          <li>• Export for video editing software</li>
        </ul>
      </Card>
    </div>
  );
}
