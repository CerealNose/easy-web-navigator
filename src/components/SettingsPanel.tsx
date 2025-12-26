import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Settings, 
  Cloud, 
  Server, 
  Cpu, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  ExternalLink,
  Link2,
  Wand2,
  RefreshCw
} from "lucide-react";
import { useSettings, InferenceMode } from "@/contexts/SettingsContext";
import { useComfyUI } from "@/hooks/useComfyUI";
import { toast } from "sonner";
import { VideoSettingsPanel } from "./VideoSettingsPanel";

const MODE_INFO = {
  cloud: {
    icon: Cloud,
    title: "Cloud (Replicate)",
    description: "Uses Replicate API for all image and video generation. Requires internet connection and API credits.",
    pros: ["No local GPU needed", "Fast generation", "Latest models"],
    cons: ["Costs API credits", "Requires internet"],
  },
  hybrid: {
    icon: Server,
    title: "Hybrid",
    description: "Uses local ComfyUI for images, Replicate for videos. Best balance of cost and quality.",
    pros: ["Lower image costs", "Local image control", "Cloud video quality"],
    cons: ["Requires local GPU for images", "Still needs credits for video"],
  },
  local: {
    icon: Cpu,
    title: "Local (ComfyUI)",
    description: "Uses local ComfyUI for all generation. Requires RTX GPU with 8GB+ VRAM.",
    pros: ["No API costs", "Full local control", "Privacy"],
    cons: ["Requires powerful GPU", "Slower video gen", "Complex setup"],
  },
};

