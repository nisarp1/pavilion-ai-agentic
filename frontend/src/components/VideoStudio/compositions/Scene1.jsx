import { AbsoluteFill, Img, Sequence, Video, useCurrentFrame, useVideoConfig } from 'remotion'
import { anim, easeInCubic, easeOutCubic } from './easing'
import { DEFAULT_CLIPS } from '../../../store/slices/videoStudioSlice'

const SCENE_DUR = 6

const FONT_STACK = {
  'Anek Malayalam': '"Anek Malayalam", "Noto Sans Malayalam", system-ui, sans-serif',
  'Manrope': '"Manrope", system-ui, sans-serif',
  'Arial': 'Arial, sans-serif',
  'Georgia': 'Georgia, serif',
}

function HeroLayer({ heroSrc }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const heroOpacity = anim(t, 0, 1, 0.4, 1.4, easeOutCubic)
  const heroScale = 1.04 + 0.1 * Math.min(1, t / SCENE_DUR)
  const heroShiftY = -2 + 4 * Math.min(1, t / SCENE_DUR)
  const imgSrc = (heroSrc?.startsWith('http') || heroSrc?.startsWith('/')) ? heroSrc : null
  return (
    <AbsoluteFill style={{ opacity: heroOpacity }}>
      {imgSrc && (
        <Img
          src={imgSrc}
          style={{
            position: 'absolute', top: '50%', left: '50%',
            width: '120%', height: '120%', objectFit: 'cover', objectPosition: 'center 20%',
            transform: `translate(-50%, calc(-50% + ${heroShiftY}px)) scale(${heroScale})`,
          }}
        />
      )}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%',
        background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.7) 35%, rgba(0,0,0,0) 100%)',
      }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 0, height: '22%',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0))',
      }} />
    </AbsoluteFill>
  )
}

function HeadlineLayer({ headline, textColor = '#fff', fontSize = 78, fontFamily = 'Anek Malayalam' }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const words = headline.split(' ')
  const perWord = 0.22
  const resolvedFont = FONT_STACK[fontFamily] || fontFamily
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', left: 70, right: 70, bottom: 160, zIndex: 4,
        fontFamily: resolvedFont,
        fontWeight: 700, fontSize, lineHeight: 1.22, letterSpacing: '-0.005em', color: textColor,
      }}>
        {words.map((word, i) => {
          const wordStart = i * perWord
          const op = anim(t, 0, 1, wordStart, wordStart + 0.45, easeOutCubic)
          const wordY = (1 - op) * 14
          return (
            <span key={i} style={{ display: 'inline-block', opacity: op, transform: `translateY(${wordY}px)`, marginRight: '0.28em' }}>
              {word}
            </span>
          )
        })}
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

export function Scene1({ scene1Headline: headline, heroSrc, bgColor, scene1HeadlineColor, scene1HeadlineFontSize, scene1HeadlineFont, clips, sceneOffset = 0 }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const sceneOp = anim(t, 1, 0, SCENE_DUR - 0.5, SCENE_DUR, easeInCubic)

  const resolvedClips = clips || DEFAULT_CLIPS.filter(c => c.scene === 1)
  // Match by templateClipId (dynamic) or id (legacy default clips)
  const heroCl     = resolvedClips.find(c => c.templateClipId === 'scene1-hero'     || c.id === 'scene1-hero')
  const headlineCl = resolvedClips.find(c => c.templateClipId === 'scene1-headline' || c.id === 'scene1-headline')

  return (
    <AbsoluteFill style={{ background: bgColor, opacity: sceneOp, overflow: 'hidden' }}>
      {heroCl && (
        <Sequence from={heroCl.globalStartFrame - sceneOffset} durationInFrames={heroCl.durationFrames}>
          <AbsoluteFill style={{ transform: clipTransform(heroCl), transformOrigin: 'center center' }}>
            <HeroLayer heroSrc={heroSrc} />
          </AbsoluteFill>
        </Sequence>
      )}
      {headlineCl && (
        <Sequence from={headlineCl.globalStartFrame - sceneOffset} durationInFrames={headlineCl.durationFrames}>
          <AbsoluteFill style={{ transform: clipTransform(headlineCl), transformOrigin: 'center center' }}>
            <HeadlineLayer
              headline={headline}
              textColor={scene1HeadlineColor}
              fontSize={scene1HeadlineFontSize}
              fontFamily={scene1HeadlineFont}
            />
          </AbsoluteFill>
        </Sequence>
      )}
      {resolvedClips
        .filter(c => c.scene === 1 && (c.type === 'image' || c.type === 'text' || c.type === 'video'))
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
