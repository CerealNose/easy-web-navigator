import { AbsoluteFill, Audio, Sequence } from "remotion";
import { SceneWithMotion, MotionType } from "./KenBurnsScene";

export interface SceneData {
  imageUrl: string;
  startFrame: number;
  durationInFrames: number;
  motionType: MotionType;
  sectionName: string;
}

export interface MusicVideoCompositionProps extends Record<string, unknown> {
  scenes: SceneData[];
  audioUrl?: string;
}

// Varied motion types for cinematic feel
const MOTION_TYPES: MotionType[] = [
  "zoomIn", "panRight", "static", "diagonalPan", "zoomOut", 
  "breathe", "panLeft", "rotateZoomIn", "panUp", "panDown"
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
          <SceneWithMotion
            imageUrl={scene.imageUrl}
            motionType={scene.motionType || MOTION_TYPES[index % MOTION_TYPES.length]}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
