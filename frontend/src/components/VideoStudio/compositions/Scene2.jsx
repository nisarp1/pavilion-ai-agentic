import { AbsoluteFill, Img, Sequence, Video, useCurrentFrame, useVideoConfig } from 'remotion'
import { anim, easeOutBack, easeOutCubic, hexA } from './easing'
import { DEFAULT_CLIPS } from '../../../store/slices/videoStudioSlice'

const SCENE_DUR = 8
const HEADLINE_RESERVE = 360
const CARD_TOP = 300

const FONT_STACK = {
  'Anek Malayalam': '"Anek Malayalam", "Noto Sans Malayalam", system-ui, sans-serif',
  'Manrope': '"Manrope", system-ui, sans-serif',
  'Arial': 'Arial, sans-serif',
  'Georgia': 'Georgia, serif',
}

function StatsGrid({ stats, t }) {
  const rows = []
  for (let i = 0; i < stats.length; i += 3) rows.push(stats.slice(i, i + 3))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '28px 0 32px' }}>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-start', gap: 12 }}>
          {row.map((stat, ci) => {
            const idx = ri * 3 + ci
            const startT = 1.4 + idx * 0.12
            const op = anim(t, 0, 1, startT, startT + 0.4, easeOutBack)
            const statY = (1 - op) * 12
            return (
              <div key={ci} style={{ flex: '1 1 0', minWidth: 0, textAlign: 'center', opacity: op, transform: `translateY(${statY}px)`, fontFamily: '"Manrope", system-ui, sans-serif' }}>
                <div style={{ fontSize: 88, fontWeight: 800, lineHeight: 1, color: '#fff', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{stat.value}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'rgba(255,255,255,0.95)', marginTop: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{stat.label}</div>
              </div>
            )
          })}
          {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, k) => <div key={`p${k}`} style={{ flex: '1 1 0' }} />)}
        </div>
      ))}
    </div>
  )
}

function BgLayer({ heroSrc }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const bgOp = anim(t, 0, 1, 0, 0.6, easeOutCubic)
  const bgScale = 1.06 + 0.06 * Math.min(1, t / SCENE_DUR)
  const heroUrl = (heroSrc?.startsWith('http') || heroSrc?.startsWith('/')) ? heroSrc : null
  return (
    <AbsoluteFill style={{ opacity: bgOp }}>
      {heroUrl && (
        <Img src={heroUrl} style={{ position: 'absolute', top: '50%', left: '50%', width: '120%', height: '120%', objectFit: 'cover', objectPosition: 'center 20%', transform: `translate(-50%, -50%) scale(${bgScale})` }} />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.35) 30%, rgba(0,0,0,0.85) 100%)' }} />
    </AbsoluteFill>
  )
}

function PlayerCardLayer({ playerName, playerImage, stats, cardColor, cardAccent }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const cardOp = anim(t, 0, 1, 0.3, 1.0, easeOutCubic)
  const cardY = (1 - cardOp) * 30
  const nameOp = anim(t, 0, 1, 0.55, 1.1, easeOutBack)
  const nameScale = 0.94 + 0.06 * anim(t, 0, 1, 0.55, 1.1, easeOutBack)
  const imgOp = anim(t, 0, 1, 0.8, 1.4, easeOutCubic)
  const imgScale = 1.04 + 0.04 * Math.min(1, t / SCENE_DUR)
  const playerUrl = (playerImage?.startsWith('http') || playerImage?.startsWith('/')) ? playerImage : null
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 80, right: 80, top: CARD_TOP, bottom: HEADLINE_RESERVE, opacity: cardOp, transform: `translateY(${cardY}px)`, zIndex: 4, display: 'flex', flexDirection: 'column', pointerEvents: 'none' }}>
        <div style={{ background: hexA(cardColor, 0.92), borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: '28px 24px', textAlign: 'center', opacity: nameOp, transform: `scale(${nameScale})`, transformOrigin: 'bottom center', fontFamily: '"Manrope", system-ui, sans-serif', fontSize: 48, fontWeight: 800, lineHeight: 1, letterSpacing: '0.06em', color: '#fff', flexShrink: 0 }}>
          {playerName}
        </div>
        <div style={{ flex: 1, minHeight: 0, background: hexA(cardColor, 0.72), backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', borderBottomLeftRadius: 14, borderBottomRightRadius: 14, padding: '28px 24px 24px', display: 'flex', flexDirection: 'column', gap: 18, boxSizing: 'border-box' }}>
          <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', opacity: imgOp, background: '#0a0a0a' }}>
            {playerUrl && (
              <Img src={playerUrl} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 25%', transform: `scale(${imgScale})`, transformOrigin: 'center 30%' }} />
            )}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 10, background: cardAccent }} />
          </div>
          <StatsGrid stats={stats} t={t} />
        </div>
      </div>
    </AbsoluteFill>
  )
}

