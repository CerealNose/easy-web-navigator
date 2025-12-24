import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Loader2, RefreshCw, Video, CheckSquare, Square, Calendar, Clock, Search, Filter, X, Image, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import JSZip from "jszip";

interface ReplicatePrediction {
  id: string;
  status: string;
  created_at: string;
  completed_at?: string;
  output?: string | string[];
  input?: {
    prompt?: string;
    image?: string;
  };
  model: string;
  version: string;
  error?: string;
  urls?: {
    stream?: string;
    get?: string;
    cancel?: string;
  };
  data_removed?: boolean;
}

export function RetrievePanel() {
  const [predictions, setPredictions] = useState<ReplicatePrediction[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "succeeded" | "failed">("succeeded");
  const [typeFilter, setTypeFilter] = useState<"all" | "video" | "image">("all");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchPredictions = async (loadMore = false) => {
    setIsLoading(true);
    try {
      const response = await supabase.functions.invoke("retrieve-predictions", {
        body: { 
          cursor: loadMore ? cursor : null,
          limit: 50
        }
      });

      if (response.error) throw response.error;

      const data = response.data;
      const newPredictions = data.predictions || [];
      
      console.log("Raw predictions:", newPredictions.slice(0, 3));
      
      // Sort by newest first
      const sortedPredictions = newPredictions.sort(
        (a: ReplicatePrediction, b: ReplicatePrediction) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      if (loadMore) {
        setPredictions(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const uniqueNew = sortedPredictions.filter((p: ReplicatePrediction) => !existingIds.has(p.id));
          return [...prev, ...uniqueNew];
        });
      } else {
        setPredictions(sortedPredictions);
      }
      
      setCursor(data.next || null);
      setHasMore(!!data.next);
      
      if (sortedPredictions.length === 0 && !loadMore) {
        toast.info("No predictions found in your Replicate account");
      } else if (!loadMore) {
        toast.success(`Found ${sortedPredictions.length} predictions`);
      }
    } catch (err) {
      console.error("Error fetching predictions:", err);
      toast.error("Failed to fetch predictions from Replicate");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPredictions();
  }, []);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    const filtered = getFilteredPredictions();
    // Only select items that have direct output (not just stream URLs which often fail)
    const downloadableIds = filtered
      .filter(p => p.status === "succeeded" && p.output && !p.data_removed)
      .map(p => p.id);
    setSelectedIds(new Set(downloadableIds));
    
    const skipped = filtered.filter(p => p.status === "succeeded" && (!p.output || p.data_removed)).length;
    if (skipped > 0) {
      toast.info(`Skipped ${skipped} items with expired/removed data`);
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const getOutputUrl = (prediction: ReplicatePrediction): string | null => {
    // First check direct output
    if (prediction.output) {
      if (typeof prediction.output === "string") return prediction.output;
      if (Array.isArray(prediction.output) && prediction.output.length > 0) {
        return prediction.output[0];
      }
    }
    // Fallback to stream URL for previews (useful when data_removed is true)
    if (prediction.urls?.stream) {
      return prediction.urls.stream;
    }
    return null;
  };

  const isVideoPrediction = (prediction: ReplicatePrediction): boolean => {
    return prediction.model?.includes("seedance") || 
           prediction.model?.includes("bytedance") ||
           prediction.model?.includes("video") ||
           prediction.model?.includes("wan") ||
           prediction.model?.includes("kling");
  };

  const isImagePrediction = (prediction: ReplicatePrediction): boolean => {
    return prediction.model?.includes("flux") || 
           prediction.model?.includes("stable-diffusion") ||
           prediction.model?.includes("sdxl") ||
           prediction.model?.includes("midjourney") ||
           prediction.model?.includes("dall") ||
           prediction.model?.includes("image") ||
           !isVideoPrediction(prediction);
  };

  const downloadSingle = async (prediction: ReplicatePrediction) => {
    const outputUrl = getOutputUrl(prediction);
    if (!outputUrl) {
      toast.error("No output URL available");
      return;
    }

    try {
      const response = await fetch(outputUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const isVideo = isVideoPrediction(prediction);
      const ext = isVideo ? "mp4" : (outputUrl.includes(".png") ? "png" : "webp");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${isVideo ? "video" : "image"}_${prediction.id}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Downloaded!");
    } catch (err) {
      console.error("Download error:", err);
      toast.error("Failed to download");
    }
  };

  const fetchWithTimeout = async (url: string, timeoutMs = 10000): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  };

  const downloadSelected = async () => {
    if (selectedIds.size === 0) {
      toast.error("No items selected");
      return;
    }

    setIsDownloading(true);
    try {
      const zip = new JSZip();
      const selectedPredictions = predictions.filter(p => selectedIds.has(p.id));
      
      // Filter to only downloadable items (with direct output, not removed)
      const downloadable = selectedPredictions.filter(p => p.output && !p.data_removed);
      
      if (downloadable.length === 0) {
        toast.error("No downloadable items selected (data may have been removed by Replicate)");
        setIsDownloading(false);
        return;
      }

      let downloadCount = 0;
      let failedCount = 0;
      
      for (const prediction of downloadable) {
        const outputUrl = getOutputUrl(prediction);
        if (!outputUrl) {
          failedCount++;
          continue;
        }

        try {
          const response = await fetchWithTimeout(outputUrl, 15000);
          if (!response.ok) {
            failedCount++;
            continue;
          }
          const blob = await response.blob();
          const timestamp = new Date(prediction.created_at).toISOString().split("T")[0];
          const isVideo = isVideoPrediction(prediction);
          const ext = isVideo ? "mp4" : (outputUrl.includes(".png") ? "png" : "webp");
          zip.file(`${timestamp}_${prediction.id}.${ext}`, blob);
          downloadCount++;
        } catch (err) {
          console.error(`Failed to fetch ${prediction.id}:`, err);
          failedCount++;
        }
      }

      if (downloadCount === 0) {
        toast.error("No items could be downloaded - URLs may have expired");
        setIsDownloading(false);
        return;
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `replicate_outputs_${new Date().toISOString().split("T")[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      if (failedCount > 0) {
        toast.success(`Downloaded ${downloadCount} items (${failedCount} failed)`);
      } else {
        toast.success(`Downloaded ${downloadCount} items as ZIP`);
      }
    } catch (err) {
      console.error("ZIP download error:", err);
      toast.error("Failed to create ZIP file");
    } finally {
      setIsDownloading(false);
    }
  };

  const getFilteredPredictions = () => {
    return predictions.filter(p => {
      const matchesSearch = searchQuery === "" || 
        p.input?.prompt?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.model?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      
      const matchesType = typeFilter === "all" || 
        (typeFilter === "video" && isVideoPrediction(p)) ||
        (typeFilter === "image" && isImagePrediction(p));
      
      return matchesSearch && matchesStatus && matchesType;
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const formatDuration = (prediction: ReplicatePrediction) => {
    if (!prediction.completed_at || !prediction.created_at) return "—";
    const start = new Date(prediction.created_at).getTime();
    const end = new Date(prediction.completed_at).getTime();
    const seconds = Math.round((end - start) / 1000);
    return `${seconds}s`;
  };

  const filteredPredictions = getFilteredPredictions();
  const selectedCount = selectedIds.size;

  return (
    <Card className="p-6 glass-card border-primary/20">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Video className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Retrieve Videos</h2>
              <p className="text-sm text-muted-foreground">
                Browse and download past generated videos from Replicate
              </p>
            </div>
          </div>
          <Button
            onClick={() => fetchPredictions()}
            disabled={isLoading}
            variant="outline"
            size="sm"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by prompt or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="bg-background border border-border rounded-md px-3 py-2 text-sm"
              >
                <option value="all">All Types</option>
                <option value="video">Videos</option>
                <option value="image">Images</option>
              </select>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-background border border-border rounded-md px-3 py-2 text-sm"
            >
              <option value="all">All Status</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        {/* Selection Actions */}
        <div className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={selectAll}>
              <CheckSquare className="w-4 h-4 mr-2" />
              Select All
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              <Square className="w-4 h-4 mr-2" />
              Clear
            </Button>
            <span className="text-sm text-muted-foreground">
              {selectedCount} selected
            </span>
          </div>
          <Button
            onClick={downloadSelected}
            disabled={selectedCount === 0 || isDownloading}
            size="sm"
          >
            {isDownloading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Download Selected ({selectedCount})
          </Button>
        </div>

        {/* Predictions List */}
        <ScrollArea className="h-[500px]">
          <div className="space-y-3 pr-4">
            {isLoading && predictions.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredPredictions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {predictions.length === 0 ? (
                  <p>No predictions found. Generate some content first!</p>
                ) : (
                  <p>No items match your search criteria</p>
                )}
              </div>
            ) : (
              filteredPredictions.map((prediction) => {
                const outputUrl = getOutputUrl(prediction);
                const isVideo = isVideoPrediction(prediction);
                const isSelected = selectedIds.has(prediction.id);
                const isExpired = prediction.data_removed || !prediction.output;
                const canSelect = prediction.status === "succeeded" && !isExpired;

                return (
                  <div
                    key={prediction.id}
                    onClick={() => canSelect && toggleSelection(prediction.id)}
                    className={`flex items-start gap-4 p-4 rounded-lg border-2 transition-all cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary/20 ring-2 ring-primary/30"
                        : "border-border/50 bg-muted/20 hover:bg-muted/40 hover:border-primary/30"
                    }`}
                  >
                    {/* Checkbox */}
                    <div className="pt-1">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelection(prediction.id)}
                        disabled={!canSelect}
                      />
                    </div>

                    {/* Preview */}
                    <div className="w-32 h-20 rounded-md overflow-hidden bg-muted flex-shrink-0 relative">
                      {outputUrl ? (
                        isVideo ? (
                          <>
                            <video
                              src={outputUrl}
                              className="w-full h-full object-cover"
                              muted
                              playsInline
                              preload="metadata"
                              onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                              onMouseLeave={(e) => {
                                e.currentTarget.pause();
                                e.currentTarget.currentTime = 0;
                              }}
                              onError={(e) => {
                                // Hide video element on error, show fallback
                                e.currentTarget.style.display = 'none';
                                const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                                if (fallback) fallback.style.display = 'flex';
                              }}
                            />
                            {/* Fallback shown on video error */}
                            <div className="absolute inset-0 hidden items-center justify-center bg-muted">
                              <Video className="w-8 h-8 text-muted-foreground" />
                            </div>
                            {/* Video indicator overlay */}
                            <div className="absolute bottom-1 right-1 bg-black/60 rounded px-1.5 py-0.5 flex items-center gap-1">
                              <Video className="w-3 h-3 text-white" />
                              <span className="text-[10px] text-white font-medium">VIDEO</span>
                            </div>
                          </>
                        ) : (
                          <img
                            src={outputUrl}
                            alt="Generated"
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              // Replace with fallback on error
                              e.currentTarget.style.display = 'none';
                              const parent = e.currentTarget.parentElement;
                              if (parent) {
                                parent.innerHTML = '<div class="w-full h-full flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg></div>';
                              }
                            }}
                          />
                        )
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {isVideo ? (
                            <Video className="w-8 h-8 text-muted-foreground" />
                          ) : (
                            <Image className="w-8 h-8 text-muted-foreground" />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            prediction.status === "succeeded"
                              ? "bg-green-500/20 text-green-400"
                              : prediction.status === "failed"
                              ? "bg-red-500/20 text-red-400"
                              : "bg-yellow-500/20 text-yellow-400"
                          }`}
                        >
                          {prediction.status}
                        </span>
                        {isExpired && prediction.status === "succeeded" && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/20 text-orange-400 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            EXPIRED
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground font-mono">
                          {prediction.id.slice(0, 12)}...
                        </span>
                      </div>
                      <p className="text-sm text-foreground line-clamp-2 mb-2">
                        {prediction.input?.prompt || "No prompt available"}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(prediction.created_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDuration(prediction)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0">
                      {outputUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => downloadSingle(prediction)}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Load More */}
        {hasMore && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => fetchPredictions(true)}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Load More
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
