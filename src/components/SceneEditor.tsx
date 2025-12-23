import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  ImageIcon, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Sparkles,
  Edit3,
  Upload,
  Clock,
  Trash2
} from "lucide-react";
import { toast } from "sonner";

export interface EditableScene {
  section: string;
  prompt: string;
  lyrics: string;
  duration: number;
  start: number;
  end: number;
  uploadedImage?: { file: File; preview: string };
}

interface SceneEditorProps {
  scenes: EditableScene[];
  onScenesChange: (scenes: EditableScene[]) => void;
  onGeneratePrompt: (index: number, lyrics: string) => Promise<string | null>;
  isGeneratingPrompt: number | null;
}

export function SceneEditor({ 
  scenes, 
  onScenesChange, 
  onGeneratePrompt,
  isGeneratingPrompt 
}: SceneEditorProps) {
  const [expandedScene, setExpandedScene] = useState<number | null>(null);
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const updateScene = (index: number, updates: Partial<EditableScene>) => {
    const newScenes = scenes.map((scene, i) => 
      i === index ? { ...scene, ...updates } : scene
    );
    onScenesChange(newScenes);
  };

  const handleImageUpload = (index: number, file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error("Please upload an image file");
      return;
    }
    
    const preview = URL.createObjectURL(file);
    updateScene(index, { uploadedImage: { file, preview } });
    toast.success(`Image added to Scene ${index + 1}`);
  };

  const removeImage = (index: number) => {
    const scene = scenes[index];
    if (scene.uploadedImage) {
      URL.revokeObjectURL(scene.uploadedImage.preview);
    }
    updateScene(index, { uploadedImage: undefined });
  };

  const handleRegeneratePrompt = async (index: number) => {
    const scene = scenes[index];
    const newPrompt = await onGeneratePrompt(index, scene.lyrics);
    if (newPrompt) {
      updateScene(index, { prompt: newPrompt });
      toast.success(`Scene ${index + 1}: New prompt generated`);
    }
  };

  const toggleExpand = (index: number) => {
    setExpandedScene(expandedScene === index ? null : index);
  };

  if (scenes.length === 0) {
    return null;
  }

  return (
    <Card className="p-6 glass-card border-border/50">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Edit3 className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Edit Scenes Before Generating</h3>
        </div>
        <div className="text-sm text-muted-foreground">
          {scenes.filter(s => s.uploadedImage).length}/{scenes.length} images added
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Click on a scene to edit its prompt or add a custom image. AI will generate images for scenes without uploads.
      </p>

      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
        {scenes.map((scene, index) => (
          <div
            key={index}
            className={`rounded-lg border transition-all ${
              expandedScene === index 
                ? 'border-primary/50 bg-muted/30' 
                : 'border-border/30 bg-muted/10 hover:bg-muted/20'
            }`}
          >
            {/* Scene Header - Always visible */}
            <div 
              className="flex items-center gap-3 p-3 cursor-pointer"
              onClick={() => toggleExpand(index)}
            >
              {/* Thumbnail or placeholder */}
              <div className="w-12 h-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
                {scene.uploadedImage ? (
                  <img 
                    src={scene.uploadedImage.preview} 
                    alt={`Scene ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-5 h-5 text-muted-foreground/50" />
                  </div>
                )}
              </div>

              {/* Scene info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Scene {index + 1}</span>
                  <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
                    {scene.section}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <Clock className="w-3 h-3" />
                  <span>{scene.start.toFixed(1)}s → {scene.end.toFixed(1)}s</span>
                  <span className="text-secondary">({scene.duration.toFixed(1)}s)</span>
                </div>
              </div>

              {/* Status indicator */}
              <div className="flex items-center gap-2">
                {scene.uploadedImage && (
                  <span className="text-xs text-green-500 flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" />
                    Custom
                  </span>
                )}
                {expandedScene === index ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>

            {/* Expanded content */}
            {expandedScene === index && (
              <div className="px-3 pb-3 space-y-4 border-t border-border/30 pt-3">
                {/* Lyrics display */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Lyrics for this scene</Label>
                  <p className="text-sm bg-background/50 p-2 rounded-md italic">
                    "{scene.lyrics || 'No lyrics'}"
                  </p>
                </div>

                {/* Prompt editor */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Visual Prompt</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRegeneratePrompt(index);
                      }}
                      disabled={isGeneratingPrompt === index}
                      className="h-7 text-xs"
                    >
                      <Sparkles className="w-3 h-3 mr-1" />
                      {isGeneratingPrompt === index ? 'Generating...' : 'Regenerate'}
                    </Button>
                  </div>
                  <Textarea
                    value={scene.prompt}
                    onChange={(e) => updateScene(index, { prompt: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Describe the visual for this scene..."
                    className="bg-background min-h-[80px] text-sm"
                  />
                </div>

                {/* Image upload */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Custom Image (optional)</Label>
                  
                  {scene.uploadedImage ? (
                    <div className="flex items-center gap-3">
                      <img 
                        src={scene.uploadedImage.preview}
                        alt="Custom scene"
                        className="w-20 h-20 object-cover rounded-lg"
                      />
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground truncate">
                          {scene.uploadedImage.file.name}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeImage(index);
                          }}
                          className="h-7 text-xs text-destructive hover:text-destructive mt-1"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="file"
                        accept="image/*"
                        ref={el => fileInputRefs.current[index] = el}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(index, file);
                          e.target.value = '';
                        }}
                        className="hidden"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRefs.current[index]?.click();
                        }}
                        className="h-8"
                      >
                        <Upload className="w-3 h-3 mr-2" />
                        Upload Image
                      </Button>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        If no image is uploaded, AI will generate one based on the prompt
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
