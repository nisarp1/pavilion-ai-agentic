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

const FONT_SIZE = 82;

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
    durationInFrames: 4,
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        top: undefined,
        bottom: 140,
        height: 280,
        padding: "0 40px",
      }}
    >
      {/* Dark pill background — YouTube CC style */}
      <div
        style={{
          background: "rgba(0,0,0,0.72)",
          borderRadius: 18,
          padding: "16px 32px",
          display: "inline-block",
          maxWidth: "100%",
          transform: makeTransform([
            scale(interpolate(enter, [0, 1], [0.92, 1])),
            translateY(interpolate(enter, [0, 1], [24, 0])),
          ]),
        }}
      >
        <div
          style={{
            fontSize: FONT_SIZE,
            fontFamily: ANEK_MALAYALAM,
            fontWeight: 800,
            lineHeight: 1.3,
            textAlign: "center",
            wordBreak: "break-word",
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
                  // Active word gets a subtle scale-up via text-shadow glow
                  textShadow: active
                    ? `0 0 24px ${highlightColor}88`
                    : "none",
                  transition: "color 0.05s",
                }}
              >
                {t.text}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
