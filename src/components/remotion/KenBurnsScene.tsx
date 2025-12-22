import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

interface KenBurnsSceneProps {
  imageUrl: string;
  motionType?: "zoomIn" | "zoomOut" | "panLeft" | "panRight" | "panUp" | "panDown";
}

export const KenBurnsScene: React.FC<KenBurnsSceneProps> = ({ 
  imageUrl, 
  motionType = "zoomIn" 
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  
  // Calculate motion based on type
  const getTransform = () => {
    const progress = frame / durationInFrames;
    
    switch (motionType) {
      case "zoomIn":
        const scaleIn = interpolate(progress, [0, 1], [1, 1.2]);
        return `scale(${scaleIn})`;
      
      case "zoomOut":
        const scaleOut = interpolate(progress, [0, 1], [1.2, 1]);
        return `scale(${scaleOut})`;
      
      case "panLeft":
        const panL = interpolate(progress, [0, 1], [0, -5]);
        return `scale(1.1) translateX(${panL}%)`;
      
      case "panRight":
        const panR = interpolate(progress, [0, 1], [0, 5]);
        return `scale(1.1) translateX(${panR}%)`;
      
      case "panUp":
        const panU = interpolate(progress, [0, 1], [0, -5]);
        return `scale(1.1) translateY(${panU}%)`;
      
      case "panDown":
        const panD = interpolate(progress, [0, 1], [0, 5]);
        return `scale(1.1) translateY(${panD}%)`;
      
      default:
        return `scale(1)`;
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
        }}
      />
    </AbsoluteFill>
  );
};
