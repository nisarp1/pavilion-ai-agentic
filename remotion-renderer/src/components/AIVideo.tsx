import { Caption, createTikTokStyleCaptions } from "@remotion/captions";
import React, { useMemo } from "react";
import { AbsoluteFill, Audio, Sequence } from "remotion";
import { z } from "zod";
import { FPS, INTRO_DURATION } from "../lib/constants";
import { TimelineSchema } from "../lib/types";
import { calculateFrameTiming } from "../lib/utils";
import { ANEK_MALAYALAM } from "../fonts";
import { Background } from "./Background";
import Subtitle from "./Subtitle";
import { MalayalamCaptionPage } from "./MalayalamCaptionPage";
import { TopChrome } from "./TopChrome";

export const aiVideoSchema = z.object({
  timeline: TimelineSchema.nullable(),
});

export const AIVideo: React.FC<z.infer<typeof aiVideoSchema>> = ({ timeline }) => {
  const wordCaptions = (timeline?.wordCaptions ?? []) as Caption[];

  const { pages } = useMemo(() => {
    if (wordCaptions.length === 0) return { pages: [] };
    return createTikTokStyleCaptions({
      captions: wordCaptions,
      combineTokensWithinMilliseconds: 1200,
    });
  }, [wordCaptions]);

  // True end time = max of all tracks so the last background image
  // stays visible through the full audio duration instead of going black.
  const totalContentMs = useMemo(() => {
    if (!timeline) return 10000;
    const ends: number[] = [];
    if (timeline.elements?.length)     ends.push(Math.max(...timeline.elements.map((e) => e.endMs)));
    if (timeline.audio?.length)        ends.push(Math.max(...timeline.audio.map((a) => a.endMs)));
    if (timeline.wordCaptions?.length) ends.push(Math.max(...timeline.wordCaptions.map((c) => c.endMs)));
    if (timeline.text?.length)         ends.push(Math.max(...timeline.text.map((t) => t.endMs)));
    return ends.length ? Math.max(...ends) : 10000;
  }, [timeline]);

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
              fontWeight: 800,
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
      {/* Last element is extended to totalContentMs so there's no black gap if audio outlasts elements */}
      {timeline.elements.map((element, index) => {
        const isLast = index === timeline.elements.length - 1;
        const endMs = isLast ? Math.max(element.endMs, totalContentMs) : element.endMs;
        const { startFrame, duration } = calculateFrameTiming(
          element.startMs,
          endMs,
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

      {/* ── Captions: word-level TikTok highlight (preferred) or phrase fallback ── */}
      {pages.length > 0 ? (
        pages.map((page, i) => {
          // Word timings are relative to audio start (t=0); offset by intro card.
          const startFrame = Math.floor((page.startMs / 1000) * FPS) + INTRO_DURATION;
          const durationFrames = Math.max(1, Math.ceil((page.durationMs / 1000) * FPS));
          return (
            <Sequence key={`wc-${i}`} from={startFrame} durationInFrames={durationFrames}>
              <MalayalamCaptionPage page={page} highlightColor="#FFE600" />
            </Sequence>
          );
        })
      ) : (
        timeline.text.map((element, index) => {
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
        })
      )}

      {/* ── TopChrome: persistent logo + brand overlay ── */}
      <TopChrome />

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
