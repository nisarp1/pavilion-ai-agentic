import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import { anim, easeOutCubic } from './easing'

export function TickerHeadline({ tickerTag, tickerHeadline, bgColor = '#000', accent = '#FF2D2D' }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const bgOp = anim(t, 0, 1, 0, 0.4, easeOutCubic)
  const tagX = anim(t, -500, 0, 0.2, 0.7, easeOutCubic)
  const headX = anim(t, 1000, 0, 0.5, 1.0, easeOutCubic)

  return (
    <AbsoluteFill style={{ background: bgColor, opacity: bgOp, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 80px' }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ 
          background: accent, color: '#fff', padding: '12px 24px', 
          fontWeight: 'bold', fontSize: 36, display: 'inline-block', alignSelf: 'flex-start',
          transform: `translateX(${tagX}px)`,
          marginBottom: 10
        }}>
          {tickerTag || "BREAKING"}
        </div>
        <div style={{ 
          fontSize: 72, color: '#fff', fontWeight: 'bold', lineHeight: 1.2,
          transform: `translateX(${headX}px)`
        }}>
          {tickerHeadline}
        </div>
      </div>
    </AbsoluteFill>
  )
}
