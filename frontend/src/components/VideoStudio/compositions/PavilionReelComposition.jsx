/**
 * Browser-side JSX copy of the PavilionReel Remotion composition.
 * Used exclusively by @remotion/player for the in-CMS live preview.
 * Cloud Run uses the TypeScript original in remotion-renderer/.
 */
import { useEffect } from 'react'
import { AbsoluteFill, Audio, Sequence } from 'remotion'
import { Scene1 } from './Scene1'
import { Scene2 } from './Scene2'

export const SCENE1_FRAMES = 180  // 6 s @ 30 fps
export const SCENE2_FRAMES = 240  // 8 s @ 30 fps
export const TOTAL_FRAMES = SCENE1_FRAMES + SCENE2_FRAMES // 420

// Load Malayalam + Manrope fonts into the document once
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

export function PavilionReelComposition(props) {
  useFonts()
  return (
    <AbsoluteFill style={{ background: props.bgColor }}>
      {props.audioSrc && <Audio src={props.audioSrc} />}
      <Sequence from={0} durationInFrames={SCENE1_FRAMES}>
        <Scene1 {...props} />
      </Sequence>
      <Sequence from={SCENE1_FRAMES} durationInFrames={SCENE2_FRAMES}>
        <Scene2 {...props} />
      </Sequence>
    </AbsoluteFill>
  )
}
