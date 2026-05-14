/**
 * Browser-side JSX copy of the AIVideo Remotion composition.
 * Used exclusively by @remotion/player for the in-CMS live preview.
 * Cloud Run uses the TypeScript original in remotion-renderer/.
 */
import { createTikTokStyleCaptions } from '@remotion/captions'
import { useEffect, useMemo } from 'react'
import { AbsoluteFill, Audio, Img, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { TopChrome } from './TopChrome'

const FPS = 30
const INTRO_DURATION = 30   // 1-second intro card
const TAIL_BUFFER_FRAMES = 90 // 3-second tail — keeps last caption + background visible

const GRADIENTS = [
  'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
  'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
  'linear-gradient(135deg, #0a0a0a 0%, #1a0533 50%, #0a0a0a 100%)',
  'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  'linear-gradient(135deg, #1a1a1a 0%, #2d1b69 50%, #11998e 100%)',
]

function useFonts() {
  useEffect(() => {
    if (document.getElementById('pavilion-aivideo-fonts')) return
    const link = document.createElement('link')
    link.id = 'pavilion-aivideo-fonts'
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Anek+Malayalam:wght@400;500;600;700;800&display=swap'
    document.head.appendChild(link)
  }, [])
}

function BackgroundElement({ item, index }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()

  if (item.visible === false) return null

  const baseZoom = item.zoom ?? 1
  const animation = item.animations?.[0]
  let scale = baseZoom
  if (animation?.type === 'scale' && durationInFrames > 1) {
    const progress = Math.min(1, frame / (durationInFrames - 1))
    scale = baseZoom * interpolate(progress, [0, 1], [animation.from ?? 1, animation.to ?? 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  }

  const panX       = item.panX       ?? 50
  const panY       = item.panY       ?? 50
  const cropTop    = item.cropTop    ?? 0
  const cropRight  = item.cropRight  ?? 0
  const cropBottom = item.cropBottom ?? 0
  const cropLeft   = item.cropLeft   ?? 0
  const objectFit  = item.objectFit  ?? 'cover'
  const hasCrop    = cropTop > 0 || cropRight > 0 || cropBottom > 0 || cropLeft > 0

  const gradient = GRADIENTS[index % GRADIENTS.length]
  const hasImage = !!item.imageUrl

  return (
    <AbsoluteFill style={{ background: gradient }}>
      {hasImage && (
        <Img
          src={item.imageUrl}
          style={{
            width: '100%',
            height: '100%',
            objectFit,
            objectPosition: `${panX}% ${panY}%`,
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            ...(hasCrop && { clipPath: `inset(${cropTop}% ${cropRight}% ${cropBottom}% ${cropLeft}%)` }),
          }}
        />
      )}
    </AbsoluteFill>
  )
}

function SubtitleText({ text }) {
  const frame = useCurrentFrame()
  const progress = Math.min(1, frame / 5)
  const scale = 0.8 + 0.2 * progress
  const translateY = (1 - progress) * 20

  const sharedStyle = {
    position: 'absolute',
    fontSize: 88,
    fontFamily: "'Anek Malayalam', sans-serif",
    fontWeight: 800,
    textAlign: 'center',
    width: '85%',
    wordBreak: 'break-word',
    transform: `scale(${scale}) translateY(${translateY}px)`,
    lineHeight: 1.2,
  }

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ ...sharedStyle, color: 'black', WebkitTextStroke: '18px black' }}>{text}</div>
      <div style={{ ...sharedStyle, color: 'white' }}>{text}</div>
    </AbsoluteFill>
  )
}

function MalayalamWordCaption({ page, highlightColor = '#FFE600' }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const timeInMs = (frame / fps) * 1000
  const progress = Math.min(1, frame / 4)
  const sc = 0.92 + 0.08 * progress
  const dy = (1 - progress) * 24

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', top: undefined, bottom: 140, height: 280, padding: '0 40px' }}>
      {/* Dark pill background — YouTube CC style */}
      <div style={{
        background: 'rgba(0,0,0,0.72)',
        borderRadius: 18,
        padding: '16px 32px',
        display: 'inline-block',
        maxWidth: '100%',
        transform: `scale(${sc}) translateY(${dy}px)`,
      }}>
        <div style={{
          fontSize: 82,
          fontFamily: "'Anek Malayalam', sans-serif",
          fontWeight: 800,
          lineHeight: 1.3,
          textAlign: 'center',
          wordBreak: 'break-word',
        }}>
          {page.tokens.map((t) => {
            const startRel = t.fromMs - page.startMs
            const endRel = t.toMs - page.startMs
            const active = startRel <= timeInMs && endRel > timeInMs
            return (
              <span
                key={t.fromMs}
                style={{
                  display: 'inline',
                  whiteSpace: 'pre-wrap',
                  color: active ? highlightColor : 'white',
                  textShadow: active ? `0 0 24px ${highlightColor}88` : 'none',
                }}
              >
                {t.text}
              </span>
            )
          })}
        </div>
      </div>
    </AbsoluteFill>
  )
}

// Split pages that have more than maxTokens words into smaller sub-pages.
// This prevents long bursts of speech (many words within 400ms) from stacking visually.
// Each sub-page's durationMs extends to the next sub-page's start so there are no gaps.
function limitTokensPerPage(pages, maxTokens) {
  const expanded = []
  for (const page of pages) {
    if (page.tokens.length <= maxTokens) {
      expanded.push({ ...page })
      continue
    }
    for (let i = 0; i < page.tokens.length; i += maxTokens) {
      const tokens = page.tokens.slice(i, i + maxTokens)
      expanded.push({
        text: tokens.map(t => t.text).join('').trim(),
        startMs: tokens[0].fromMs,
        durationMs: tokens[tokens.length - 1].toMs - tokens[0].fromMs,
        tokens,
      })
    }
  }
  // Each page's durationMs extends to when the next one starts (no gaps or overlaps)
  for (let i = 0; i < expanded.length - 1; i++) {
    expanded[i].durationMs = expanded[i + 1].startMs - expanded[i].startMs
  }
  return expanded
}

