/**
 * Browser-side JSX copy of the AIVideo Remotion composition.
 * Used exclusively by @remotion/player for the in-CMS live preview.
 * Cloud Run uses the TypeScript original in remotion-renderer/.
 */
import { useEffect } from 'react'
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

  const animation = item.animations?.[0]
  let scale = 1
  if (animation?.type === 'scale' && durationInFrames > 1) {
    const progress = Math.min(1, frame / (durationInFrames - 1))
    scale = interpolate(progress, [0, 1], [animation.from ?? 1, animation.to ?? 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  }

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
            objectFit: 'cover',
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
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
      {/* Stroke layer */}
      <div style={{ ...sharedStyle, color: 'black', WebkitTextStroke: '18px black' }}>
        {text}
      </div>
      {/* Fill layer */}
      <div style={{ ...sharedStyle, color: 'white' }}>
        {text}
      </div>
    </AbsoluteFill>
  )
}

export function AIVideoComposition({ timeline }) {
  useFonts()

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

      {/* Caption text chunks synced to audio */}
      {(timeline.text ?? []).map((element, index) => {
        const startFrame = Math.floor((element.startMs / 1000) * FPS) + INTRO_DURATION
        const duration = Math.max(1, Math.ceil(((element.endMs - element.startMs) / 1000) * FPS))
        return (
          <Sequence key={`text-${index}`} from={startFrame} durationInFrames={duration}>
            <SubtitleText text={element.text} />
          </Sequence>
        )
      })}

      {/* Audio is handled by the native <audio> element in RemotionPreview — not here */}
    </AbsoluteFill>
  )
}
