import { FPS, INTRO_DURATION } from "./constants";
import type { BackgroundElement } from "./types";

export function calculateFrameTiming(
  startMs: number,
  endMs: number,
  options: { addIntroOffset?: boolean } = {}
): { startFrame: number; duration: number } {
  const offset = options.addIntroOffset ? INTRO_DURATION : 0;
  const startFrame = Math.floor((startMs / 1000) * FPS) + offset;
  const endFrame   = Math.ceil((endMs   / 1000) * FPS) + offset;
  return {
    startFrame,
    duration: Math.max(1, endFrame - startFrame),
  };
}

export function calculateBlur({
  item,
  localMs,
}: {
  item: BackgroundElement;
  localMs: number;
}): number {
  const transitionMs = item.transitionDurationMs ?? 400;
  const durationMs   = item.endMs - item.startMs;
  if (durationMs <= 0 || transitionMs <= 0) return 0;
  if (localMs < transitionMs)
    return 1 - Math.min(1, localMs / transitionMs);
  if (localMs > durationMs - transitionMs)
    return Math.min(1, (localMs - (durationMs - transitionMs)) / transitionMs);
  return 0;
}
