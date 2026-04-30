import { Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'

const MANROPE = 'Manrope'

export function TopChrome({ brandName = 'PAVILIONEND', accent = '#FF2D2D', opacity = 1, ty = 0 }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps

  const dotPhase = (Math.sin((t * Math.PI * 2) / 1.4) + 1) / 2
  const dotScale = 0.9 + dotPhase * 0.35
  const dotGlow = 0.35 + dotPhase * 0.5

  // logo.png: use staticFile so Remotion Player serves it from public/
  // Falls back to a coloured square if the file isn't available in the preview.
  const logoSrc = (() => {
    try { return staticFile('logo.png') } catch { return null }
  })()

  return (
    <div style={{
      position: 'absolute', top: 60, left: 60, right: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      zIndex: 5, opacity, transform: `translateY(${ty}px)`,
    }}>
      <div style={{
        width: 168, height: 168, background: '#000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '2px solid rgba(255,255,255,0.06)', padding: 18, boxSizing: 'border-box',
      }}>
        {logoSrc
          ? <Img src={logoSrc} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <div style={{ width: '100%', height: '100%', background: '#1f7a6e', borderRadius: 4 }} />
        }
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <span style={{ fontFamily: `${MANROPE}, system-ui, sans-serif`, fontSize: 44, fontWeight: 700, letterSpacing: '0.04em', color: '#fff' }}>
          {brandName}
        </span>
        <span style={{
          display: 'block', width: 28, height: 28, borderRadius: '50%', background: accent,
          transform: `scale(${dotScale})`, boxShadow: `0 0 ${24 * dotGlow}px ${accent}`,
        }} />
      </div>
    </div>
  )
}
