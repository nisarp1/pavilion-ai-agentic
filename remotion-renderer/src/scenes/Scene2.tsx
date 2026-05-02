import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from "remotion";
import { TopChrome } from "../components/TopChrome";
import { anim, easeOutBack, easeOutCubic } from "../easing";
import { ANEK_MALAYALAM, MANROPE } from "../fonts";
import { PavilionReelProps, StatItem } from "../types";
import { hexA, resolveAsset } from "../utils";

const SCENE_DUR = 8;
const HEADLINE_RESERVE = 360;
const CARD_TOP = 300;

const StatsGrid: React.FC<{ stats: StatItem[]; t: number; cardAccent: string }> = ({ stats, t, cardAccent }) => {
  const rows: StatItem[][] = [];
  for (let i = 0; i < stats.length; i += 3) rows.push(stats.slice(i, i + 3));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "28px 0 32px" }}>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: "flex", justifyContent: "space-around", alignItems: "flex-start", gap: 12 }}>
          {row.map((stat, ci) => {
            const idx = ri * 3 + ci;
            const startT = 1.4 + idx * 0.12;
            const op = anim(t, 0, 1, startT, startT + 0.4, easeOutBack);
            const statY = (1 - op) * 12;
            return (
              <div key={ci} style={{ flex: "1 1 0", minWidth: 0, textAlign: "center", opacity: op, transform: `translateY(${statY}px)`, fontFamily: `${MANROPE}, system-ui, sans-serif` }}>
                <div style={{ fontSize: 88, fontWeight: 800, lineHeight: 1, color: "#fff", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{stat.value}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: "rgba(255,255,255,0.95)", marginTop: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>{stat.label}</div>
              </div>
            );
          })}
          {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, k) => <div key={`pad-${k}`} style={{ flex: "1 1 0" }} />)}
        </div>
      ))}
    </div>
  );
};

export const Scene2: React.FC<PavilionReelProps> = ({
  scene2Headline: headline, playerName, playerImage, heroSrc,
  stats, brandName, bgColor, accent, cardColor, cardAccent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const bgOp = anim(t, 0, 1, 0, 0.6, easeOutCubic);
  const bgScale = 1.06 + 0.06 * Math.min(1, t / SCENE_DUR);
  const cardOp = anim(t, 0, 1, 0.3, 1.0, easeOutCubic);
  const cardY = (1 - cardOp) * 30;
  const nameOp = anim(t, 0, 1, 0.55, 1.1, easeOutBack);
  const nameScale = 0.94 + 0.06 * anim(t, 0, 1, 0.55, 1.1, easeOutBack);
  const imgOp = anim(t, 0, 1, 0.8, 1.4, easeOutCubic);
  const imgScale = 1.04 + 0.04 * Math.min(1, t / SCENE_DUR);
  const chromeOp = anim(t, 0, 1, 0.05, 0.6, easeOutCubic);
  const chromeY = (1 - chromeOp) * -10;

  const words = headline.split(" ");
  const headlineStart = 1.4 + Math.min(stats.length, 6) * 0.1 + 0.3;
  const perWord = 0.18;

  return (
    <AbsoluteFill style={{ background: bgColor, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, opacity: bgOp }}>
        <Img
          src={resolveAsset(heroSrc)}
          style={{
            position: "absolute", top: "50%", left: "50%",
            width: "120%", height: "120%", objectFit: "cover", objectPosition: "center 20%",
            transform: `translate(-50%, -50%) scale(${bgScale})`,
          }}
        />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.35) 30%, rgba(0,0,0,0.85) 100%)" }} />
      </div>

      <TopChrome brandName={brandName} accent={accent} opacity={chromeOp} ty={chromeY} />

      <div style={{
        position: "absolute", left: 80, right: 80, top: CARD_TOP, bottom: HEADLINE_RESERVE,
        opacity: cardOp, transform: `translateY(${cardY}px)`, zIndex: 4,
        display: "flex", flexDirection: "column", pointerEvents: "none",
      }}>
        <div style={{
          background: hexA(cardColor, 0.92), borderTopLeftRadius: 14, borderTopRightRadius: 14,
          padding: "28px 24px", textAlign: "center", opacity: nameOp, transform: `scale(${nameScale})`,
          transformOrigin: "bottom center", fontFamily: `${MANROPE}, system-ui, sans-serif`,
          fontSize: 48, fontWeight: 800, lineHeight: 1, letterSpacing: "0.06em", color: "#fff", flexShrink: 0,
        }}>
          {playerName}
        </div>

        <div style={{
          flex: 1, minHeight: 0, background: hexA(cardColor, 0.72),
          backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
          borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
          padding: "28px 24px 24px", display: "flex", flexDirection: "column", gap: 18, boxSizing: "border-box",
        }}>
          <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden", opacity: imgOp, background: "#0a0a0a" }}>
            <Img
              src={resolveAsset(playerImage)}
              style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                objectFit: "cover", objectPosition: "center 25%",
                transform: `scale(${imgScale})`, transformOrigin: "center 30%",
              }}
            />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 10, background: cardAccent }} />
          </div>
          <StatsGrid stats={stats} t={t} cardAccent={cardAccent} />
        </div>
      </div>

      <div style={{
        position: "absolute", left: 80, right: 80, bottom: 100, height: HEADLINE_RESERVE - 100, zIndex: 4,
        display: "flex", alignItems: "flex-end",
        fontFamily: `${ANEK_MALAYALAM}, "Noto Sans Malayalam", system-ui, sans-serif`,
        fontWeight: 700, fontSize: 64, lineHeight: 1.25, letterSpacing: "-0.005em", color: "#fff",
      }}>
        <div>
          {words.map((word, i) => {
            const wordStart = headlineStart + i * perWord;
            const op = anim(t, 0, 1, wordStart, wordStart + 0.4, easeOutCubic);
            const wordY = (1 - op) * 12;
            return (
              <span key={i} style={{ display: "inline-block", opacity: op, transform: `translateY(${wordY}px)`, marginRight: "0.25em" }}>
                {word}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
