import { makeTransform, scale, translateY } from "@remotion/animation-utils";
import { fitText } from "@remotion/layout-utils";
import React from "react";
import { AbsoluteFill, interpolate, useVideoConfig } from "remotion";
import { ANEK_MALAYALAM } from "../fonts";

export const Word: React.FC<{
  enterProgress: number;
  text: string;
  stroke: boolean;
}> = ({ enterProgress, text, stroke }) => {
  const { width } = useVideoConfig();
  const desiredFontSize = 110;

  const fittedText = fitText({
    fontFamily: ANEK_MALAYALAM,
    text,
    withinWidth: width * 0.82,
  });

  const fontSize = Math.min(desiredFontSize, fittedText.fontSize);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        top: undefined,
        bottom: 320,
        height: 160,
      }}
    >
      <div
        style={{
          fontSize,
          color: "white",
          WebkitTextStroke: stroke ? "18px black" : undefined,
          transform: makeTransform([
            scale(interpolate(enterProgress, [0, 1], [0.82, 1])),
            translateY(interpolate(enterProgress, [0, 1], [40, 0])),
          ]),
          fontFamily: ANEK_MALAYALAM,
          textAlign: "center",
          lineHeight: 1.25,
          padding: "0 24px",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
