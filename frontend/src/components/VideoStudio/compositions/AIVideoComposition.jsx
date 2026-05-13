/**
 * Browser-side JSX copy of the AIVideo Remotion composition.
 * Used exclusively by @remotion/player for the in-CMS live preview.
 * Cloud Run uses the TypeScript original in remotion-renderer/.
 */
import { createTikTokStyleCaptions } from '@remotion/captions'
import { useEffect, useMemo } from 'react'
import { AbsoluteFill, Img, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'

const FPS = 30
const INTRO_DURATION = 30  // 1-second intro card

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
  const isHttpUrl = item.imageUrl &&
    (item.imageUrl.startsWith('http://') || item.imageUrl.startsWith('https://') || item.imageUrl.startsWith('data:'))

  return (
    <AbsoluteFill style={{ background: gradient }}>
      {isHttpUrl && (
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
  const progress = Math.min(1, frame / 5)
  const scale = 0.85 + 0.15 * progress
  const dy = (1 - progress) * 40

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', top: undefined, bottom: 160, height: 320, padding: '0 48px' }}>
      <div style={{
        fontSize: 80,
        fontFamily: "'Anek Malayalam', sans-serif",
        fontWeight: 800,
        color: 'white',
        WebkitTextStroke: '14px black',
        paintOrder: 'stroke',
        lineHeight: 1.35,
        textAlign: 'center',
        width: '100%',
        wordBreak: 'break-word',
        transform: `scale(${scale}) translateY(${dy}px)`,
      }}>
        {page.tokens.map((t) => {
          const startRel = t.fromMs - page.startMs
          const endRel = t.toMs - page.startMs
          const active = startRel <= timeInMs && endRel > timeInMs
          return (
            <span key={t.fromMs} style={{ display: 'inline', whiteSpace: 'pre-wrap', color: active ? highlightColor : 'white' }}>
              {t.text}
            </span>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

export function AIVideoComposition({ timeline }) {
  useFonts()

  const wordCaptions = timeline?.wordCaptions ?? []

  const { pages } = useMemo(() => {
    if (!wordCaptions.length) return { pages: [] }
    return createTikTokStyleCaptions({
      captions: wordCaptions,
      combineTokensWithinMilliseconds: 1200,
    })
  }, [wordCaptions])

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
      {(timeline.elements ?? []).map((element, index) => {
        const durationMs = element.endMs - element.startMs
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
          const startFrame = Math.floor((page.startMs / 1000) * FPS) + INTRO_DURATION
          const durationFrames = Math.max(1, Math.ceil((page.durationMs / 1000) * FPS))
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

      {/* Audio is handled by the native <audio> element in RemotionPreview */}
    </AbsoluteFill>
  )
}
