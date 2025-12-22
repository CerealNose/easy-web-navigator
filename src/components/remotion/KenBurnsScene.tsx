import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export type MotionType = 
  | "zoomIn" 
  | "zoomOut" 
  | "panLeft" 
  | "panRight" 
  | "panUp" 
  | "panDown"
  | "static"
  | "rotateZoomIn"
  | "diagonalPan"
  | "breathe";

interface SceneProps {
  imageUrl: string;
  motionType?: MotionType;
}

export const SceneWithMotion: React.FC<SceneProps> = ({ 
  imageUrl, 
  motionType = "static" 
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  
  const progress = frame / durationInFrames;
  
  // Fade in at start, fade out at end
  const opacity = interpolate(
    frame,
    [0, 15, durationInFrames - 15, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  
  const getTransform = () => {
    switch (motionType) {
      case "zoomIn": {
        const scale = interpolate(progress, [0, 1], [1, 1.15]);
        return `scale(${scale})`;
      }
      
      case "zoomOut": {
        const scale = interpolate(progress, [0, 1], [1.15, 1]);
        return `scale(${scale})`;
      }
      
      case "panLeft": {
        const pan = interpolate(progress, [0, 1], [3, -3]);
        return `scale(1.1) translateX(${pan}%)`;
      }
      
      case "panRight": {
        const pan = interpolate(progress, [0, 1], [-3, 3]);
        return `scale(1.1) translateX(${pan}%)`;
      }
      
      case "panUp": {
        const pan = interpolate(progress, [0, 1], [3, -3]);
        return `scale(1.1) translateY(${pan}%)`;
      }
      
      case "panDown": {
        const pan = interpolate(progress, [0, 1], [-3, 3]);
        return `scale(1.1) translateY(${pan}%)`;
      }
      
      case "rotateZoomIn": {
        const scale = interpolate(progress, [0, 1], [1, 1.1]);
        const rotate = interpolate(progress, [0, 1], [0, 2]);
        return `scale(${scale}) rotate(${rotate}deg)`;
      }
      
      case "diagonalPan": {
        const panX = interpolate(progress, [0, 1], [-2, 2]);
        const panY = interpolate(progress, [0, 1], [-2, 2]);
        return `scale(1.15) translate(${panX}%, ${panY}%)`;
      }
      
      case "breathe": {
        // Subtle pulse effect
        const breatheProgress = Math.sin(progress * Math.PI);
        const scale = interpolate(breatheProgress, [0, 1], [1, 1.05]);
        return `scale(${scale})`;
      }
      
      case "static":
      default:
        return `scale(1.02)`;
    }
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Img
        src={imageUrl}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: getTransform(),
          opacity,
        }}
      />
    </AbsoluteFill>
  );
};

// Keep backward compatibility
export const KenBurnsScene = SceneWithMotion;
