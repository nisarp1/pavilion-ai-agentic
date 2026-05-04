import React from "react";
import { AbsoluteFill } from "remotion";

export const NoCaptionFile: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        height: "auto",
        width: "100%",
        backgroundColor: "rgba(0,0,0,0.8)",
        fontSize: 40,
        padding: 30,
        top: undefined,
        fontFamily: "sans-serif",
        color: "#ffcc00",
      }}
    >
      No caption file found. Generate one by running the subtitle script or
      passing a pre-generated Whisper JSON via the pipeline.
    </AbsoluteFill>
  );
};
