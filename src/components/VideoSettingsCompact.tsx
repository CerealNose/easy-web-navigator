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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  HelpCircle,
  Monitor,
} from "lucide-react";
import {
  useSettings,
  VIDEO_PRESETS,
  SAMPLER_OPTIONS,
  SCHEDULER_OPTIONS,
  SAMPLER_INFO,
  SCHEDULER_INFO,
  CFG_INFO,
  STEPS_INFO,
  DENOISE_INFO,
  VIDEO_SIZE_OPTIONS,
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
  const currentSize = VIDEO_SIZE_OPTIONS.find(
    (s) => s.width === videoSettings.width && s.height === videoSettings.height
  );

  const getSamplerInfo = (sampler: string) => {
    return SAMPLER_INFO[sampler] || { name: sampler, description: "Sampler option", recommendation: "" };
  };

  const getSchedulerInfo = (scheduler: string) => {
    return SCHEDULER_INFO[scheduler] || { name: scheduler, description: "Scheduler option", recommendation: "" };
  };

  return (
    <TooltipProvider>
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
              <span>{videoSettings.width}×{videoSettings.height}</span>
              <Settings2 className="w-3 h-3 ml-1" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-3 bg-popover border border-border z-50" align="start">
            <div className="space-y-4">
              {/* Video Size */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">Video Size</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[200px]">
                        <p className="font-medium">Output Resolution</p>
                        <p className="text-xs text-muted-foreground">Larger sizes = slower generation & more VRAM</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Monitor className="w-3 h-3 text-muted-foreground" />
                </div>
                <Select
                  value={`${videoSettings.width}x${videoSettings.height}`}
                  onValueChange={(v) => {
                    const size = VIDEO_SIZE_OPTIONS.find((s) => s.value === v);
                    if (size) {
                      setVideoSettings({ ...videoSettings, width: size.width, height: size.height });
                    }
                  }}
                >
                  <SelectTrigger className="h-7 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border z-50">
                    {VIDEO_SIZE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span>{opt.label}</span>
                          <span className="text-muted-foreground">{opt.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">Steps</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[200px]">
                        <p className="font-medium">{STEPS_INFO.name}</p>
                        <p className="text-xs text-muted-foreground">{STEPS_INFO.description}</p>
                        <p className="text-xs text-primary mt-1">{STEPS_INFO.recommendation}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
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
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">Denoise</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[200px]">
                        <p className="font-medium">{DENOISE_INFO.name}</p>
                        <p className="text-xs text-muted-foreground">{DENOISE_INFO.description}</p>
                        <p className="text-xs text-primary mt-1">{DENOISE_INFO.recommendation}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
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
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">Sampler</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[220px]">
                        <p className="font-medium">{getSamplerInfo(videoSettings.sampler).name}</p>
                        <p className="text-xs text-muted-foreground">{getSamplerInfo(videoSettings.sampler).description}</p>
                        <p className="text-xs text-primary mt-1">{getSamplerInfo(videoSettings.sampler).recommendation}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Select
                    value={videoSettings.sampler}
                    onValueChange={(v) => setVideoSettings({ ...videoSettings, sampler: v })}
                  >
                    <SelectTrigger className="h-7 text-xs bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border border-border z-50 max-h-[300px]">
                      {SAMPLER_OPTIONS.map((opt) => {
                        const info = getSamplerInfo(opt);
                        return (
                          <SelectItem key={opt} value={opt} className="text-xs">
                            <div className="flex flex-col">
                              <span>{opt}</span>
                              {info.rating && (
                                <span className="text-[10px] text-muted-foreground">
                                  {info.recommendation.split(" ")[0]}
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">Scheduler</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[220px]">
                        <p className="font-medium">{getSchedulerInfo(videoSettings.scheduler).name}</p>
                        <p className="text-xs text-muted-foreground">{getSchedulerInfo(videoSettings.scheduler).description}</p>
                        <p className="text-xs text-primary mt-1">{getSchedulerInfo(videoSettings.scheduler).recommendation}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Select
                    value={videoSettings.scheduler}
                    onValueChange={(v) => setVideoSettings({ ...videoSettings, scheduler: v })}
                  >
                    <SelectTrigger className="h-7 text-xs bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border border-border z-50">
                      {SCHEDULER_OPTIONS.map((opt) => {
                        const info = getSchedulerInfo(opt);
                        return (
                          <SelectItem key={opt} value={opt} className="text-xs">
                            <div className="flex flex-col">
                              <span>{opt}</span>
                              {info.rating && (
                                <span className="text-[10px] text-muted-foreground">
                                  {info.recommendation.split(" ")[0]}
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">CFG Scale</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[200px]">
                        <p className="font-medium">{CFG_INFO.name}</p>
                        <p className="text-xs text-muted-foreground">{CFG_INFO.description}</p>
                        <p className="text-xs text-primary mt-1">{CFG_INFO.recommendation}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <span className="text-xs text-muted-foreground">{videoSettings.cfgScale}</span>
                </div>
                <Slider
                  value={[videoSettings.cfgScale]}
                  onValueChange={([v]) => setVideoSettings({ ...videoSettings, cfgScale: v })}
                  min={1}
                  max={15}
                  step={0.5}
                />
              </div>

              <div className="text-xs text-muted-foreground text-center pt-2 border-t border-border">
                Duration: ~{duration}s • {videoSettings.width}×{videoSettings.height} • Full settings in ⚙️
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </TooltipProvider>
  );
}