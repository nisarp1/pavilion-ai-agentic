import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from "remotion";
import { TopChrome } from "../components/TopChrome";
import { anim, easeInCubic, easeOutBack, easeOutCubic } from "../easing";
import { MANROPE } from "../fonts";
import { hexA, resolveAsset } from "../utils";

export interface ComparisonStat {
  label: string;
  leftValue: number;
  rightValue: number;
}

export interface StatComparisonProps {
  leftName: string;
  rightName: string;
  comparisonStats: ComparisonStat[];
  leftImageSrc?: string;
  rightImageSrc?: string;
  comparisonTitle?: string;
  leftColor?: string;
  rightColor?: string;
  bgColor?: string;
  heroSrc?: string;
  accent?: string;
  brandName?: string;
  logoSrc?: string;
}

const SCENE_DUR = 7;

const StatBar: React.FC<{
  stat: ComparisonStat;
  index: number;
  t: number;
  leftColor: string;
  rightColor: string;
}> = ({ stat, index, t, leftColor, rightColor }) => {
  const font = `${MANROPE}, system-ui, sans-serif`;
  const max = Math.max(stat.leftValue, stat.rightValue, 1);
  const leftRatio = stat.leftValue / max;
  const rightRatio = stat.rightValue / max;

  const barStart = 1.8 + index * 0.2;
  const barProgress = anim(t, 0, 1, barStart, barStart + 0.6, easeOutCubic);
  const labelOp = anim(t, 0, 1, barStart - 0.1, barStart + 0.3, easeOutCubic);

  const MAX_BAR_WIDTH = 340;

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 8, opacity: labelOp,
    }}>
      {/* Label */}
      <div style={{
        textAlign: "center", fontFamily: font, fontSize: 26, fontWeight: 600,
        color: "rgba(255,255,255,0.55)", letterSpacing: "0.1em", textTransform: "uppercase",
      }}>
        {stat.label}
      </div>
      {/* Bars row */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
      }}>
        {/* Left value */}
        <span style={{
          fontFamily: font, fontSize: 40, fontWeight: 800, color: leftColor,
          minWidth: 70, textAlign: "right", fontVariantNumeric: "tabular-nums",
        }}>
          {stat.leftValue}
        </span>
        {/* Left bar */}
        <div style={{ width: MAX_BAR_WIDTH, display: "flex", justifyContent: "flex-end" }}>
          <div style={{
            height: 18, borderRadius: 9,
            background: leftColor,
            width: MAX_BAR_WIDTH * leftRatio * barProgress,
            transition: "none",
          }} />
        </div>
        {/* Center divider */}
        <div style={{ width: 3, height: 32, background: "rgba(255,255,255,0.2)", borderRadius: 2 }} />
        {/* Right bar */}
        <div style={{ width: MAX_BAR_WIDTH }}>
          <div style={{
            height: 18, borderRadius: 9,
            background: rightColor,
            width: MAX_BAR_WIDTH * rightRatio * barProgress,
          }} />
        </div>
        {/* Right value */}
        <span style={{
          fontFamily: font, fontSize: 40, fontWeight: 800, color: rightColor,
          minWidth: 70, textAlign: "left", fontVariantNumeric: "tabular-nums",
        }}>
          {stat.rightValue}
        </span>
      </div>
    </div>
  );
};

export const StatComparison: React.FC<StatComparisonProps> = ({
  leftName,
  rightName,
  comparisonStats = [],
  leftImageSrc,
  rightImageSrc,
  comparisonTitle,
  leftColor = "#10b981",
  rightColor = "#e8b73b",
  bgColor = "#0a0a0a",
  heroSrc,
  accent = "#FF2D2D",
  brandName,
  logoSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const font = `${MANROPE}, system-ui, sans-serif`;
  const sceneOp = anim(t, 1, 0, SCENE_DUR - 0.4, SCENE_DUR, easeInCubic);
  const bgOp = anim(t, 0, 1, 0, 0.8, easeOutCubic);
  const chromeOp = anim(t, 0, 1, 0.1, 0.7, easeOutCubic);
  const chromeY = (1 - chromeOp) * -12;

  const titleOp = anim(t, 0, 1, 0.3, 0.8, easeOutCubic);
  const leftPlayerOp = anim(t, 0, 1, 0.5, 1.1, easeOutBack);
  const leftPlayerX = (1 - leftPlayerOp) * -50;
  const rightPlayerOp = anim(t, 0, 1, 0.5, 1.1, easeOutBack);
  const rightPlayerX = (1 - rightPlayerOp) * 50;

  return (
    <AbsoluteFill style={{ background: bgColor, overflow: "hidden", opacity: sceneOp }}>
      {/* Blurred hero background */}
      {heroSrc && (
        <div style={{ position: "absolute", inset: 0, opacity: bgOp * 0.25 }}>
          <Img
            src={resolveAsset(heroSrc)}
            style={{
              position: "absolute", top: "50%", left: "50%",
              width: "130%", height: "130%", objectFit: "cover",
              transform: "translate(-50%, -50%)", filter: "blur(20px)",
            }}
          />
        </div>
      )}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.8))" }} />

      <TopChrome brandName={brandName} accent={accent} opacity={chromeOp} ty={chromeY} />

      {/* Title */}
      {comparisonTitle && (
        <div style={{
          position: "absolute", top: 280, left: 0, right: 0, textAlign: "center",
          fontFamily: font, fontSize: 38, fontWeight: 700,
          color: "rgba(255,255,255,0.7)", letterSpacing: "0.08em", textTransform: "uppercase",
          opacity: titleOp,
        }}>
          {comparisonTitle}
        </div>
      )}

      {/* Player headers */}
      <div style={{
        position: "absolute", top: 340, left: 60, right: 60,
        display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        gap: 40,
      }}>
        {/* Left player */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
          opacity: leftPlayerOp, transform: `translateX(${leftPlayerX}px)`,
        }}>
          {leftImageSrc && (
            <div style={{
              width: 180, height: 180, borderRadius: "50%", overflow: "hidden",
              border: `4px solid ${leftColor}`,
            }}>
              <Img src={resolveAsset(leftImageSrc)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%" }} />
            </div>
          )}
          <div style={{
            fontFamily: font, fontSize: 46, fontWeight: 800, color: leftColor,
            textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "center",
          }}>
            {leftName}
          </div>
        </div>

        {/* VS divider */}
        <div style={{
          fontFamily: font, fontSize: 52, fontWeight: 900, color: "rgba(255,255,255,0.15)",
          paddingBottom: 16,
        }}>
          VS
        </div>

        {/* Right player */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
          opacity: rightPlayerOp, transform: `translateX(${rightPlayerX}px)`,
        }}>
          {rightImageSrc && (
            <div style={{
              width: 180, height: 180, borderRadius: "50%", overflow: "hidden",
              border: `4px solid ${rightColor}`,
            }}>
              <Img src={resolveAsset(rightImageSrc)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%" }} />
            </div>
          )}
          <div style={{
            fontFamily: font, fontSize: 46, fontWeight: 800, color: rightColor,
            textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "center",
          }}>
            {rightName}
          </div>
        </div>
      </div>

      {/* Stat bars */}
      <div style={{
        position: "absolute", top: 680, left: 60, right: 60, bottom: 100,
        display: "flex", flexDirection: "column", justifyContent: "space-evenly",
      }}>
        {comparisonStats.slice(0, 5).map((stat, i) => (
          <StatBar
            key={i}
            stat={stat}
            index={i}
            t={t}
            leftColor={leftColor}
            rightColor={rightColor}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};
