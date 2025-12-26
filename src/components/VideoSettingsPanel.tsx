import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Video,
  Film,
  Settings2,
  Zap,
  Sparkles,
  Gauge,
  Clock,
  Save,
  Trash2,
  ChevronDown,
  Repeat,
  Clapperboard,
  HelpCircle,
  Monitor,
} from "lucide-react";
import { toast } from "sonner";
import {
  useSettings,
  VIDEO_PRESETS,
  SAMPLER_OPTIONS,
  SCHEDULER_OPTIONS,
  FORMAT_OPTIONS,
  MOTION_MODEL_OPTIONS,
  MOTION_LORA_OPTIONS,
  SAMPLER_INFO,
  SCHEDULER_INFO,
  CFG_INFO,
  STEPS_INFO,
  DENOISE_INFO,
  VIDEO_SIZE_OPTIONS,
  VideoSettings,
} from "@/contexts/SettingsContext";
import {
  MoveLeft,
  MoveRight,
  ZoomIn,
  ZoomOut,
  MoveUp,
  MoveDown,
  RotateCw,
  RotateCcw,
  Camera,
} from "lucide-react";

export function VideoSettingsPanel() {
  const {
    videoSettings,
    setVideoSettings,
    selectedPresetId,
    applyPreset,
    customPresets,
    saveCustomPreset,
    deleteCustomPreset,
  } = useSettings();

  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetDescription, setNewPresetDescription] = useState("");

  const allPresets = [...VIDEO_PRESETS, ...customPresets];
  const currentPreset = allPresets.find((p) => p.id === selectedPresetId);

  const updateSetting = <K extends keyof VideoSettings>(
    key: K,
    value: VideoSettings[K]
  ) => {
    setVideoSettings({ ...videoSettings, [key]: value });
  };

  const handleSavePreset = () => {
    if (!newPresetName.trim()) {
      toast.error("Please enter a preset name");
      return;
    }
    saveCustomPreset(newPresetName, newPresetDescription);
    toast.success(`Preset "${newPresetName}" saved!`);
    setNewPresetName("");
    setNewPresetDescription("");
    setIsSaveDialogOpen(false);
  };

  const handleDeletePreset = (id: string) => {
    const preset = customPresets.find((p) => p.id === id);
    if (preset) {
      deleteCustomPreset(id);
      toast.success(`Preset "${preset.name}" deleted`);
    }
  };

  const getPresetIcon = (id: string) => {
    switch (id) {
      case "fast":
        return <Zap className="w-4 h-4" />;
      case "balanced":
        return <Gauge className="w-4 h-4" />;
      case "quality":
        return <Sparkles className="w-4 h-4" />;
      case "smooth":
        return <Film className="w-4 h-4" />;
      case "loop":
        return <Repeat className="w-4 h-4" />;
      case "cinematic":
        return <Clapperboard className="w-4 h-4" />;
      default:
        return <Settings2 className="w-4 h-4" />;
    }
  };

  const getSamplerInfo = (sampler: string) => {
    return SAMPLER_INFO[sampler] || { name: sampler, description: "Sampler option", recommendation: "" };
  };

  const getSchedulerInfo = (scheduler: string) => {
    return SCHEDULER_INFO[scheduler] || { name: scheduler, description: "Scheduler option", recommendation: "" };
  };

  return (
    <TooltipProvider>
      <Card className="p-4 space-y-4 border-border/50">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold flex items-center gap-2">
            <Video className="w-4 h-4" />
            Video Generation Settings
          </Label>
          <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 px-2">
                <Save className="w-3 h-3 mr-1" />
                Save Preset
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save Custom Preset</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Preset Name</Label>
                  <Input
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="My Custom Preset"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={newPresetDescription}
                    onChange={(e) => setNewPresetDescription(e.target.value)}
                    placeholder="Description of this preset..."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsSaveDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSavePreset}>Save Preset</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Preset Selection */}
        <div className="space-y-2">
          <Label className="text-sm">Quick Presets</Label>
          <div className="grid grid-cols-2 gap-2">
            {VIDEO_PRESETS.map((preset) => (
              <Tooltip key={preset.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant={selectedPresetId === preset.id ? "default" : "outline"}
                    size="sm"
                    className="justify-start text-left h-auto py-2 px-3"
                    onClick={() => applyPreset(preset.id)}
                  >
                    <div className="flex items-center gap-2 w-full">
                      {getPresetIcon(preset.id)}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-xs truncate">{preset.name}</div>
                      </div>
                    </div>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[200px]">
                  <p className="font-medium">{preset.name}</p>
                  <p className="text-xs text-muted-foreground">{preset.description}</p>
                  <p className="text-xs mt-1">{preset.settings.width}×{preset.settings.height} • {preset.settings.frames}f/{preset.settings.frameRate}fps</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
          {currentPreset && (
            <p className="text-xs text-muted-foreground mt-1">
              {currentPreset.description}
            </p>
          )}
        </div>

        {/* Custom Presets */}
        {customPresets.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm">Custom Presets</Label>
            <div className="grid grid-cols-2 gap-2">
              {customPresets.map((preset) => (
                <div key={preset.id} className="relative group">
                  <Button
                    variant={selectedPresetId === preset.id ? "default" : "outline"}
                    size="sm"
                    className="w-full justify-start text-left h-auto py-2 px-3"
                    onClick={() => applyPreset(preset.id)}
                  >
                    <Settings2 className="w-3 h-3 mr-2" />
                    <span className="truncate text-xs">{preset.name}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute -right-1 -top-1 h-5 w-5 opacity-0 group-hover:opacity-100 bg-destructive/90 hover:bg-destructive text-destructive-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePreset(preset.id);
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Video Size */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs flex items-center gap-1">
              <Monitor className="w-3 h-3" />
              Video Size
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[200px]">
                <p className="font-medium">Output Resolution</p>
                <p className="text-xs text-muted-foreground">Larger sizes need more VRAM and take longer to generate. 512×512 is fastest.</p>
              </TooltipContent>
            </Tooltip>
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
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIDEO_SIZE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  <div className="flex items-center justify-between gap-4 w-full">
                    <span>{opt.label}</span>
                    <span className="text-muted-foreground">{opt.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Basic Settings */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1">
              <Film className="w-3 h-3" />
              Frames
            </Label>
            <div className="flex items-center gap-2">
              <Slider
                value={[videoSettings.frames]}
                onValueChange={([v]) => updateSetting("frames", v)}
                min={8}
                max={32}
                step={4}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-6 text-right">
                {videoSettings.frames}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Frame Rate
            </Label>
            <div className="flex items-center gap-2">
              <Slider
                value={[videoSettings.frameRate]}
                onValueChange={([v]) => updateSetting("frameRate", v)}
                min={6}
                max={24}
                step={2}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-8 text-right">
                {videoSettings.frameRate}fps
              </span>
            </div>
          </div>
        </div>

        {/* Camera Motion LoRA */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs flex items-center gap-1">
              <Camera className="w-3 h-3" />
              Camera Motion
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[220px]">
                <p className="font-medium">Camera Motion LoRA</p>
                <p className="text-xs text-muted-foreground">Apply camera movement effects like pan, zoom, or tilt. Requires motion LoRAs installed in ComfyUI.</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MOTION_LORA_OPTIONS.map((opt) => {
              const isSelected = videoSettings.motionLora === opt.value;
              const getIcon = () => {
                switch (opt.value) {
                  case "auto": return <Sparkles className="w-3.5 h-3.5 text-yellow-500" />;
                  case "v2_lora_PanLeft.ckpt": return <MoveLeft className="w-3.5 h-3.5" />;
                  case "v2_lora_PanRight.ckpt": return <MoveRight className="w-3.5 h-3.5" />;
                  case "v2_lora_ZoomIn.ckpt": return <ZoomIn className="w-3.5 h-3.5" />;
                  case "v2_lora_ZoomOut.ckpt": return <ZoomOut className="w-3.5 h-3.5" />;
                  case "v2_lora_TiltUp.ckpt": return <MoveUp className="w-3.5 h-3.5" />;
                  case "v2_lora_TiltDown.ckpt": return <MoveDown className="w-3.5 h-3.5" />;
                  case "v2_lora_RollingClockwise.ckpt": return <RotateCw className="w-3.5 h-3.5" />;
                  case "v2_lora_RollingAnticlockwise.ckpt": return <RotateCcw className="w-3.5 h-3.5" />;
                  default: return null;
                }
              };
              return (
                <Tooltip key={opt.value}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      className="h-8 text-xs justify-start gap-1.5 px-2"
                      onClick={() => updateSetting("motionLora", opt.value)}
                    >
                      {getIcon()}
                      <span className="truncate">{opt.label}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{opt.description}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          {videoSettings.motionLora !== "none" && videoSettings.motionLora !== "auto" && (
            <div className="space-y-1">
              <Label className="text-xs">
                LoRA Strength ({(videoSettings.motionLoraStrength ?? 0.8).toFixed(2)})
              </Label>
              <Slider
                value={[videoSettings.motionLoraStrength]}
                onValueChange={([v]) => updateSetting("motionLoraStrength", v)}
                min={0.1}
                max={1.5}
                step={0.05}
              />
              <p className="text-xs text-muted-foreground">
                Higher = stronger camera movement
              </p>
            </div>
          )}
          {videoSettings.motionLora === "auto" && (
            <p className="text-xs text-muted-foreground bg-yellow-500/10 px-2 py-1.5 rounded border border-yellow-500/20">
              <Sparkles className="w-3 h-3 inline mr-1" />
              AI will analyze your prompt and select the best camera motion automatically
            </p>
          )}
        </div>

        {/* Duration indicator */}
        <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-2 rounded">
          Video: {videoSettings.width}×{videoSettings.height} • ~{(videoSettings.frames / videoSettings.frameRate).toFixed(1)}s
          {videoSettings.pingpong && " (doubled with pingpong)"}
          {videoSettings.motionLora !== "none" && ` • ${MOTION_LORA_OPTIONS.find(o => o.value === videoSettings.motionLora)?.label}`}
        </div>


        {/* Advanced Settings Collapsible */}
        <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between"
            >
              <span className="flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                Advanced Settings
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  isAdvancedOpen ? "rotate-180" : ""
                }`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            {/* Sampler & Scheduler */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
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
                  onValueChange={(v) => updateSetting("sampler", v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {SAMPLER_OPTIONS.map((opt) => {
                      const info = getSamplerInfo(opt);
                      return (
                        <SelectItem key={opt} value={opt} className="text-xs">
                          <div className="flex items-center justify-between gap-2 w-full">
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

              <div className="space-y-2">
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
                  onValueChange={(v) => updateSetting("scheduler", v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEDULER_OPTIONS.map((opt) => {
                      const info = getSchedulerInfo(opt);
                      return (
                        <SelectItem key={opt} value={opt} className="text-xs">
                          <div className="flex items-center justify-between gap-2 w-full">
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

            {/* Steps & CFG */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label className="text-xs">Steps ({videoSettings.steps})</Label>
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
                <Slider
                  value={[videoSettings.steps]}
                  onValueChange={([v]) => updateSetting("steps", v)}
                  min={4}
                  max={50}
                  step={1}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label className="text-xs">CFG Scale ({videoSettings.cfgScale})</Label>
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
                <Slider
                  value={[videoSettings.cfgScale]}
                  onValueChange={([v]) => updateSetting("cfgScale", v)}
                  min={1}
                  max={15}
                  step={0.5}
                />
              </div>
            </div>

            {/* Denoise */}
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label className="text-xs">
                  Denoise Strength ({videoSettings.denoise.toFixed(2)})
                </Label>
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
              <Slider
                value={[videoSettings.denoise]}
                onValueChange={([v]) => updateSetting("denoise", v)}
                min={0.1}
                max={1}
                step={0.05}
              />
              <p className="text-xs text-muted-foreground">
                Lower = more faithful to input image, Higher = more motion
              </p>
            </div>

            {/* Motion Model */}
            <div className="space-y-2">
              <Label className="text-xs">Motion Model</Label>
              <Select
                value={videoSettings.motionModel}
                onValueChange={(v) => updateSetting("motionModel", v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOTION_MODEL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Output Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Output Format</Label>
                <Select
                  value={videoSettings.format}
                  onValueChange={(v) => updateSetting("format", v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMAT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Quality (CRF: {videoSettings.quality})</Label>
                <Slider
                  value={[videoSettings.quality]}
                  onValueChange={([v]) => updateSetting("quality", v)}
                  min={10}
                  max={30}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">Lower = better quality</p>
              </div>
            </div>

            {/* Pingpong */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs">Pingpong Loop</Label>
                <p className="text-xs text-muted-foreground">
                  Play forwards then backwards for seamless loop
                </p>
              </div>
              <Switch
                checked={videoSettings.pingpong}
                onCheckedChange={(v) => updateSetting("pingpong", v)}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Current Settings Summary */}
        <div className="text-xs text-muted-foreground bg-muted/20 p-2 rounded space-y-1">
          <div className="font-medium text-foreground/80">Current Settings:</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <span>Size: {videoSettings.width}×{videoSettings.height}</span>
            <span>Sampler: {videoSettings.sampler}</span>
            <span>Steps: {videoSettings.steps}</span>
            <span>CFG: {videoSettings.cfgScale}</span>
            <span>Denoise: {videoSettings.denoise}</span>
            <span>Scheduler: {videoSettings.scheduler}</span>
          </div>
        </div>
      </Card>
    </TooltipProvider>
  );
}