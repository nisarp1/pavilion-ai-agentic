import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion'
import { anim, easeOutCubic } from './easing'

export function StatComparison({ leftName, rightName, comparisonStats, clips, sceneOffset = 0, bgColor = '#000' }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const op = anim(t, 0, 1, 0, 0.5, easeOutCubic)

  return (
    <AbsoluteFill style={{ background: bgColor, opacity: op, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 48, fontWeight: 'bold', marginBottom: 40 }}>{leftName} vs {rightName}</div>
      {(comparisonStats || []).map((stat, i) => (
        <div key={i} style={{ display: 'flex', width: '80%', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ width: '40%', textAlign: 'right' }}>{stat.leftValue}</div>
          <div style={{ width: '20%', textAlign: 'center' }}>{stat.label}</div>
          <div style={{ width: '40%', textAlign: 'left' }}>{stat.rightValue}</div>
        </div>
      ))}
    </AbsoluteFill>
  )
}
