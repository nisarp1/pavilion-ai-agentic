import { z } from "zod";

const AnimationSchema = z.object({
  type: z.string(),
  from: z.number().optional(),
  to: z.number().optional(),
});

export const BackgroundElementSchema = z.object({
  imageUrl: z.string().optional(),
  animations: z.array(AnimationSchema).optional(),
  panX: z.number().optional(),
  panY: z.number().optional(),
  cropTop: z.number().optional(),
  cropRight: z.number().optional(),
  cropBottom: z.number().optional(),
  cropLeft: z.number().optional(),
  objectFit: z.string().optional(),
  baseZoom: z.number().optional(),
  transitionDurationMs: z.number().optional(),
  startMs: z.number(),
  endMs: z.number(),
});
export type BackgroundElement = z.infer<typeof BackgroundElementSchema>;

const AudioElementSchema = z.object({
  audioUrl: z.string(),
  startMs: z.number(),
  endMs: z.number(),
});

const SceneElementSchema = z.object({
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
}).passthrough();

export const TimelineSchema = z.object({
  wordCaptions: z.array(z.any()).optional().default([]),
  audio: z.array(AudioElementSchema).optional().default([]),
  backgrounds: z.array(BackgroundElementSchema).optional().default([]),
  scenes: z.array(SceneElementSchema).optional().default([]),
}).passthrough();

export type Timeline = z.infer<typeof TimelineSchema>;
