import React, { useState } from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS } from "../lib/constants";
import { BackgroundElement } from "../lib/types";
import { calculateBlur } from "../lib/utils";

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
  const [imgFailed, setImgFailed] = useState(false);
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Match preview exactly: baseZoom * interpolate(from → to)
  const baseZoom = item.zoom ?? 1;
  const animation = item.animations?.find((a) => a.type === "scale");
  let scale = baseZoom;
  if (animation && durationInFrames > 1) {
    const progress = Math.min(1, frame / (durationInFrames - 1));
    scale = baseZoom * interpolate(
      progress,
      [0, 1],
      [animation.from ?? 1, animation.to ?? 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
  }

  const panX       = item.panX       ?? 50;
  const panY       = item.panY       ?? 50;
  const cropTop    = item.cropTop    ?? 0;
  const cropRight  = item.cropRight  ?? 0;
  const cropBottom = item.cropBottom ?? 0;
  const cropLeft   = item.cropLeft   ?? 0;
  const objectFit  = (item.objectFit as any) ?? "cover";
  const hasCrop    = cropTop > 0 || cropRight > 0 || cropBottom > 0 || cropLeft > 0;

  const localMs = (frame / FPS) * 1000;
  const blurFraction = calculateBlur({ item, localMs });
  const currentBlur = MAX_BLUR_PX * blurFraction;
  const filterStr = currentBlur > 0 ? `blur(${currentBlur}px)` : undefined;

  const gradient = FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length];

  const hasImage = Boolean(item.imageUrl) && !imgFailed;
  const isDataUri  = hasImage && item.imageUrl.startsWith("data:");
  const isHttpUrl  = hasImage && item.imageUrl.startsWith("http");

  const imgStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit,
    objectPosition: `${panX}% ${panY}%`,
    transform: `scale(${scale})`,
    transformOrigin: "center center",
    filter: filterStr,
    WebkitFilter: filterStr,
    ...(hasCrop && {
      clipPath: `inset(${cropTop}% ${cropRight}% ${cropBottom}% ${cropLeft}%)`,
    }),
  };

  return (
    <AbsoluteFill style={{ background: gradient }}>
      {hasImage && isDataUri ? (
        // Native <img> for data URIs — Remotion's <Img> routes them through
        // the static bundle server which URL-encodes the data: prefix and 404s.
        <img src={item.imageUrl} style={imgStyle} />
      ) : hasImage ? (
        <Img
          src={isHttpUrl ? item.imageUrl : staticFile(item.imageUrl)}
          style={imgStyle}
          onError={() => setImgFailed(true)}
        />
      ) : null}
    </AbsoluteFill>
  );
};