export function AIVideoComposition({ timeline, logoSrc, brandName, accent }) {
  useFonts()

  const wordCaptions = timeline?.wordCaptions ?? []

  const pages = useMemo(() => {
    if (!wordCaptions.length) return []
    const { pages: raw } = createTikTokStyleCaptions({
      captions: wordCaptions,
      combineTokensWithinMilliseconds: 400,
    })
    return limitTokensPerPage(raw, 6)
  }, [wordCaptions])

  // True end = max of all tracks so last image fills the full audio duration
  const totalContentMs = useMemo(() => {
    if (!timeline) return 10000
    const ends = []
    if (timeline.elements?.length)     ends.push(Math.max(...timeline.elements.map(e => e.endMs)))
    if (timeline.audio?.length)        ends.push(Math.max(...timeline.audio.map(a => a.endMs)))
    if (timeline.wordCaptions?.length) ends.push(Math.max(...timeline.wordCaptions.map(c => c.endMs)))
    if (timeline.text?.length)         ends.push(Math.max(...timeline.text.map(t => t.endMs)))
    return ends.length ? Math.max(...ends) : 10000
  }, [timeline])

  if (!timeline) {
    return (
      <AbsoluteFill style={{ backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ color: 'white', fontFamily: "'Anek Malayalam', sans-serif", fontSize: 48, textAlign: 'center', padding: 40 }}>
          No timeline provided
        </div>
      </AbsoluteFill>
    )
  }

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {/* 1-second intro title card */}
      <Sequence durationInFrames={INTRO_DURATION}>
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', zIndex: 10 }}>
          <div style={{
            fontSize: 96,
            lineHeight: 1.2,
            width: '85%',
            color: 'black',
            fontFamily: "'Anek Malayalam', sans-serif",
            fontWeight: 800,
            backgroundColor: '#FFE600',
            paddingTop: 24,
            paddingBottom: 24,
            paddingLeft: 20,
            paddingRight: 20,
            border: '10px solid black',
          }}>
            {timeline.shortTitle}
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Background elements with Ken Burns zoom */}
      {/* Last element extended to totalContentMs + TAIL_BUFFER so there's no black at end */}
      {(timeline.elements ?? []).map((element, index) => {
        const elements = timeline.elements ?? []
        const isLast = index === elements.length - 1
        const tailMs = isLast ? (TAIL_BUFFER_FRAMES / FPS) * 1000 : 0
        const endMs = isLast ? Math.max(element.endMs, totalContentMs) + tailMs : element.endMs
        const durationMs = endMs - element.startMs
        const startFrame = index === 0
          ? Math.floor((element.startMs / 1000) * FPS)
          : Math.floor((element.startMs / 1000) * FPS) + INTRO_DURATION
        const duration = Math.max(1,
          Math.ceil((durationMs / 1000) * FPS) + (index === 0 ? INTRO_DURATION : 0)
        )
        return (
          <Sequence key={`bg-${index}`} from={startFrame} durationInFrames={duration}>
            <BackgroundElement item={element} index={index} />
          </Sequence>
        )
      })}

      {/* Captions: word-level TikTok highlight (preferred) or phrase fallback */}
      {pages.length > 0 ? (
        pages.map((page, i) => {
          // Use Math.floor for BOTH start and end so consecutive pages are
          // exactly back-to-back with no 1-frame gaps or overlaps.
          const startFrame = Math.floor((page.startMs / 1000) * FPS) + INTRO_DURATION
          const endFrame   = Math.floor(((page.startMs + page.durationMs) / 1000) * FPS) + INTRO_DURATION
          const durationFrames = Math.max(1, endFrame - startFrame)
          return (
            <Sequence key={`wc-${i}`} from={startFrame} durationInFrames={durationFrames}>
              <MalayalamWordCaption page={page} />
            </Sequence>
          )
        })
      ) : (
        (timeline.text ?? []).map((element, index) => {
          const startFrame = Math.floor((element.startMs / 1000) * FPS) + INTRO_DURATION
          const duration = Math.max(1, Math.ceil(((element.endMs - element.startMs) / 1000) * FPS))
          return (
            <Sequence key={`text-${index}`} from={startFrame} durationInFrames={duration}>
              <SubtitleText text={element.text} />
            </Sequence>
          )
        })
      )}

      {/* TopChrome: persistent logo + brand overlay */}
      <TopChrome logoSrc={logoSrc} brandName={brandName} accent={accent} />

      {/* Audio — last track extended by TAIL_BUFFER so it matches full composition length */}
      {(timeline.audio ?? []).map((element, index) => {
        const isLastAudio = index === (timeline.audio ?? []).length - 1
        const tailMs = isLastAudio ? (TAIL_BUFFER_FRAMES / FPS) * 1000 : 0
        const startFrame = Math.floor((element.startMs / 1000) * FPS) + INTRO_DURATION
        const duration = Math.max(1, Math.ceil(((element.endMs - element.startMs + tailMs) / 1000) * FPS))
        return (
          <Sequence key={`audio-${index}`} from={startFrame} durationInFrames={duration}>
            <Audio src={element.audioUrl} />
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
