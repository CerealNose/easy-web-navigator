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
  Settings, 
  Cloud, 
  Server, 
  Cpu, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  ExternalLink 
} from "lucide-react";
import { useSettings, InferenceMode } from "@/contexts/SettingsContext";
import { toast } from "sonner";

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
    checkComfyUIConnection
  } = useSettings();
  
  const [open, setOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [localHost, setLocalHost] = useState(comfyUIConfig.host);
  const [localPort, setLocalPort] = useState(comfyUIConfig.port.toString());

  // Check connection when dialog opens or config changes
  useEffect(() => {
    if (open && (inferenceMode === "local" || inferenceMode === "hybrid")) {
      handleCheckConnection();
    }
  }, [open, inferenceMode]);

  const handleCheckConnection = async () => {
    setIsChecking(true);
    const connected = await checkComfyUIConnection();
    setIsChecking(false);
    
    if (connected) {
      toast.success("ComfyUI connected successfully!");
    } else {
      toast.error("Could not connect to ComfyUI. Is it running?");
    }
  };

  const handleSaveConfig = () => {
    const port = parseInt(localPort, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      toast.error("Invalid port number");
      return;
    }
    
    setComfyUIConfig({ host: localHost, port });
    toast.success("ComfyUI configuration saved");
  };

  const handleModeChange = (mode: InferenceMode) => {
    setInferenceMode(mode);
    
    if (mode === "local" || mode === "hybrid") {
      toast.info("Make sure ComfyUI is running locally");
    } else {
      toast.success("Switched to cloud mode");
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
                  <Cpu className="w-4 h-4" />
                  ComfyUI Configuration
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="host" className="text-sm">Host</Label>
                  <Input
                    id="host"
                    value={localHost}
                    onChange={(e) => setLocalHost(e.target.value)}
                    placeholder="localhost"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="port" className="text-sm">Port</Label>
                  <Input
                    id="port"
                    value={localPort}
                    onChange={(e) => setLocalPort(e.target.value)}
                    placeholder="8188"
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleSaveConfig}>
                  Save Config
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleCheckConnection}
                  disabled={isChecking}
                >
                  {isChecking ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : null}
                  Test Connection
                </Button>
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <p>Make sure ComfyUI is running with:</p>
                <code className="block bg-muted/50 p-2 rounded font-mono">
                  python main.py --listen 0.0.0.0 --port 8188 --enable-cors-header
                </code>
              </div>

              <Button
                variant="link"
                size="sm"
                className="p-0 h-auto text-primary"
                onClick={() => window.open('/docs/LOCAL_COMFYUI_SETUP.md', '_blank')}
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                View full setup guide
              </Button>
            </Card>
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
                  {inferenceMode === "local" && "All generation runs on your local GPU"}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
