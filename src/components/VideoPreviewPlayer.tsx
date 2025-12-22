import { Player } from "@remotion/player";
import { useMemo } from "react";
import { MusicVideoComposition, MusicVideoCompositionProps, SceneData } from "./remotion/MusicVideoComposition";

interface VideoPreviewPlayerProps {
  scenes: SceneData[];
  audioUrl?: string;
  fps?: number;
  width?: number;
  height?: number;
}

export const VideoPreviewPlayer: React.FC<VideoPreviewPlayerProps> = ({
  scenes,
  audioUrl,
  fps = 24,
  width = 1280,
  height = 720,
}) => {
  // Calculate total duration from scenes
  const totalDurationInFrames = useMemo(() => {
    return scenes.reduce((max, scene) => {
      return Math.max(max, scene.startFrame + scene.durationInFrames);
    }, 0);
  }, [scenes]);

  const inputProps: MusicVideoCompositionProps = useMemo(() => ({ scenes, audioUrl }), [scenes, audioUrl]);

  if (scenes.length === 0 || totalDurationInFrames === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-muted/30 rounded-xl border border-border/50">
        <p className="text-muted-foreground">No scenes to preview</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-border/50">
      <Player
        component={MusicVideoComposition}
        inputProps={inputProps}
        durationInFrames={totalDurationInFrames}
        fps={fps}
        compositionWidth={width}
        compositionHeight={height}
        style={{
          width: "100%",
          aspectRatio: `${width} / ${height}`,
        }}
        controls
        autoPlay={false}
        loop
      />
    </div>
  );
};
