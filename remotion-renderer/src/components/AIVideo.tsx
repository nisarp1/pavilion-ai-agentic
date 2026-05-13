import React from "react";
import { AbsoluteFill, Audio, Sequence } from "remotion";
import { z } from "zod";
import { FPS, INTRO_DURATION } from "../lib/constants";
import { TimelineSchema } from "../lib/types";
import { calculateFrameTiming } from "../lib/utils";
import { ANEK_MALAYALAM } from "../fonts";
import { Background } from "./Background";
import Subtitle from "./Subtitle";

export const aiVideoSchema = z.object({
  timeline: TimelineSchema.nullable(),
});

export const AIVideo: React.FC<z.infer<typeof aiVideoSchema>> = ({ timeline }) => {

  if (!timeline) {
    return (
      <AbsoluteFill style={{ backgroundColor: "black", justifyContent: "center", alignItems: "center" }}>
        <div style={{ color: "white", fontFamily: ANEK_MALAYALAM, fontSize: 48 }}>
          No timeline provided
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* ── 1-second intro title card ── */}
      <Sequence durationInFrames={INTRO_DURATION}>
        <AbsoluteFill
          style={{
            justifyContent: "center",
            alignItems: "center",
            textAlign: "center",
            zIndex: 10,
          }}
        >
          <div
            style={{
              fontSize: 96,
              lineHeight: 1.2,
              width: "85%",
              color: "black",
              fontFamily: ANEK_MALAYALAM,
              backgroundColor: "#FFE600",
              paddingTop: 24,
              paddingBottom: 24,
              paddingLeft: 20,
              paddingRight: 20,
              border: "10px solid black",
            }}
          >
            {timeline.shortTitle}
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* ── Background images with zoom + blur transitions ── */}
      {timeline.elements.map((element, index) => {
        const { startFrame, duration } = calculateFrameTiming(
          element.startMs,
          element.endMs,
          { includeIntro: index === 0 },
        );
        return (
          <Sequence
            key={`bg-${index}`}
            from={startFrame}
            durationInFrames={duration}
            premountFor={3 * FPS}
          >
            <Background item={element} index={index} />
          </Sequence>
        );
      })}

      {/* ── Caption text chunks synced to audio ── */}
      {timeline.text.map((element, index) => {
        const { startFrame, duration } = calculateFrameTiming(
          element.startMs,
          element.endMs,
          { addIntroOffset: true },
        );
        return (
          <Sequence key={`text-${index}`} from={startFrame} durationInFrames={duration}>
            <Subtitle text={element.text} />
          </Sequence>
        );
      })}

      {/* ── Audio tracks ── */}
      {timeline.audio.map((element, index) => {
        const { startFrame, duration } = calculateFrameTiming(
          element.startMs,
          element.endMs,
          { addIntroOffset: true },
        );
        return (
          <Sequence
            key={`audio-${index}`}
            from={startFrame}
            durationInFrames={duration}
            premountFor={3 * FPS}
          >
            <Audio src={element.audioUrl} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
