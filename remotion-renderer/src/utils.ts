export const hexA = (hex: string, a: number): string => {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

/** Resolve an asset: full URLs pass through; short names become staticFile() paths. */
export const resolveAsset = (src: string): string => {
  if (src.startsWith("http://") || src.startsWith("https://")) return src;
  const { staticFile } = require("remotion");
  return staticFile(src);
};
