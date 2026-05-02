import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from "remotion";
import { TopChrome } from "../components/TopChrome";
import { anim, easeInCubic, easeOutCubic } from "../easing";
import { ANEK_MALAYALAM } from "../fonts";
import { PavilionReelProps } from "../types";
import { resolveAsset } from "../utils";

const SCENE_DUR = 6;

export const Scene1: React.FC<PavilionReelProps> = ({
  scene1Headline: headline,
  heroSrc,
  brandName,
  bgColor,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const heroOpacity = anim(t, 0, 1, 0.4, 1.4, easeOutCubic);
  const heroScale = 1.04 + 0.1 * Math.min(1, t / SCENE_DUR);
  const heroShiftY = -2 + 4 * Math.min(1, t / SCENE_DUR);
  const chromeOp = anim(t, 0, 1, 0.05, 0.6, easeOutCubic);
  const chromeY = (1 - chromeOp) * -10;
  const sceneOp = anim(t, 1, 0, SCENE_DUR - 0.5, SCENE_DUR, easeInCubic);

  const words = headline.split(" ");
  const headlineStart = 1.2;
  const perWord = 0.22;

  return (
    <AbsoluteFill style={{ background: bgColor, opacity: sceneOp, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, opacity: heroOpacity }}>
        <Img
          src={resolveAsset(heroSrc)}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "120%",
            height: "120%",
            objectFit: "cover",
            objectPosition: "center 20%",
            transform: `translate(-50%, calc(-50% + ${heroShiftY}px)) scale(${heroScale})`,
          }}
        />
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0, height: "55%",
          background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.7) 35%, rgba(0,0,0,0) 100%)",
        }} />
        <div style={{
          position: "absolute", left: 0, right: 0, top: 0, height: "22%",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0))",
        }} />
      </div>

      <TopChrome brandName={brandName} accent={accent} opacity={chromeOp} ty={chromeY} />

      <div style={{
        position: "absolute", left: 70, right: 70, bottom: 160, zIndex: 4,
        fontFamily: `${ANEK_MALAYALAM}, "Noto Sans Malayalam", system-ui, sans-serif`,
        fontWeight: 700, fontSize: 78, lineHeight: 1.22, letterSpacing: "-0.005em", color: "#fff",
      }}>
        {words.map((word, i) => {
          const wordStart = headlineStart + i * perWord;
          const op = anim(t, 0, 1, wordStart, wordStart + 0.45, easeOutCubic);
          const wordY = (1 - op) * 14;
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
    </AbsoluteFill>
  );
};
