import { makeTransform, scale, translateY } from "@remotion/animation-utils";
import { TikTokPage } from "@remotion/captions";
import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ANEK_MALAYALAM } from "../fonts";

const FONT_SIZE = 80;

export const MalayalamCaptionPage: React.FC<{
  readonly page: TikTokPage;
  readonly highlightColor?: string;
}> = ({ page, highlightColor = "#FFE600" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeInMs = (frame / fps) * 1000;

  const enter = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: 5,
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        top: undefined,
        bottom: 160,
        height: 320,
        padding: "0 48px",
      }}
    >
      <div
        style={{
          fontSize: FONT_SIZE,
          fontFamily: ANEK_MALAYALAM,
          fontWeight: 800,
          color: "white",
          WebkitTextStroke: "14px black",
          paintOrder: "stroke",
          lineHeight: 1.35,
          textAlign: "center",
          width: "100%",
          wordBreak: "break-word",
          transform: makeTransform([
            scale(interpolate(enter, [0, 1], [0.85, 1])),
            translateY(interpolate(enter, [0, 1], [40, 0])),
          ]),
        }}
      >
        {page.tokens.map((t) => {
          const startRelativeToSequence = t.fromMs - page.startMs;
          const endRelativeToSequence = t.toMs - page.startMs;
          const active =
            startRelativeToSequence <= timeInMs &&
            endRelativeToSequence > timeInMs;

          return (
            <span
              key={t.fromMs}
              style={{
                display: "inline",
                whiteSpace: "pre-wrap",
                color: active ? highlightColor : "white",
              }}
            >
              {t.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
