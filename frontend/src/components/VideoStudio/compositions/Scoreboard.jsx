import { AbsoluteFill, Img, Sequence, useCurrentFrame, useVideoConfig } from 'remotion'
import { anim, easeInCubic, easeOutCubic, easeOutBack } from './easing'
import { DEFAULT_CLIPS } from '../../../store/slices/videoStudioSlice'

const FONT_STACK = {
  'Anek Malayalam': '"Anek Malayalam", "Noto Sans Malayalam", system-ui, sans-serif',
  'Manrope': '"Manrope", system-ui, sans-serif',
}

function BgLayer({ heroSrc, bgColor }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const bgOp = anim(t, 0, 1, 0, 0.6, easeOutCubic)
  const heroUrl = (heroSrc?.startsWith('http') || heroSrc?.startsWith('/')) ? heroSrc : null
  
  return (
    <AbsoluteFill style={{ opacity: bgOp, background: bgColor }}>
      {heroUrl && (
        <Img src={heroUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(8px) brightness(0.4)' }} />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), rgba(0,0,0,0.4))' }} />
    </AbsoluteFill>
  )
}

function TeamColumn({ name, logoSrc, score, align, t }) {
  const colOp = anim(t, 0, 1, 0.4, 0.8, easeOutCubic)
  const colY = (1 - colOp) * 20
  
  const scoreOp = anim(t, 0, 1, 1.0, 1.4, easeOutBack)
  const scoreScale = 0.8 + 0.2 * anim(t, 0, 1, 1.0, 1.4, easeOutBack)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: colOp, transform: `translateY(${colY}px)`, flex: 1 }}>
      <div style={{ width: 220, height: 220, background: 'rgba(255,255,255,0.1)', borderRadius: 24, padding: 20, display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 30 }}>
        {logoSrc ? (
          <Img src={logoSrc} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', borderRadius: 12, background: 'rgba(255,255,255,0.2)' }} />
        )}
      </div>
      <div style={{ fontFamily: FONT_STACK['Manrope'], fontSize: 42, fontWeight: 800, color: '#fff', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {name || "TEAM"}
      </div>
      <div style={{ fontFamily: FONT_STACK['Manrope'], fontSize: 140, fontWeight: 800, color: '#fff', marginTop: 40, opacity: scoreOp, transform: `scale(${scoreScale})`, fontVariantNumeric: 'tabular-nums' }}>
        {score || "0"}
      </div>
    </div>
  )
}

function ScoreCardLayer({ team1Name, team2Name, team1Score, team2Score, team1LogoSrc, team2LogoSrc, cardColor, cardAccent }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps

  return (
    <AbsoluteFill style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
      <div style={{ width: '85%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 100 }}>
        <TeamColumn name={team1Name} logoSrc={team1LogoSrc} score={team1Score} align="left" t={t} />
        
        {/* Center Divider */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: anim(t, 0, 1, 0.8, 1.2, easeOutCubic), margin: '0 40px' }}>
          <div style={{ fontSize: 60, fontWeight: 800, color: cardAccent, fontFamily: FONT_STACK['Manrope'] }}>VS</div>
        </div>
        
        <TeamColumn name={team2Name} logoSrc={team2LogoSrc} score={team2Score} align="right" t={t} />
      </div>
    </AbsoluteFill>
  )
}

function StatusLayer({ matchStatus, matchTime, accent }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  
  const op = anim(t, 0, 1, 1.4, 1.8, easeOutCubic)
  const y = (1 - op) * 20
  
  // Pulse effect
  const pulse = 1 + 0.05 * Math.sin(t * Math.PI * 2)

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: op, transform: `translateY(${y}px)` }}>
      <div style={{ position: 'absolute', top: 280, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{ background: accent, padding: '12px 32px', borderRadius: 100, fontSize: 32, fontWeight: 800, color: '#fff', fontFamily: FONT_STACK['Manrope'], letterSpacing: '0.1em', textTransform: 'uppercase', transform: `scale(${matchStatus === 'LIVE' ? pulse : 1})` }}>
          {matchStatus || "FULL TIME"}
        </div>
      </div>
      {matchTime && (
        <div style={{ position: 'absolute', bottom: 200, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
          <div style={{ fontSize: 48, fontWeight: 700, color: 'rgba(255,255,255,0.8)', fontFamily: FONT_STACK['Manrope'] }}>
            {matchTime}
          </div>
        </div>
      )}
    </AbsoluteFill>
  )
}

function clipTransform(clip) {
  const ox = clip?.offsetX ?? 0
  const oy = clip?.offsetY ?? 0
  const sx = clip?.scaleX ?? 1
  const sy = clip?.scaleY ?? 1
  return `translate(${ox}px, ${oy}px) scale(${sx}, ${sy})`
}

export function Scoreboard({ 
  team1Name, team2Name, team1Score, team2Score, 
  team1LogoSrc, team2LogoSrc, matchStatus, matchTime,
  heroSrc, bgColor, cardColor, cardAccent, accent, 
  clips, sceneOffset = 0 
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const sceneOp = 1 // or fade out at end if needed
  
  const resolvedClips = clips || DEFAULT_CLIPS
  const bgCl = resolvedClips.find(c => c.templateClipId === 'scoreboard-bg' || c.id === 'scoreboard-bg')
  const cardCl = resolvedClips.find(c => c.templateClipId === 'scoreboard-card' || c.id === 'scoreboard-card')
  const statusCl = resolvedClips.find(c => c.templateClipId === 'scoreboard-status' || c.id === 'scoreboard-status')

  return (
    <AbsoluteFill style={{ background: bgColor, opacity: sceneOp, overflow: 'hidden' }}>
      {bgCl && (
        <Sequence from={bgCl.globalStartFrame - sceneOffset} durationInFrames={bgCl.durationFrames}>
          <AbsoluteFill style={{ transform: clipTransform(bgCl) }}>
            <BgLayer heroSrc={heroSrc} bgColor={bgColor} />
          </AbsoluteFill>
        </Sequence>
      )}
      
      {cardCl && (
        <Sequence from={cardCl.globalStartFrame - sceneOffset} durationInFrames={cardCl.durationFrames}>
          <AbsoluteFill style={{ transform: clipTransform(cardCl) }}>
            <ScoreCardLayer 
              team1Name={team1Name} team2Name={team2Name} 
              team1Score={team1Score} team2Score={team2Score}
              team1LogoSrc={team1LogoSrc} team2LogoSrc={team2LogoSrc}
              cardColor={cardColor} cardAccent={cardAccent}
            />
          </AbsoluteFill>
        </Sequence>
      )}

      {statusCl && (
        <Sequence from={statusCl.globalStartFrame - sceneOffset} durationInFrames={statusCl.durationFrames}>
          <AbsoluteFill style={{ transform: clipTransform(statusCl) }}>
            <StatusLayer matchStatus={matchStatus} matchTime={matchTime} accent={accent} />
          </AbsoluteFill>
        </Sequence>
      )}
    </AbsoluteFill>
  )
}
