import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from "remotion";
import { TopChrome } from "../components/TopChrome";
import { anim, easeInCubic, easeOutBack, easeOutCubic } from "../easing";
import { ANEK_MALAYALAM, MANROPE } from "../fonts";
import { resolveAsset } from "../utils";

export interface TickerHeadlineProps {
  tickerTag: string;          // e.g. "BREAKING" | "TRANSFER" | "INJURY"
  tickerHeadline: string;     // Main news headline in Malayalam
  tickerSubHeadline?: string;
  tickerTimestamp?: string;
  bgColor?: string;
  accent?: string;
  heroSrc?: string;
  brandName?: string;
  logoSrc?: string;
}

const SCENE_DUR = 4;

export const TickerHeadline: React.FC<TickerHeadlineProps> = ({
  tickerTag,
  tickerHeadline,
  tickerSubHeadline,
  tickerTimestamp,
  bgColor = "#0a0a0a",
  accent = "#FF2D2D",
  heroSrc,
  brandName,
  logoSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const sceneOp = anim(t, 1, 0, SCENE_DUR - 0.35, SCENE_DUR, easeInCubic);
  const bgOp = anim(t, 0, 1, 0, 0.7, easeOutCubic);
  const chromeOp = anim(t, 0, 1, 0.1, 0.6, easeOutCubic);
  const chromeY = (1 - chromeOp) * -12;

  // Tag badge slides in from left
  const tagOp = anim(t, 0, 1, 0.15, 0.6, easeOutBack);
  const tagX = (1 - tagOp) * -120;

  // Accent bar grows from left
  const barScale = anim(t, 0, 1, 0.4, 0.9, easeOutCubic);

  // Headline slides in from right
  const headlineOp = anim(t, 0, 1, 0.5, 1.1, easeOutCubic);
  const headlineX = (1 - headlineOp) * 80;

  // Sub-headline fades up
  const subOp = anim(t, 0, 1, 1.0, 1.5, easeOutCubic);
  const subY = (1 - subOp) * 14;

  // Timestamp fades in last
  const tsOp = anim(t, 0, 1, 1.3, 1.8, easeOutCubic);

  const mlFont = `${ANEK_MALAYALAM}, "Noto Sans Malayalam", system-ui, sans-serif`;
  const enFont = `${MANROPE}, system-ui, sans-serif`;

  // Word-by-word for headline
  const words = tickerHeadline.split(" ");
  const perWord = 0.12;

  return (
    <AbsoluteFill style={{ background: bgColor, overflow: "hidden", opacity: sceneOp }}>
      {/* Hero background */}
      {heroSrc && (
        <div style={{ position: "absolute", inset: 0, opacity: bgOp * 0.2 }}>
          <Img
            src={resolveAsset(heroSrc)}
            style={{
              position: "absolute", top: "50%", left: "50%",
              width: "130%", height: "130%", objectFit: "cover",
              transform: "translate(-50%, -50%)", filter: "blur(16px)",
            }}
          />
        </div>
      )}

      {/* Dark gradient overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(135deg, ${accent}18 0%, transparent 50%), linear-gradient(to bottom, rgba(0,0,0,0.75), rgba(0,0,0,0.9))`,
      }} />

      {/* Diagonal accent stripe (subtle) */}
      <div style={{
        position: "absolute", top: 0, bottom: 0, left: 0,
        width: 8, background: accent,
        opacity: anim(t, 0, 1, 0.1, 0.5, easeOutCubic),
      }} />

      <TopChrome brandName={brandName} accent={accent} opacity={chromeOp} ty={chromeY} />

      {/* Content area — centered vertically */}
      <div style={{
        position: "absolute", left: 70, right: 70, top: "35%", bottom: "20%",
        display: "flex", flexDirection: "column", justifyContent: "center", gap: 36,
      }}>
        {/* Tag badge */}
        <div style={{ opacity: tagOp, transform: `translateX(${tagX}px)` }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 14,
            background: accent, borderRadius: 8,
            paddingInline: 28, paddingBlock: 12,
          }}>
            {/* Pulsing dot for live feel */}
            <div style={{
              width: 16, height: 16, borderRadius: "50%", background: "#fff",
              opacity: 0.7 + 0.3 * Math.sin(t * Math.PI * 3),
            }} />
            <span style={{
              fontFamily: enFont, fontSize: 36, fontWeight: 900,
              color: "#fff", letterSpacing: "0.18em", textTransform: "uppercase",
            }}>
              {tickerTag}
            </span>
          </div>
        </div>

        {/* Accent separator bar */}
        <div style={{
          height: 4, borderRadius: 2, background: accent,
          transformOrigin: "left center",
          transform: `scaleX(${barScale})`,
          width: "100%",
        }} />

        {/* Headline (word by word) */}
        <div style={{
          opacity: headlineOp, transform: `translateX(${headlineX}px)`,
          fontFamily: mlFont, fontWeight: 700, fontSize: 78,
          lineHeight: 1.2, color: "#fff", letterSpacing: "-0.01em",
        }}>
          {words.map((word, i) => {
            const wordStart = 0.5 + i * perWord;
            const op = anim(t, 0, 1, wordStart, wordStart + 0.35, easeOutCubic);
            return (
              <span key={i} style={{
                display: "inline-block", opacity: op, marginRight: "0.28em",
              }}>
                {word}
              </span>
            );
          })}
        </div>

        {/* Sub-headline */}
        {tickerSubHeadline && (
          <div style={{
            opacity: subOp, transform: `translateY(${subY}px)`,
            fontFamily: mlFont, fontWeight: 500, fontSize: 48,
            color: "rgba(255,255,255,0.65)", lineHeight: 1.3,
          }}>
            {tickerSubHeadline}
          </div>
        )}

        {/* Timestamp */}
        {tickerTimestamp && (
          <div style={{
            opacity: tsOp,
            fontFamily: enFont, fontSize: 28, fontWeight: 500,
            color: "rgba(255,255,255,0.4)", letterSpacing: "0.06em",
          }}>
            {tickerTimestamp}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
