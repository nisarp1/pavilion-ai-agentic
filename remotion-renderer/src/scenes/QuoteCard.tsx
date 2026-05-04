import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from "remotion";
import { TopChrome } from "../components/TopChrome";
import { anim, easeInCubic, easeOutBack, easeOutCubic } from "../easing";
import { ANEK_MALAYALAM, MANROPE } from "../fonts";
import { resolveAsset } from "../utils";

export interface QuoteCardProps {
  quoteText: string;
  speakerName: string;
  speakerTitle?: string;
  speakerImageSrc?: string;
  bgColor?: string;
  accent?: string;
  quoteFont?: string;
  quoteFontSize?: number;
  heroSrc?: string;
  brandName?: string;
  logoSrc?: string;
}

const SCENE_DUR = 6;

export const QuoteCard: React.FC<QuoteCardProps> = ({
  quoteText,
  speakerName,
  speakerTitle,
  speakerImageSrc,
  bgColor = "#0a0a0a",
  accent = "#FF2D2D",
  quoteFont,
  quoteFontSize = 68,
  heroSrc,
  brandName,
  logoSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const resolvedFont = quoteFont
    ? `${quoteFont}, ${ANEK_MALAYALAM}, "Noto Sans Malayalam", system-ui, sans-serif`
    : `${ANEK_MALAYALAM}, "Noto Sans Malayalam", system-ui, sans-serif`;

  const sceneOp = anim(t, 1, 0, SCENE_DUR - 0.4, SCENE_DUR, easeInCubic);
  const bgOp = anim(t, 0, 1, 0, 0.9, easeOutCubic);
  const chromeOp = anim(t, 0, 1, 0.1, 0.7, easeOutCubic);
  const chromeY = (1 - chromeOp) * -12;

  // Large decorative quotation mark fades in
  const quoteMarkOp = anim(t, 0, 1, 0.1, 0.6, easeOutCubic);
  const quoteMarkScale = 0.8 + 0.2 * anim(t, 0, 1, 0.1, 0.6, easeOutCubic);

  // Attribution slides up and fades in
  const attributionOp = anim(t, 0, 1, 1.8, 2.4, easeOutBack);
  const attributionY = (1 - attributionOp) * 20;

  // Speaker portrait pops in
  const portraitOp = anim(t, 0, 1, 1.4, 2.0, easeOutBack);
  const portraitScale = 0.85 + 0.15 * anim(t, 0, 1, 1.4, 2.0, easeOutBack);

  // Word-by-word quote animation
  const words = quoteText.split(" ");
  const quoteStart = 0.5;
  const perWord = 0.16;

  const fontSize = Math.min(quoteFontSize, quoteFontSize * (1 - Math.max(0, words.length - 12) * 0.02));

  return (
    <AbsoluteFill style={{ background: bgColor, overflow: "hidden", opacity: sceneOp }}>
      {/* Hero background */}
      {heroSrc && (
        <div style={{ position: "absolute", inset: 0, opacity: bgOp * 0.3 }}>
          <Img
            src={resolveAsset(heroSrc)}
            style={{
              position: "absolute", top: "50%", left: "50%",
              width: "130%", height: "130%", objectFit: "cover",
              transform: "translate(-50%, -50%)", filter: "blur(22px)",
            }}
          />
        </div>
      )}

      {/* Radial gradient for depth */}
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at 50% 40%, ${accent}14 0%, transparent 70%), linear-gradient(to bottom, rgba(0,0,0,0.6), rgba(0,0,0,0.85))`,
      }} />

      <TopChrome brandName={brandName} accent={accent} opacity={chromeOp} ty={chromeY} />

      {/* Decorative quotation mark */}
      <div style={{
        position: "absolute", top: 220, left: 60,
        fontFamily: `Georgia, serif`, fontSize: 320,
        color: accent, lineHeight: 1, opacity: quoteMarkOp * 0.18,
        transform: `scale(${quoteMarkScale})`, transformOrigin: "top left",
        userSelect: "none", pointerEvents: "none",
      }}>
        "
      </div>

      {/* Accent line left */}
      <div style={{
        position: "absolute", left: 60, top: 320, width: 6, height: 260,
        background: accent, borderRadius: 3,
        opacity: anim(t, 0, 1, 0.3, 0.8, easeOutCubic),
      }} />

      {/* Quote text */}
      <div style={{
        position: "absolute", left: 90, right: 80, top: 300, bottom: 440,
        display: "flex", alignItems: "center",
        fontFamily: resolvedFont,
        fontWeight: 700, fontSize: fontSize, lineHeight: 1.35,
        letterSpacing: "-0.01em", color: "#fff",
      }}>
        <div>
          {words.map((word, i) => {
            const wordStart = quoteStart + i * perWord;
            const op = anim(t, 0, 1, wordStart, wordStart + 0.4, easeOutCubic);
            const wordY = (1 - op) * 12;
            return (
              <span key={i} style={{
                display: "inline-block", opacity: op,
                transform: `translateY(${wordY}px)`, marginRight: "0.28em",
              }}>
                {word}
              </span>
            );
          })}
        </div>
      </div>

      {/* Attribution */}
      <div style={{
        position: "absolute", left: 80, right: 80, bottom: 140,
        display: "flex", alignItems: "center", gap: 32,
        opacity: attributionOp, transform: `translateY(${attributionY}px)`,
      }}>
        {/* Horizontal rule */}
        <div style={{ height: 2, background: accent, flex: 1, borderRadius: 1 }} />

        {speakerImageSrc && (
          <div style={{
            width: 100, height: 100, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
            border: `3px solid ${accent}`,
            opacity: portraitOp, transform: `scale(${portraitScale})`,
          }}>
            <Img src={resolveAsset(speakerImageSrc)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{
            fontFamily: `${MANROPE}, system-ui, sans-serif`,
            fontSize: 44, fontWeight: 800, color: "#fff",
            textTransform: "uppercase", letterSpacing: "0.06em",
          }}>
            {speakerName}
          </div>
          {speakerTitle && (
            <div style={{
              fontFamily: `${MANROPE}, system-ui, sans-serif`,
              fontSize: 28, fontWeight: 400, color: "rgba(255,255,255,0.5)",
              letterSpacing: "0.04em",
            }}>
              {speakerTitle}
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