function HeadlineLayer({ headline, stats, textColor = '#fff', fontSize = 64, fontFamily = 'Anek Malayalam' }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const words = headline.split(' ')
  const headlineStart = Math.min(stats?.length || 0, 6) * 0.1 + 0.3
  const perWord = 0.18
  const resolvedFont = FONT_STACK[fontFamily] || fontFamily
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 80, right: 80, bottom: 100, height: HEADLINE_RESERVE - 100, zIndex: 4, display: 'flex', alignItems: 'flex-end', fontFamily: resolvedFont, fontWeight: 700, fontSize, lineHeight: 1.25, letterSpacing: '-0.005em', color: textColor }}>
        <div>
          {words.map((word, i) => {
            const wordStart = headlineStart + i * perWord
            const op = anim(t, 0, 1, wordStart, wordStart + 0.4, easeOutCubic)
            const wordY = (1 - op) * 12
            return <span key={i} style={{ display: 'inline-block', opacity: op, transform: `translateY(${wordY}px)`, marginRight: '0.25em' }}>{word}</span>
          })}
        </div>
      </div>
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

function ExtraImageLayer({ src }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const op = anim(t, 0, 1, 0, 0.5, easeOutCubic)
  const imgSrc = (src?.startsWith('http') || src?.startsWith('/')) ? src : null
  return (
    <AbsoluteFill style={{ opacity: op }}>
      {imgSrc && <Img src={imgSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
    </AbsoluteFill>
  )
}

function ExtraVideoLayer({ src }) {
  const videoSrc = (src?.startsWith('http') || src?.startsWith('/')) ? src : null
  return (
    <AbsoluteFill>
      {videoSrc && <Video src={videoSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
    </AbsoluteFill>
  )
}

function ExtraTextLayer({ text, textColor = '#fff', fontSize = 72, fontFamily = 'Anek Malayalam' }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const op = anim(t, 0, 1, 0, 0.5, easeOutCubic)
  const y = (1 - op) * 20
  const resolvedFont = FONT_STACK[fontFamily] || fontFamily
  return (
    <AbsoluteFill style={{ opacity: op, transform: `translateY(${y}px)`, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{ fontFamily: resolvedFont, fontSize, fontWeight: 700, color: textColor, textAlign: 'center', padding: '0 80px' }}>{text}</div>
    </AbsoluteFill>
  )
}

export function Scene2({ scene2Headline: headline, playerName, playerImage, heroSrc, stats, bgColor, cardColor, cardAccent, scene2HeadlineColor, scene2HeadlineFontSize, scene2HeadlineFont, clips, sceneOffset = 180 }) {
  const resolvedClips = clips || DEFAULT_CLIPS.filter(c => c.scene === 2)
  // Match by templateClipId (dynamic) or id (legacy default clips)
  const bgCl       = resolvedClips.find(c => c.templateClipId === 'scene2-bg'       || c.id === 'scene2-bg')
  const cardCl     = resolvedClips.find(c => c.templateClipId === 'scene2-card'     || c.id === 'scene2-card')
  const headlineCl = resolvedClips.find(c => c.templateClipId === 'scene2-headline' || c.id === 'scene2-headline')

  return (
    <AbsoluteFill style={{ background: bgColor, overflow: 'hidden' }}>
      {bgCl && (
        <Sequence from={bgCl.globalStartFrame - sceneOffset} durationInFrames={bgCl.durationFrames}>
          <AbsoluteFill style={{ transform: clipTransform(bgCl), transformOrigin: 'center center' }}>
            <BgLayer heroSrc={heroSrc} />
          </AbsoluteFill>
        </Sequence>
      )}
      {cardCl && (
        <Sequence from={cardCl.globalStartFrame - sceneOffset} durationInFrames={cardCl.durationFrames}>
          <AbsoluteFill style={{ transform: clipTransform(cardCl), transformOrigin: 'center center' }}>
            <PlayerCardLayer playerName={playerName} playerImage={playerImage} stats={stats} cardColor={cardColor} cardAccent={cardAccent} />
          </AbsoluteFill>
        </Sequence>
      )}
      {headlineCl && (
        <Sequence from={headlineCl.globalStartFrame - sceneOffset} durationInFrames={headlineCl.durationFrames}>
          <AbsoluteFill style={{ transform: clipTransform(headlineCl), transformOrigin: 'center center' }}>
            <HeadlineLayer
              headline={headline}
              stats={stats}
              textColor={scene2HeadlineColor}
              fontSize={scene2HeadlineFontSize}
              fontFamily={scene2HeadlineFont}
            />
          </AbsoluteFill>
        </Sequence>
      )}
      {resolvedClips
        .filter(c => c.scene === 2 && (c.type === 'image' || c.type === 'text' || c.type === 'video'))
        .map(clip => (
          <Sequence key={clip.id} from={clip.globalStartFrame - sceneOffset} durationInFrames={clip.durationFrames}>
            <AbsoluteFill style={{ transform: clipTransform(clip), transformOrigin: 'center center', opacity: clip.opacity ?? 1 }}>
              {clip.type === 'image' ? <ExtraImageLayer src={clip.src} />
                : clip.type === 'video' ? <ExtraVideoLayer src={clip.src} />
                : <ExtraTextLayer text={clip.text} textColor={clip.textColor} fontSize={clip.fontSize} fontFamily={clip.fontFamily} />
              }
            </AbsoluteFill>
          </Sequence>
        ))
      }
    </AbsoluteFill>
  )
}
