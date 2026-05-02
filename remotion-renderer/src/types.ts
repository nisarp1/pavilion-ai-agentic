export interface StatItem {
  value: string;
  label: string;
}

export interface PavilionReelProps {
  scene1Headline: string;
  scene2Headline: string;
  playerName: string;
  /** Filename in public/ OR a full https:// URL */
  playerImage: string;
  /** Filename in public/ OR a full https:// URL */
  heroSrc: string;
  stats: StatItem[];
  bgColor: string;
  cardColor: string;
  cardAccent: string;
  accent: string;
  brandName: string;
  /** Optional ElevenLabs / TTS voiceover URL — played over the full video */
  audioSrc?: string;
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
