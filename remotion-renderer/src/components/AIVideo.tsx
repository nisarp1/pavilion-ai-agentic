import { Caption, createTikTokStyleCaptions } from "@remotion/captions";
import React, { useMemo } from "react";
import { AbsoluteFill, Audio, Sequence } from "remotion";
import { z } from "zod";
import { FPS, INTRO_DURATION, TAIL_BUFFER_FRAMES } from "../lib/constants";
import { TimelineSchema } from "../lib/types";
import { calculateFrameTiming } from "../lib/utils";
import { ANEK_MALAYALAM } from "../fonts";
import { Background } from "./Background";
import Subtitle from "./Subtitle";
import { MalayalamCaptionPage } from "./MalayalamCaptionPage";
import { TopChrome } from "./TopChrome";

export const aiVideoSchema = z.object({
  timeline: TimelineSchema.nullable(),
  logoSrc:   z.string().optional(),
  brandName: z.string().optional(),
  accent:    z.string().optional(),
});

// Minimum word count before attempting word-level TikTok captions.
// If STT or ElevenLabs returned very few words (garbage result), fall back
// to timeline.text phrase subtitles which always have full coverage.
const CAPTION_MIN_WORDS = 5;

// Split pages that have more than maxTokens words into smaller sub-pages.
// Each sub-page's durationMs extends to the next sub-page's start so there are no gaps.
function limitTokensPerPage(pages: ReturnType<typeof createTikTokStyleCaptions>['pages'], maxTokens: number) {
  const expanded: typeof pages = [];
  for (const page of pages) {
    if (page.tokens.length <= maxTokens) {
      expanded.push({ ...page });
      continue;
    }
    for (let i = 0; i < page.tokens.length; i += maxTokens) {
      const tokens = page.tokens.slice(i, i + maxTokens);
      expanded.push({
        text: tokens.map(t => t.text).join('').trim(),
        startMs: tokens[0].fromMs,
        durationMs: Math.max(100, tokens[tokens.length - 1].toMs - tokens[0].fromMs),
        tokens,
      });
    }
  }
  for (let i = 0; i < expanded.length - 1; i++) {
    const gap = expanded[i + 1].startMs - expanded[i].startMs;
    if (gap > 0) expanded[i].durationMs = gap;
  }
  return expanded;
}

export const AIVideo: React.FC<z.infer<typeof aiVideoSchema>> = ({ timeline, logoSrc, brandName, accent }) => {
  const wordCaptions = (timeline?.wordCaptions ?? []) as Caption[];

  const pages = useMemo(() => {
    if (wordCaptions.length < CAPTION_MIN_WORDS) return [];
    try {
      const { pages: raw } = createTikTokStyleCaptions({
        captions: wordCaptions,
        combineTokensWithinMilliseconds: 400,
      });
      const limited = limitTokensPerPage(raw, 6);
      return limited.length > 0 ? limited : [];
    } catch {
      return [];
    }
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
      {/* Last element extends to totalContentMs + TAIL_BUFFER so there's no black at end of render */}
      {timeline.elements.map((element, index) => {
        const isLast = index === timeline.elements.length - 1;
        const tailMs = isLast ? (TAIL_BUFFER_FRAMES / FPS) * 1000 : 0;
        const endMs = isLast ? Math.max(element.endMs, totalContentMs) + tailMs : element.endMs;
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
          // Use Math.floor for BOTH start and end so consecutive pages are
          // exactly back-to-back with no 1-frame gaps or overlaps.
          const startFrame = Math.floor((page.startMs / 1000) * FPS) + INTRO_DURATION;
          const endFrame   = Math.floor(((page.startMs + page.durationMs) / 1000) * FPS) + INTRO_DURATION;
          const durationFrames = Math.max(1, endFrame - startFrame);
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
      <TopChrome logoSrc={logoSrc} brandName={brandName} accent={accent} />

      {/* ── Audio tracks — last track extended by tail buffer to match composition length ── */}
      {timeline.audio.map((element, index) => {
        const isLastAudio = index === timeline.audio.length - 1;
        const tailMs = isLastAudio ? (TAIL_BUFFER_FRAMES / FPS) * 1000 : 0;
        const { startFrame, duration } = calculateFrameTiming(
          element.startMs,
          element.endMs + tailMs,
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
