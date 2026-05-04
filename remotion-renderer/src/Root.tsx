import React, { ComponentType } from "react";
import { Composition, staticFile } from "remotion";
import { PavilionReel, TOTAL_FRAMES } from "./PavilionReel";
import { PAVILION_REEL_DEFAULTS, PavilionReelProps, ScenePlanItem } from "./types";
import {
  CaptionedVideo,
  calculateCaptionedVideoMetadata,
  captionedVideoSchema,
} from "./templates/captioned_video";
import "./fonts";

// Compute total frame count from the agent's scene plan, with a minimum floor.
const calculatePavilionReelMetadata = async ({
  props,
}: {
  props: PavilionReelProps;
}) => {
  const scenes: ScenePlanItem[] = props.scenes ?? [];
  if (scenes.length === 0) {
    return { durationInFrames: TOTAL_FRAMES };
  }
  const last = scenes[scenes.length - 1];
  const totalFrames = last.start_frame + last.duration_frames;
  return { durationInFrames: Math.max(totalFrames, 60) };
};

export const Root: React.FC = () => {
  return (
    <>
      {/* ── Sports reel: modular multi-scene composition ── */}
      <Composition
        id="PavilionReel"
        component={PavilionReel as ComponentType<Record<string, unknown>>}
        calculateMetadata={
          calculatePavilionReelMetadata as Parameters<
            typeof Composition
          >[0]["calculateMetadata"]
        }
        durationInFrames={TOTAL_FRAMES}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={PAVILION_REEL_DEFAULTS as Record<string, unknown>}
      />

      {/* ── TikTok-style captioned video overlay ── */}
      {/* Duration is calculated dynamically from the input video's actual length */}
      <Composition
        id="CaptionedVideo"
        component={CaptionedVideo as ComponentType<Record<string, unknown>>}
        calculateMetadata={
          calculateCaptionedVideoMetadata as Parameters<
            typeof Composition
          >[0]["calculateMetadata"]
        }
        schema={captionedVideoSchema}
        fps={30}
        width={1080}
        height={1920}
        durationInFrames={300}
        defaultProps={{
          src: staticFile("sample-video.mp4"),
          highlightColor: "#39E508",
        }}
      />
    </>
  );
};
