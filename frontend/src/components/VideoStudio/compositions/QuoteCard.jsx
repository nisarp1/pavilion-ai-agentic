import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import { anim, easeOutCubic } from './easing'

export function QuoteCard({ quoteText, speakerName, bgColor = '#000', accent = '#FF2D2D' }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const op = anim(t, 0, 1, 0, 0.5, easeOutCubic)

  return (
    <AbsoluteFill style={{ background: bgColor, opacity: op, padding: 80, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ fontSize: 120, color: accent, fontWeight: 'bold', lineHeight: 0.5, marginBottom: 20 }}>"</div>
      <div style={{ fontSize: 64, color: '#fff', fontWeight: 'bold', lineHeight: 1.3 }}>{quoteText}</div>
      <div style={{ fontSize: 40, color: '#aaa', marginTop: 40, borderTop: `2px solid ${accent}`, paddingTop: 20 }}>— {speakerName}</div>
    </AbsoluteFill>
  )
}
