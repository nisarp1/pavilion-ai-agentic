import React from "react";
import { Composition, staticFile } from "remotion";
import { PavilionReel, TOTAL_FRAMES } from "./PavilionReel";
import { PAVILION_REEL_DEFAULTS, PavilionReelProps, ScenePlanItem } from "./types";
import {
  CaptionedVideo,
  calculateCaptionedVideoMetadata,
  captionedVideoSchema,
} from "./templates/captioned_video";
import { AIVideo, aiVideoSchema } from "./components/AIVideo";
import { FPS, INTRO_DURATION } from "./lib/constants";
import type { Timeline } from "./lib/types";
import "./fonts";

// Compute total frame count from the agent's scene plan, with a minimum floor.
const calculatePavilionReelMetadata = async ({
  props,
}: {
  props: PavilionReelProps;
}) => {
  const scenes: ScenePlanItem[] = props.scenes ?? [];
  let totalFrames = 0;

  if (scenes.length === 0) {
    totalFrames = TOTAL_FRAMES;
  } else {
    const last = scenes[scenes.length - 1];
    totalFrames = last.start_frame + last.duration_frames;
  }

  return { durationInFrames: Math.max(totalFrames, 60) };
};

// Duration = last background element end time (ms → frames) + intro card
const calculateAIVideoMetadata = async ({
  props,
}: {
  props: { timeline: Timeline | null };
}) => {
  if (!props.timeline || !props.timeline.elements?.length) {
    return { durationInFrames: 300 + INTRO_DURATION };
  }
  const sorted = [...props.timeline.elements].sort((a, b) => b.endMs - a.endMs);
  const lastMs = sorted[0].endMs;
  const contentFrames = Math.ceil((lastMs / 1000) * FPS);
  return { durationInFrames: contentFrames + INTRO_DURATION };
};

export const Root: React.FC = () => {
  return (
    <>
      {/* ── Prompt-to-Video: timeline-driven composition (primary pipeline) ── */}
      <Composition
        id="PavilionAIVideo"
        component={AIVideo as any}
        calculateMetadata={calculateAIVideoMetadata as any}
        schema={aiVideoSchema as any}
        fps={FPS}
        width={1080}
        height={1920}
        durationInFrames={300 + INTRO_DURATION}
        defaultProps={{ timeline: null } as any}
      />

      {/* ── Sports reel: legacy modular multi-scene composition ── */}
      <Composition
        id="PavilionReel"
        component={PavilionReel as any}
        calculateMetadata={calculatePavilionReelMetadata as any}
        durationInFrames={TOTAL_FRAMES}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={PAVILION_REEL_DEFAULTS as any}
      />

      {/* ── TikTok-style captioned video overlay ── */}
      <Composition
        id="CaptionedVideo"
        component={CaptionedVideo as any}
        calculateMetadata={calculateCaptionedVideoMetadata as any}
        schema={captionedVideoSchema as any}
        fps={30}
        width={1080}
        height={1920}
        durationInFrames={300}
        defaultProps={{
          src: staticFile("sample-video.mp4"),
          highlightColor: "#39E508",
        } as any}
      />
    </>
  );
};
