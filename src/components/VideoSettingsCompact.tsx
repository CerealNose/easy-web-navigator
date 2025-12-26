import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Video,
  Film,
  Zap,
  Sparkles,
  Gauge,
  Repeat,
  Clapperboard,
  Settings2,
  ChevronDown,
} from "lucide-react";
import {
  useSettings,
  VIDEO_PRESETS,
  SAMPLER_OPTIONS,
  SCHEDULER_OPTIONS,
} from "@/contexts/SettingsContext";

export function VideoSettingsCompact() {
  const {
    videoSettings,
    setVideoSettings,
    selectedPresetId,
    applyPreset,
    customPresets,
  } = useSettings();

  const allPresets = [...VIDEO_PRESETS, ...customPresets];
  const currentPreset = allPresets.find((p) => p.id === selectedPresetId);

  const getPresetIcon = (id: string) => {
    switch (id) {
      case "fast":
        return <Zap className="w-3 h-3" />;
      case "balanced":
        return <Gauge className="w-3 h-3" />;
      case "quality":
        return <Sparkles className="w-3 h-3" />;
      case "smooth":
        return <Film className="w-3 h-3" />;
      case "loop":
        return <Repeat className="w-3 h-3" />;
      case "cinematic":
        return <Clapperboard className="w-3 h-3" />;
      default:
        return <Settings2 className="w-3 h-3" />;
    }
  };

  const duration = (videoSettings.frames / videoSettings.frameRate).toFixed(1);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Video className="w-3.5 h-3.5" />
        <span>Video:</span>
      </div>

      {/* Preset Quick Select */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
            {currentPreset ? (
              <>
                {getPresetIcon(currentPreset.id)}
                {currentPreset.name}
              </>
            ) : (
              <>
                <Settings2 className="w-3 h-3" />
                Custom
              </>
            )}
            <ChevronDown className="w-3 h-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2 bg-popover border border-border z-50" align="start">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground px-2">Presets</Label>
            {VIDEO_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                variant={selectedPresetId === preset.id ? "secondary" : "ghost"}
                size="sm"
                className="w-full justify-start gap-2 h-8"
                onClick={() => applyPreset(preset.id)}
              >
                {getPresetIcon(preset.id)}
                <span className="flex-1 text-left">{preset.name}</span>
                <span className="text-xs text-muted-foreground">
                  {preset.settings.frames}f/{preset.settings.frameRate}fps
                </span>
              </Button>
            ))}
            {customPresets.length > 0 && (
              <>
                <div className="border-t border-border my-1" />
                <Label className="text-xs text-muted-foreground px-2">Custom</Label>
                {customPresets.map((preset) => (
                  <Button
                    key={preset.id}
                    variant={selectedPresetId === preset.id ? "secondary" : "ghost"}
                    size="sm"
                    className="w-full justify-start gap-2 h-8"
                    onClick={() => applyPreset(preset.id)}
                  >
                    <Settings2 className="w-3 h-3" />
                    <span className="flex-1 text-left truncate">{preset.name}</span>
                  </Button>
                ))}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Quick Settings */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground">
            <span>{videoSettings.frames}f</span>
            <span>•</span>
            <span>{videoSettings.frameRate}fps</span>
            <span>•</span>
            <span>~{duration}s</span>
            <Settings2 className="w-3 h-3 ml-1" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3 bg-popover border border-border z-50" align="start">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Frames</Label>
                <span className="text-xs text-muted-foreground">{videoSettings.frames}</span>
              </div>
              <Slider
                value={[videoSettings.frames]}
                onValueChange={([v]) => setVideoSettings({ ...videoSettings, frames: v })}
                min={8}
                max={32}
                step={4}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Frame Rate</Label>
                <span className="text-xs text-muted-foreground">{videoSettings.frameRate} fps</span>
              </div>
              <Slider
                value={[videoSettings.frameRate]}
                onValueChange={([v]) => setVideoSettings({ ...videoSettings, frameRate: v })}
                min={6}
                max={24}
                step={2}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Steps</Label>
                <span className="text-xs text-muted-foreground">{videoSettings.steps}</span>
              </div>
              <Slider
                value={[videoSettings.steps]}
                onValueChange={([v]) => setVideoSettings({ ...videoSettings, steps: v })}
                min={10}
                max={50}
                step={5}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Denoise</Label>
                <span className="text-xs text-muted-foreground">{videoSettings.denoise.toFixed(2)}</span>
              </div>
              <Slider
                value={[videoSettings.denoise]}
                onValueChange={([v]) => setVideoSettings({ ...videoSettings, denoise: v })}
                min={0.1}
                max={1}
                step={0.05}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Sampler</Label>
                <Select
                  value={videoSettings.sampler}
                  onValueChange={(v) => setVideoSettings({ ...videoSettings, sampler: v })}
                >
                  <SelectTrigger className="h-7 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border z-50">
                    {SAMPLER_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt} className="text-xs">
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Scheduler</Label>
                <Select
                  value={videoSettings.scheduler}
                  onValueChange={(v) => setVideoSettings({ ...videoSettings, scheduler: v })}
                >
                  <SelectTrigger className="h-7 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border z-50">
                    {SCHEDULER_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt} className="text-xs">
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="text-xs text-muted-foreground text-center pt-2 border-t border-border">
              Duration: ~{duration}s • Full settings in ⚙️ Settings
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
