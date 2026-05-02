/**
 * Browser-side JSX copy of the PavilionReel Remotion composition.
 * Used exclusively by @remotion/player for the in-CMS live preview.
 * Cloud Run uses the TypeScript original in remotion-renderer/.
 *
 * DYNAMIC VERSION: renders all scenes from the clips array —
 * no longer hardcoded to 2 scenes.
 */
import { useEffect } from 'react'
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig, Img, Video } from 'remotion'
import { Scene1 } from './Scene1'
import { Scene2 } from './Scene2'
import { Scoreboard } from './Scoreboard'
import { StatComparison } from './StatComparison'
import { QuoteCard } from './QuoteCard'
import { TickerHeadline } from './TickerHeadline'
import { TopChrome } from './TopChrome'
import { CaptionLayer } from './CaptionLayer'
import { anim, easeOutCubic } from './easing'
import { getEntryAnimStyle } from '../animationPresets'
import { DEFAULT_CLIPS } from '../../../store/slices/videoStudioSlice'

function useFonts() {
  useEffect(() => {
    if (document.getElementById('pavilion-studio-fonts')) return
    const link = document.createElement('link')
    link.id = 'pavilion-studio-fonts'
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Anek+Malayalam:wght@400;500;600;700;800&display=swap'
    document.head.appendChild(link)
  }, [])
}

function clipTransform(clip) {
  const ox = clip?.offsetX ?? 0
  const oy = clip?.offsetY ?? 0
  const sx = clip?.scaleX ?? 1
  const sy = clip?.scaleY ?? 1
  return `translate(${ox}px, ${oy}px) scale(${sx}, ${sy})`
}

function ChromeLayer({ brandName, accent, logoSrc }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const chromeOp = anim(t, 0, 1, 0.05, 0.6, easeOutCubic)
  const chromeY = (1 - chromeOp) * -10
  return <AbsoluteFill><TopChrome brandName={brandName} accent={accent} logoSrc={logoSrc} opacity={chromeOp} ty={chromeY} /></AbsoluteFill>
}

function ExtraImageLayer({ clip }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const entryStyle = getEntryAnimStyle(t, clip.entryAnimation)
  const baseTransform = clipTransform(clip)
  const mergedTransform = entryStyle.transform ? `${baseTransform} ${entryStyle.transform}` : baseTransform
  return (
    <AbsoluteFill style={{ opacity: entryStyle.opacity * (clip.opacity ?? 1), transform: mergedTransform, transformOrigin: 'center center' }}>
      {clip.src ? <Img src={clip.src} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <div style={{width:'100%',height:'100%',background:'rgba(255,255,255,0.1)'}}/>}
    </AbsoluteFill>
  )
}

function ExtraVideoLayer({ clip }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const entryStyle = getEntryAnimStyle(t, clip.entryAnimation)
  const baseTransform = clipTransform(clip)
  const mergedTransform = entryStyle.transform ? `${baseTransform} ${entryStyle.transform}` : baseTransform
  return (
    <AbsoluteFill style={{ opacity: entryStyle.opacity * (clip.opacity ?? 1), transform: mergedTransform, transformOrigin: 'center center' }}>
      {clip.src ? <Video src={clip.src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{width:'100%',height:'100%',background:'rgba(255,255,255,0.1)'}}/>}
    </AbsoluteFill>
  )
}

