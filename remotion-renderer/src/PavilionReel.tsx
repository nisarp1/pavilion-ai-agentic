import React from "react";
import { AbsoluteFill, Audio, Sequence } from "remotion";
import { Scene1 } from "./scenes/Scene1";
import { Scene2 } from "./scenes/Scene2";
import { PavilionReelProps } from "./types";

export const SCENE1_FRAMES = 180; // 6 s × 30 fps
export const SCENE2_FRAMES = 240; // 8 s × 30 fps
export const TOTAL_FRAMES = SCENE1_FRAMES + SCENE2_FRAMES; // 420 (14 s)

export const PavilionReel: React.FC<PavilionReelProps> = (props) => {
  return (
    <AbsoluteFill style={{ background: props.bgColor }}>
      {/* Optional ElevenLabs / TTS voiceover plays across the entire video */}
      {props.audioSrc && (
        <Audio src={props.audioSrc} />
      )}

      <Sequence from={0} durationInFrames={SCENE1_FRAMES}>
        <Scene1 {...props} />
      </Sequence>
      <Sequence from={SCENE1_FRAMES} durationInFrames={SCENE2_FRAMES}>
        <Scene2 {...props} />
      </Sequence>
    </AbsoluteFill>
  );
};
