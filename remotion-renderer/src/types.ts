// ── Shared data types ──────────────────────────────────────────────────────────

export interface StatItem {
  value: string;
  label: string;
}

// ── Modular scene plan (produced by the agent pipeline) ────────────────────────

export interface ScenePlanItem {
  scene_number: number;
  template_id: string;
  start_frame: number;
  duration_frames: number;
  /** All props required by this scene's template */
  props: Record<string, unknown>;
  description?: string;
}

// ── PavilionReel props ─────────────────────────────────────────────────────────
//
// Two modes:
//   1. Legacy (scenes omitted or empty): renders Scene1 → Scene2 hardcoded.
//   2. Modular (scenes provided): renders any sequence from the agent scene plan.
//
// Global brand props (bgColor, accent, brandName, logoSrc, audioSrc) are merged
// into every scene's props automatically by the modular renderer.

export interface PavilionReelProps {
  // ── Modular mode ─────────────────────────────────────────────────────────
  /** Agent-produced scene plan. When provided, drives the full render. */
  scenes?: ScenePlanItem[];

  // ── Legacy / global brand props ───────────────────────────────────────────
  bgColor: string;
  cardColor: string;
  cardAccent: string;
  accent: string;
  brandName: string;
  /** Optional ElevenLabs / TTS voiceover URL — plays over the full video */
  audioSrc?: string;
  logoSrc?: string;

  // ── Legacy scene-specific props (used when scenes[] is empty) ─────────────
  scene1Headline?: string;
  scene2Headline?: string;
  playerName?: string;
  /** Filename in public/ OR a full https:// URL */
  playerImage?: string;
  /** Filename in public/ OR a full https:// URL */
  heroSrc?: string;
  stats?: StatItem[];
  scene1HeadlineColor?: string;
  scene1HeadlineFontSize?: number;
  scene1HeadlineFont?: string;
  scene2HeadlineColor?: string;
  scene2HeadlineFontSize?: number;
  scene2HeadlineFont?: string;
}

export const PAVILION_REEL_DEFAULTS: PavilionReelProps = {
  scene1Headline: "മുഹമ്മദ് സലാ ഈ സീസണിൽ ലിവർപൂൾ വിടുകയാണ്...",
  scene2Headline: "ആ റൈറ്റ് വിങ്ങിൽ ആരെ കൊണ്ടുവരും?",
  playerName: "MO SALAH",
  playerImage: "player-cropped.png",
  heroSrc: "hero.png",
  stats: [
    { value: "12", label: "AT BATS" },
    { value: "24", label: "RBI" },
    { value: "20", label: "HITS" },
  ],
  bgColor: "#000000",
  cardColor: "#1f7a6e",
  cardAccent: "#e8b73b",
  accent: "#FF2D2D",
  brandName: "PAVILIONEND",
};
