import { Caption, createTikTokStyleCaptions } from "@remotion/captions";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, OffthreadVideo, Sequence } from "remotion";
import LiveCaption from "./templates/captioned_video/SubtitlePage";
import { Scene1 } from "./scenes/Scene1";
import { Scene2 } from "./scenes/Scene2";
import { Scoreboard } from "./scenes/Scoreboard";
import { StatComparison } from "./scenes/StatComparison";
import { QuoteCard } from "./scenes/QuoteCard";
import { TickerHeadline } from "./scenes/TickerHeadline";
import { PavilionReelProps, ScenePlanItem } from "./types";

// Legacy fixed durations (used when no scenes[] provided)
export const SCENE1_FRAMES = 180; // 6s × 30fps
export const SCENE2_FRAMES = 240; // 8s × 30fps
export const TOTAL_FRAMES = SCENE1_FRAMES + SCENE2_FRAMES; // 420 (14s)

// Inline scene for captioned_video clips used within a PavilionReel plan.
// The standalone CaptionedVideo composition (with Whisper JSON) is a separate
// Root entry; this variant simply plays the source video without auto-captions.
const CaptionedVideoScene: React.FC<Record<string, unknown>> = (props) => {
  const src = props.src as string | undefined;
  if (!src) return <AbsoluteFill style={{ background: "#000" }} />;
  return (
    <AbsoluteFill>
      <OffthreadVideo src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </AbsoluteFill>
  );
};

// Maps template_id → scene component
const SCENE_REGISTRY: Record<string, React.ComponentType<any>> = {
  // Original PavilionReel modular scenes
  hero_headline: Scene1,
  player_card: Scene2,
  scoreboard: Scoreboard,
  stat_comparison: StatComparison,
  quote_card: QuoteCard,
  ticker_headline: TickerHeadline,
  captioned_video: CaptionedVideoScene,
};

// Global brand props that are forwarded to every scene
const BRAND_KEYS: (keyof PavilionReelProps)[] = [
  "bgColor", "accent", "brandName", "logoSrc", "cardColor", "cardAccent",
];

function extractBrandProps(props: PavilionReelProps): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of BRAND_KEYS) {
    if (props[key] !== undefined) out[key] = props[key];
  }
  return out;
}

// ── Modular renderer ───────────────────────────────────────────────────────────

const ModularReel: React.FC<{
  scenes: ScenePlanItem[];
  brandProps: Record<string, unknown>;
  audioSrc?: string;
  bgColor: string;
}> = ({ scenes, brandProps, audioSrc, bgColor }) => {
  return (
    <AbsoluteFill style={{ background: bgColor }}>
      {audioSrc && <Audio src={audioSrc} />}
      {scenes.map((scene) => {
        const Component = SCENE_REGISTRY[scene.template_id];
        if (!Component) {
          console.warn(`[PavilionReel] Unknown template_id: "${scene.template_id}" — skipping scene ${scene.scene_number}`);
          return null;
        }
        // Merge brand props + scene props; pass durationInFrames so internal animations align
        const mergedProps = {
          ...brandProps,
          ...scene.props,
          durationInFrames: scene.duration_frames,
          suppressCaptions: true
        };
        return (
          <Sequence
            key={scene.scene_number}
            from={scene.start_frame}
            durationInFrames={scene.duration_frames}
          >
            <Component {...mergedProps} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

// ── Legacy renderer (Scene1 + Scene2 hardcoded) ────────────────────────────────

const LegacyReel: React.FC<PavilionReelProps> = (props) => {
  return (
    <AbsoluteFill style={{ background: props.bgColor }}>
      {props.audioSrc && <Audio src={props.audioSrc} />}
      <Sequence from={0} durationInFrames={SCENE1_FRAMES}>
        <Scene1 {...(props as Record<string, unknown>)} />
      </Sequence>
      <Sequence from={SCENE1_FRAMES} durationInFrames={SCENE2_FRAMES}>
        <Scene2 {...(props as Record<string, unknown>)} />
      </Sequence>
    </AbsoluteFill>
  );
};

// ── Entry point ────────────────────────────────────────────────────────────────

export const PavilionReel: React.FC<PavilionReelProps> = (props) => {
  const { scenes: inputScenes = [], audioSrc, bgColor = "#000000", captionsUrl } = props;

  const scenes = inputScenes;

  const [captions, setCaptions] = useState<Caption[]>([]);
  const [handle] = useState(() => (captionsUrl ? delayRender() : null));

  const fetchCaptions = useCallback(async () => {
    if (!captionsUrl || handle === null) return;
    try {
      const res = await fetch(captionsUrl);
      if (res.ok) setCaptions((await res.json()) as Caption[]);
    } catch {
      // captions unavailable — render without them
    } finally {
      continueRender(handle);
    }
  }, [captionsUrl, handle]);

  useEffect(() => {
    fetchCaptions();
  }, [fetchCaptions]);

  const { pages } = useMemo(() => {
    return createTikTokStyleCaptions({
      captions,
      combineTokensWithinMilliseconds: 1200,
    });
  }, [captions]);

  return (
    <AbsoluteFill>
      {scenes && scenes.length > 0 ? (
        <ModularReel
          scenes={scenes}
          brandProps={extractBrandProps(props)}
          audioSrc={audioSrc}
          bgColor={bgColor}
        />
      ) : (
        <LegacyReel {...props} />
      )}

      {/* Global word-by-word caption overlay — each page is its own Sequence for timeline visibility */}
      {pages.map((page, i) => (
        <Sequence
          key={`page-${i}`}
          from={(page.startMs / 1000) * 30}
          durationInFrames={Math.max(1, (page.durationMs / 1000) * 30)}
        >
          <LiveCaption page={page} highlightColor={props.accent} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
