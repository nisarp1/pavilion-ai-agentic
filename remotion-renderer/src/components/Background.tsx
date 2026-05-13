import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, IMAGE_HEIGHT, IMAGE_WIDTH } from "../lib/constants";
import { BackgroundElement } from "../lib/types";
import { calculateBlur } from "../lib/utils";

const EXTRA_SCALE = 0.2;
const MAX_BLUR_PX = 25;

const FALLBACK_GRADIENTS = [
  "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
  "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)",
  "linear-gradient(135deg, #1a0533 0%, #2d1b69 50%, #11001c 100%)",
  "linear-gradient(135deg, #000000 0%, #130f40 50%, #0c0032 100%)",
  "linear-gradient(135deg, #0d0d0d 0%, #1c1c1c 50%, #2d2d2d 100%)",
];

export const Background: React.FC<{ item: BackgroundElement; index: number }> = ({
  item,
  index,
}) => {
  const frame = useCurrentFrame();
  const localMs = (frame / FPS) * 1000;
  const { width, height } = useVideoConfig();

  const imageRatio = IMAGE_HEIGHT / IMAGE_WIDTH;
  const imgWidth = height;
  const imgHeight = imgWidth * imageRatio;

  let animScale = 1 + EXTRA_SCALE;
  const currentScaleAnim = item.animations?.find(
    (anim) =>
      anim.type === "scale" && anim.startMs <= localMs && anim.endMs >= localMs,
  );

  if (currentScaleAnim) {
    const progress =
      (localMs - currentScaleAnim.startMs) /
      (currentScaleAnim.endMs - currentScaleAnim.startMs);
    animScale =
      EXTRA_SCALE +
      progress * (currentScaleAnim.to - currentScaleAnim.from) +
      currentScaleAnim.from;
  }

  const top = -(imgHeight * animScale - height) / 2;
  const left = -(imgWidth * animScale - width) / 2;
  const blurFraction = calculateBlur({ item, localMs });
  const currentBlur = MAX_BLUR_PX * blurFraction;
  const filterStr = currentBlur > 0 ? `blur(${currentBlur}px)` : undefined;

  const hasImage = Boolean(item.imageUrl);
  const isRemoteUrl = hasImage && item.imageUrl.startsWith("http");

  if (!hasImage) {
    return (
      <AbsoluteFill
        style={{
          background: FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length],
          filter: filterStr,
          WebkitFilter: filterStr,
        }}
      />
    );
  }

  const src = isRemoteUrl ? item.imageUrl : staticFile(item.imageUrl);

  return (
    <AbsoluteFill>
      <Img
        src={src}
        style={{
          width: imgWidth * animScale,
          height: imgHeight * animScale,
          position: "absolute",
          top,
          left,
          objectFit: "cover",
          filter: filterStr,
          WebkitFilter: filterStr,
        }}
      />
    </AbsoluteFill>
  );
};
