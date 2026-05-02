export const easeOutCubic = (t: number): number => {
  const u = t - 1;
  return u * u * u + 1;
};

export const easeInCubic = (t: number): number => t * t * t;

export const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
};

export const anim = (
  t: number,
  from: number,
  to: number,
  start: number,
  end: number,
  ease: (t: number) => number = easeOutCubic,
): number => {
  if (t <= start) return from;
  if (t >= end) return to;
  const local = (t - start) / (end - start);
  return from + (to - from) * ease(local);
};
