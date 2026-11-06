import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export interface HelloWorldProps {
  titleText: string;
  titleColor: string;
}

export const HelloWorld: React.FC<HelloWorldProps> = ({
  titleText,
  titleColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    fps,
    frame,
    config: { damping: 14, stiffness: 120 },
  });

  const opacity = interpolate(frame, [0, 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#081b32",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Plus Jakarta Sans, sans-serif",
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          opacity,
          textAlign: "center",
          padding: 48,
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: titleColor || "#F8FAFC",
            letterSpacing: "-0.02em",
          }}
        >
          {titleText}
        </div>
        <div
          style={{
            marginTop: 18,
            fontSize: 28,
            color: "#F59E0B",
            fontWeight: 600,
          }}
        >
          Batam Video Studio • Editor Properti Lokal
        </div>
      </div>
    </AbsoluteFill>
  );
};
