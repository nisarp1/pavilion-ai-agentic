import React, { ComponentType } from "react";
import { Composition } from "remotion";
import { PavilionReel, TOTAL_FRAMES } from "./PavilionReel";
import { PAVILION_REEL_DEFAULTS } from "./types";
import "./fonts";

export const Root: React.FC = () => {
  return (
    <Composition
      id="PavilionReel"
      component={PavilionReel as ComponentType<Record<string, unknown>>}
      durationInFrames={TOTAL_FRAMES}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={PAVILION_REEL_DEFAULTS as Record<string, unknown>}
    />
  );
};
