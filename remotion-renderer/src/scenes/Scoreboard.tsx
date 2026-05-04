import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from "remotion";
import { TopChrome } from "../components/TopChrome";
import { anim, easeInCubic, easeOutBack, easeOutCubic } from "../easing";
import { MANROPE } from "../fonts";
import { hexA, resolveAsset } from "../utils";

export interface ScoreboardProps {
  team1Name: string;
  team2Name: string;
  team1Score: string;
  team2Score: string;
  matchStatus: string;       // "LIVE" | "FT" | "HT" | "45'" etc.
  team1LogoSrc?: string;
  team2LogoSrc?: string;
  matchTime?: string;
  matchEvent?: string;
  bgColor?: string;
  accent?: string;
  cardColor?: string;
  heroSrc?: string;
  brandName?: string;
  logoSrc?: string;
}

const SCENE_DUR = 5;

export const Scoreboard: React.FC<ScoreboardProps> = ({
  team1Name,
  team2Name,
  team1Score,
  team2Score,
  matchStatus,
  team1LogoSrc,
  team2LogoSrc,
  matchTime,
  matchEvent,
  bgColor = "#0a0a0a",
  accent = "#e8b73b",
  cardColor = "#1a1a2e",
  heroSrc,
  brandName,
  logoSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const sceneOp = anim(t, 1, 0, SCENE_DUR - 0.4, SCENE_DUR, easeInCubic);
  const bgOp = anim(t, 0, 1, 0, 0.8, easeOutCubic);
  const chromeOp = anim(t, 0, 1, 0.1, 0.7, easeOutCubic);
  const chromeY = (1 - chromeOp) * -12;

  // Card slides up
  const cardOp = anim(t, 0, 1, 0.2, 0.9, easeOutCubic);
  const cardY = (1 - cardOp) * 40;

  // Teams slide in from sides
  const leftOp = anim(t, 0, 1, 0.4, 1.0, easeOutBack);
  const leftX = (1 - leftOp) * -60;
  const rightOp = anim(t, 0, 1, 0.4, 1.0, easeOutBack);
  const rightX = (1 - rightOp) * 60;

  // Score pops in
  const scoreOp = anim(t, 0, 1, 0.6, 1.2, easeOutBack);
  const scoreScale = 0.7 + 0.3 * anim(t, 0, 1, 0.6, 1.2, easeOutBack);

  // Status badge pulses when LIVE
  const isLive = matchStatus.toUpperCase() === "LIVE";
  const pulse = isLive ? 0.85 + 0.15 * Math.sin(t * Math.PI * 2) : 1;

  const font = `${MANROPE}, system-ui, sans-serif`;

  return (
    <AbsoluteFill style={{ background: bgColor, overflow: "hidden", opacity: sceneOp }}>
      {/* Hero background (blurred) */}
      {heroSrc && (
        <div style={{ position: "absolute", inset: 0, opacity: bgOp * 0.35 }}>
          <Img
            src={resolveAsset(heroSrc)}
            style={{
              position: "absolute", top: "50%", left: "50%",
              width: "130%", height: "130%", objectFit: "cover",
              transform: "translate(-50%, -50%)",
              filter: "blur(18px)",
            }}
          />
        </div>
      )}

      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.7))" }} />

      <TopChrome brandName={brandName} accent={accent} opacity={chromeOp} ty={chromeY} />

      {/* Main scoreboard card */}
      <div style={{
        position: "absolute", left: 60, right: 60, top: "30%", bottom: "28%",
        opacity: cardOp, transform: `translateY(${cardY}px)`,
        display: "flex", flexDirection: "column", gap: 0,
      }}>
        {/* Match event label */}
        {matchEvent && (
          <div style={{
            textAlign: "center", fontFamily: font,
            fontSize: 32, fontWeight: 600, letterSpacing: "0.1em",
            color: "rgba(255,255,255,0.6)", textTransform: "uppercase",
            marginBottom: 24,
          }}>
            {matchEvent}
          </div>
        )}

        {/* Status badge */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
          <div style={{
            background: isLive ? accent : "rgba(255,255,255,0.15)",
            color: isLive ? "#000" : "#fff",
            fontFamily: font, fontSize: 30, fontWeight: 800,
            letterSpacing: "0.15em", paddingInline: 32, paddingBlock: 10,
            borderRadius: 8, textTransform: "uppercase",
            transform: `scale(${pulse})`,
          }}>
            {matchStatus}{matchTime ? `  ${matchTime}` : ""}
          </div>
        </div>

        {/* Scores row */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: hexA(cardColor, 0.9), borderRadius: 20, overflow: "hidden",
          border: `2px solid rgba(255,255,255,0.08)`,
        }}>
          {/* Team 1 */}
          <div style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
            padding: "40px 20px",
            opacity: leftOp, transform: `translateX(${leftX}px)`,
          }}>
            {team1LogoSrc && (
              <Img
                src={resolveAsset(team1LogoSrc)}
                style={{ width: 140, height: 140, objectFit: "contain", marginBottom: 20 }}
              />
            )}
            <div style={{
              fontFamily: font, fontSize: 42, fontWeight: 800,
              color: "#fff", letterSpacing: "0.04em", textTransform: "uppercase",
              textAlign: "center",
            }}>
              {team1Name}
            </div>
          </div>

          {/* Scores */}
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
            opacity: scoreOp, transform: `scale(${scoreScale})`,
            minWidth: 240,
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 16,
              fontFamily: font, fontWeight: 900, fontSize: 160,
              color: "#fff", lineHeight: 1, letterSpacing: "-0.04em",
              fontVariantNumeric: "tabular-nums",
            }}>
              <span>{team1Score}</span>
              <span style={{ color: accent, fontSize: 80, opacity: 0.8 }}>–</span>
              <span>{team2Score}</span>
            </div>
            {/* Gold accent bar */}
            <div style={{ width: "100%", height: 4, background: accent, marginTop: 8, borderRadius: 2 }} />
          </div>

          {/* Team 2 */}
          <div style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
            padding: "40px 20px",
            opacity: rightOp, transform: `translateX(${rightX}px)`,
          }}>
            {team2LogoSrc && (
              <Img
                src={resolveAsset(team2LogoSrc)}
                style={{ width: 140, height: 140, objectFit: "contain", marginBottom: 20 }}
              />
            )}
            <div style={{
              fontFamily: font, fontSize: 42, fontWeight: 800,
              color: "#fff", letterSpacing: "0.04em", textTransform: "uppercase",
              textAlign: "center",
            }}>
              {team2Name}
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
