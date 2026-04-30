export const easeOutCubic = (t) => { const u = t - 1; return u * u * u + 1 }
export const easeInCubic = (t) => t * t * t
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1, u = t - 1
  return 1 + c3 * u * u * u + c1 * u * u
}
export const anim = (t, from, to, start, end, ease = easeOutCubic) => {
  if (t <= start) return from
  if (t >= end) return to
  return from + (to - from) * ease((t - start) / (end - start))
}
export const hexA = (hex, a) => {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}
