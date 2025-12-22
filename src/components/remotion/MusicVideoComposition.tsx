import { AbsoluteFill, Audio, Sequence } from "remotion";
import { KenBurnsScene } from "./KenBurnsScene";

export interface SceneData {
  imageUrl: string;
  startFrame: number;
  durationInFrames: number;
  motionType: "zoomIn" | "zoomOut" | "panLeft" | "panRight" | "panUp" | "panDown";
  sectionName: string;
}

export interface MusicVideoCompositionProps extends Record<string, unknown> {
  scenes: SceneData[];
  audioUrl?: string;
}

const MOTION_TYPES: SceneData["motionType"][] = [
  "zoomIn", "panRight", "zoomOut", "panLeft", "panUp", "panDown"
];

export const MusicVideoComposition: React.FC<MusicVideoCompositionProps> = ({ 
  scenes,
  audioUrl 
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Audio track */}
      {audioUrl && (
        <Audio src={audioUrl} volume={1} />
      )}
      
      {/* Scene sequences */}
      {scenes.map((scene, index) => (
        <Sequence
          key={index}
          from={scene.startFrame}
          durationInFrames={scene.durationInFrames}
          name={scene.sectionName}
        >
          <KenBurnsScene
            imageUrl={scene.imageUrl}
            motionType={scene.motionType || MOTION_TYPES[index % MOTION_TYPES.length]}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