function ExtraTextLayer({ clip }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const entryStyle = getEntryAnimStyle(t, clip.entryAnimation)
  const baseTransform = clipTransform(clip)
  const mergedTransform = entryStyle.transform ? `${baseTransform} ${entryStyle.transform}` : baseTransform
  return (
    <AbsoluteFill style={{ opacity: entryStyle.opacity * (clip.opacity ?? 1), transform: mergedTransform, transformOrigin: 'center center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: clip.textColor, fontSize: clip.fontSize, fontFamily: clip.fontFamily, fontWeight: 800, textAlign: 'center', whiteSpace: 'pre-wrap' }}>
        {clip.text}
      </div>
    </AbsoluteFill>
  )
}

/**
 * Determine which Scene component to use based on the template ID embedded in the clips.
 * hero_headline → Scene1
 * player_card   → Scene2
 */
function resolveSceneComponent(sceneClips) {
  // Check templateClipId to figure out which template was used
  const firstClip = sceneClips[0]
  if (!firstClip) return 'hero_headline'
  const tplId = firstClip.templateClipId || firstClip.id || ''
  
  if (tplId.startsWith('scoreboard')) return 'scoreboard'
  if (tplId.startsWith('comparison')) return 'stat_comparison'
  if (tplId.startsWith('quote')) return 'quote_card'
  if (tplId.startsWith('ticker')) return 'ticker_headline'
  if (tplId.includes('scene2') || tplId.includes('card')) return 'player_card'
  
  return 'hero_headline'
}

export function PavilionReelComposition({ clips, ...props }) {
  useFonts()
  const resolvedClips = clips || DEFAULT_CLIPS

  // ── Group clips by scene number (scene > 0) ────────────────────────────────
  const sceneNumbers = [...new Set(
    resolvedClips.filter(c => c.scene > 0).map(c => c.scene)
  )].sort((a, b) => a - b)

  const chromeCl = resolvedClips.find(c => c.id === 'chrome')
  const totalFrames = resolvedClips.reduce((m, c) => Math.max(m, c.globalStartFrame + c.durationFrames), 420)

  return (
    <AbsoluteFill style={{ background: props.bgColor }}>

      {/* ── Global voiceover audio (from audioSrc prop) ── */}
      {props.audioSrc && <Audio src={props.audioSrc} />}

      {/* ── Render each scene dynamically ── */}
      {sceneNumbers.map(sceneNum => {
        const sceneClips = resolvedClips.filter(c => c.scene === sceneNum)
        if (!sceneClips.length) return null

        // The scene starts at the earliest globalStartFrame among its clips
        const sceneStartFrame = Math.min(...sceneClips.map(c => c.globalStartFrame))
        const sceneEndFrame = Math.max(...sceneClips.map(c => c.globalStartFrame + c.durationFrames))
        const sceneDuration = sceneEndFrame - sceneStartFrame

        // Merge customProps from any clip in this scene (all clips for a scene share the same AI customProps)
        const customProps = sceneClips.reduce((acc, c) => ({ ...acc, ...(c.customProps || {}) }), {})

        // Merged props for this scene: global props overridden by scene-specific customProps
        const sceneProps = { ...props, ...customProps }

        const tplType = resolveSceneComponent(sceneClips)

        return (
          <Sequence key={`scene-${sceneNum}`} from={sceneStartFrame} durationInFrames={sceneDuration}>
            {tplType === 'player_card' && <Scene2 {...sceneProps} clips={sceneClips} sceneOffset={sceneStartFrame} />}
            {tplType === 'hero_headline' && <Scene1 {...sceneProps} clips={sceneClips} sceneOffset={sceneStartFrame} />}
            {tplType === 'scoreboard' && <Scoreboard {...sceneProps} clips={sceneClips} sceneOffset={sceneStartFrame} />}
            {tplType === 'stat_comparison' && <StatComparison {...sceneProps} clips={sceneClips} sceneOffset={sceneStartFrame} />}
            {tplType === 'quote_card' && <QuoteCard {...sceneProps} clips={sceneClips} sceneOffset={sceneStartFrame} />}
            {tplType === 'ticker_headline' && <TickerHeadline {...sceneProps} clips={sceneClips} sceneOffset={sceneStartFrame} />}
          </Sequence>
        )
      })}

      {/* ── Top chrome overlay (spans full video) ── */}
      {chromeCl && (
        <Sequence from={0} durationInFrames={totalFrames}>
          <AbsoluteFill style={{ transform: clipTransform(chromeCl), transformOrigin: 'center center' }}>
            <ChromeLayer brandName={props.brandName} accent={props.accent} logoSrc={props.logoSrc} />
          </AbsoluteFill>
        </Sequence>
      )}

      {/* ── Dynamic universal tracks (scene: 0, not chrome/audio) ── */}
      {resolvedClips.filter(c => c.scene === 0 && c.id !== 'chrome' && c.id !== 'audio').map(clip => (
        <Sequence key={clip.id} from={clip.globalStartFrame} durationInFrames={clip.durationFrames}>
          {clip.type === 'image' && <ExtraImageLayer clip={clip} />}
          {clip.type === 'video' && <ExtraVideoLayer clip={clip} />}
          {clip.type === 'text'  && <ExtraTextLayer clip={clip} />}
        </Sequence>
      ))}

      {/* ── Extra audio tracks (scene: 0, type: audio) ── */}
      {resolvedClips.filter(c => c.scene === 0 && c.type === 'audio' && c.src).map(clip => (
        <Sequence key={clip.id} from={clip.globalStartFrame} durationInFrames={clip.durationFrames}>
          <Audio src={clip.src} volume={clip.opacity ?? 1} />
        </Sequence>
      ))}

      {/* ── Caption layer — topmost, frame-accurate word sync ── */}
      {props.captions?.ml?.length > 0 && (
        <AbsoluteFill style={{ zIndex: 100, pointerEvents: 'none' }}>
          <CaptionLayer
            mlCaptions={props.captions.ml}
            enCaptions={props.captions.en || []}
          />
        </AbsoluteFill>
      )}

    </AbsoluteFill>
  )
}
