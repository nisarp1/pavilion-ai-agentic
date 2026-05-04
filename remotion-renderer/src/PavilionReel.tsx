import React from "react";
import { AbsoluteFill, Audio, Sequence } from "remotion";
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

// Maps template_id → scene component
const SCENE_REGISTRY: Record<string, React.ComponentType<Record<string, unknown>>> = {
  hero_headline:   Scene1 as React.ComponentType<Record<string, unknown>>,
  player_card:     Scene2 as React.ComponentType<Record<string, unknown>>,
  scoreboard:      Scoreboard as React.ComponentType<Record<string, unknown>>,
  stat_comparison: StatComparison as React.ComponentType<Record<string, unknown>>,
  quote_card:      QuoteCard as React.ComponentType<Record<string, unknown>>,
  ticker_headline: TickerHeadline as React.ComponentType<Record<string, unknown>>,
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
        // Merge global brand props with scene-specific props
        const mergedProps = { ...brandProps, ...scene.props };
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
  const { scenes, audioSrc, bgColor = "#000000" } = props;

  if (scenes && scenes.length > 0) {
    return (
      <ModularReel
        scenes={scenes}
        brandProps={extractBrandProps(props)}
        audioSrc={audioSrc}
        bgColor={bgColor}
      />
    );
  }

  // Fall back to the original two-scene layout for backward compatibility
  return <LegacyReel {...props} />;
};