export function SettingsPanel() {
  const { 
    inferenceMode, 
    setInferenceMode, 
    comfyUIConfig, 
    setComfyUIConfig,
    isComfyUIConnected,
    checkComfyUIConnection,
    availableCheckpoints,
    fetchCheckpoints
  } = useSettings();
  
  const { generateImage, isGenerating: isTestGenerating, progress: testProgress } = useComfyUI();
  
  const [open, setOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [localBaseUrl, setLocalBaseUrl] = useState(comfyUIConfig.baseUrl);
  const [testImageUrl, setTestImageUrl] = useState<string | null>(null);

  // Sync local state when config changes
  useEffect(() => {
    setLocalBaseUrl(comfyUIConfig.baseUrl);
  }, [comfyUIConfig.baseUrl]);

  // Check connection when dialog opens (runs async check safely via context fn)
  useEffect(() => {
    if (!open) return;
    if (inferenceMode !== "local" && inferenceMode !== "hybrid") return;
    if (comfyUIConfig.baseUrl.includes("your-tunnel-url")) return;

    let cancelled = false;
    const run = async () => {
      setIsChecking(true);
      const ok = await checkComfyUIConnection();
      if (cancelled) return;
      setIsChecking(false);
      if (ok) {
        toast.success("ComfyUI connected!");
      }
    };
    run();
    return () => { cancelled = true; };
  }, [open, inferenceMode, comfyUIConfig.baseUrl, checkComfyUIConnection]);

  // Fetch checkpoints when connected
  useEffect(() => {
    if (!isComfyUIConnected || !open) return;

    let cancelled = false;
    const run = async () => {
      setIsFetchingModels(true);
      const list = await fetchCheckpoints();
      if (cancelled) return;
      setIsFetchingModels(false);
      if (list.length > 0) toast.success(`Found ${list.length} checkpoint(s)`);
    };
    run();
    return () => { cancelled = true; };
  }, [isComfyUIConnected, open, fetchCheckpoints]);

  const handleFetchCheckpoints = async () => {
    setIsFetchingModels(true);
    try {
      const checkpoints = await fetchCheckpoints();
      if (checkpoints.length > 0) {
        toast.success(`Found ${checkpoints.length} checkpoint(s)`);
      } else {
        toast.warning("No checkpoints found in ComfyUI");
      }
    } catch {
      toast.error("Failed to fetch checkpoints");
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleCheckConnection = async () => {
    setIsChecking(true);
    const connected = await checkComfyUIConnection();
    setIsChecking(false);
    
    if (connected) {
      toast.success("ComfyUI connected successfully!");
    } else {
      toast.error("Could not connect to ComfyUI. Check your tunnel URL.");
    }
  };

  const handleSaveConfig = () => {
    // Basic URL validation
    try {
      new URL(localBaseUrl);
    } catch {
      toast.error("Invalid URL format. Please enter a valid URL.");
      return;
    }
    
    setComfyUIConfig({ ...comfyUIConfig, baseUrl: localBaseUrl });
    toast.success("ComfyUI URL saved");
  };

  const handleCheckpointChange = (checkpoint: string) => {
    setComfyUIConfig({ ...comfyUIConfig, selectedCheckpoint: checkpoint });
    toast.success(`Checkpoint set to ${checkpoint}`);
  };

  const handleModeChange = (mode: InferenceMode) => {
    setInferenceMode(mode);
    
    if (mode === "local" || mode === "hybrid") {
      toast.info("Make sure to set up a tunnel to your ComfyUI instance");
    } else {
      toast.success("Switched to cloud mode");
    }
  };

  const handleTestGeneration = async () => {
    try {
      setTestImageUrl(null);
      toast.info("Starting test generation...");
      const result = await generateImage("A beautiful sunset over mountains, cinematic, 4k, highly detailed", {
        width: 1024,
        height: 1024
      });
      setTestImageUrl(result.imageUrl);
      toast.success(`Test image generated! Seed: ${result.seed}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test generation failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <Settings className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Inference Settings
          </DialogTitle>
          <DialogDescription>
            Choose where to run AI image and video generation
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Mode Selection */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Inference Mode</Label>
            <RadioGroup 
              value={inferenceMode} 
              onValueChange={(value) => handleModeChange(value as InferenceMode)}
              className="space-y-3"
            >
              {(Object.keys(MODE_INFO) as InferenceMode[]).map((mode) => {
                const info = MODE_INFO[mode];
                const Icon = info.icon;
                return (
                  <Card 
                    key={mode}
                    className={`p-4 cursor-pointer transition-all ${
                      inferenceMode === mode 
                        ? "border-primary bg-primary/5" 
                        : "border-border/50 hover:border-primary/50"
                    }`}
                    onClick={() => handleModeChange(mode)}
                  >
                    <div className="flex items-start gap-3">
                      <RadioGroupItem value={mode} id={mode} className="mt-1" />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Icon className="w-5 h-5 text-primary" />
                          <Label htmlFor={mode} className="font-medium cursor-pointer">
                            {info.title}
                          </Label>
                        </div>
                        <p className="text-sm text-muted-foreground">{info.description}</p>
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <span className="text-green-500 font-medium">Pros:</span>
                            <ul className="mt-1 space-y-0.5 text-muted-foreground">
                              {info.pros.map((pro, i) => (
                                <li key={i}>• {pro}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <span className="text-orange-500 font-medium">Cons:</span>
                            <ul className="mt-1 space-y-0.5 text-muted-foreground">
                              {info.cons.map((con, i) => (
                                <li key={i}>• {con}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </RadioGroup>
          </div>

          {/* ComfyUI Configuration - Show for hybrid and local modes */}
          {(inferenceMode === "local" || inferenceMode === "hybrid") && (
            <Card className="p-4 space-y-4 border-border/50">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Link2 className="w-4 h-4" />
                  ComfyUI Tunnel URL
                </Label>
                <div className="flex items-center gap-2">
                  {isChecking ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : isComfyUIConnected ? (
                    <div className="flex items-center gap-1 text-green-500 text-sm">
                      <CheckCircle2 className="w-4 h-4" />
                      Connected
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-red-500 text-sm">
                      <XCircle className="w-4 h-4" />
                      Not connected
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="baseUrl" className="text-sm">ComfyUI Base URL</Label>
                <Input
                  id="baseUrl"
                  value={localBaseUrl}
                  onChange={(e) => setLocalBaseUrl(e.target.value)}
                  placeholder="https://abc123.ngrok.io"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Use a tunnel service (ngrok, Cloudflare Tunnel, Tailscale) to expose your local ComfyUI
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleSaveConfig}>
                  Save URL
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleCheckConnection}
                  disabled={isChecking || localBaseUrl.includes("your-tunnel-url")}
                >
                  {isChecking ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : null}
                  Test Connection
                </Button>
              </div>

              <div className="text-xs text-muted-foreground space-y-2 bg-muted/30 p-3 rounded-lg">
                <p className="font-medium">Quick Setup with ngrok:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Start ComfyUI: <code className="bg-muted px-1 rounded">python main.py --listen 0.0.0.0 --port 8188</code></li>
                  <li>Run ngrok: <code className="bg-muted px-1 rounded">ngrok http 8188</code></li>
                  <li>Copy the <code className="bg-muted px-1 rounded">https://...ngrok.io</code> URL above</li>
                </ol>
              </div>

              <Button
                variant="link"
                size="sm"
                className="p-0 h-auto text-primary"
                onClick={() => window.open('https://ngrok.com/download', '_blank')}
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                Download ngrok
              </Button>

              {/* Checkpoint Selection */}
              {isComfyUIConnected && (
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Checkpoint Model</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleFetchCheckpoints}
                      disabled={isFetchingModels}
                      className="h-7 px-2"
                    >
                      {isFetchingModels ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                  <Select
                    value={comfyUIConfig.selectedCheckpoint || ""}
                    onValueChange={handleCheckpointChange}
                  >
                    <SelectTrigger className="w-full bg-background">
                      <SelectValue placeholder="Select a checkpoint..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border border-border z-50">
                      {availableCheckpoints.map((checkpoint) => (
                        <SelectItem key={checkpoint} value={checkpoint}>
                          {checkpoint}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {availableCheckpoints.length} checkpoint(s) available
                  </p>
                </div>
              )}

              {/* Test Generation */}
              {isComfyUIConnected && (
                <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
                  <Label className="text-sm font-medium">Test Image Generation</Label>
                  <Button
                    variant="neon"
                    size="sm"
                    onClick={handleTestGeneration}
                    disabled={isTestGenerating || !comfyUIConfig.selectedCheckpoint}
                    className="w-full"
                  >
                    {isTestGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Generating... {testProgress > 0 ? `(${Math.round(testProgress)}%)` : ""}
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4 mr-2" />
                        Generate Test Image
                      </>
                    )}
                  </Button>
                  {!comfyUIConfig.selectedCheckpoint && (
                    <p className="text-xs text-muted-foreground">Select a checkpoint first</p>
                  )}
                  {testImageUrl && (
                    <div className="rounded-lg overflow-hidden border border-border/50">
                      <img src={testImageUrl} alt="Test generation" className="w-full h-auto" />
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Video Settings - Show for local mode */}
          {inferenceMode === "local" && isComfyUIConnected && (
            <VideoSettingsPanel />
          )}

          {/* Current Mode Summary */}
          <Card className="p-4 bg-primary/5 border-primary/20">
            <div className="flex items-center gap-3">
              {inferenceMode === "cloud" && <Cloud className="w-6 h-6 text-primary" />}
              {inferenceMode === "hybrid" && <Server className="w-6 h-6 text-primary" />}
              {inferenceMode === "local" && <Cpu className="w-6 h-6 text-primary" />}
              <div>
                <p className="font-medium">Current Mode: {MODE_INFO[inferenceMode].title}</p>
                <p className="text-sm text-muted-foreground">
                  {inferenceMode === "cloud" && "All generation runs on Replicate cloud"}
                  {inferenceMode === "hybrid" && "Images: Local ComfyUI • Videos: Replicate cloud"}
                  {inferenceMode === "local" && "All generation runs on your local GPU via tunnel"}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
