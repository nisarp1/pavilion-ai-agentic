import { Player } from '@remotion/player'
import { PavilionReelComposition, TOTAL_FRAMES } from './compositions/PavilionReelComposition'

export default function RemotionPreview({ props }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Live Preview  (1080 × 1920 · 14 s)</p>
      <div className="rounded-xl overflow-hidden shadow-2xl border border-gray-200" style={{ width: 270, height: 480 }}>
        <Player
          component={PavilionReelComposition}
          inputProps={props}
          durationInFrames={TOTAL_FRAMES}
          fps={30}
          compositionWidth={1080}
          compositionHeight={1920}
          style={{ width: 270, height: 480 }}
          controls
          loop
          autoPlay={false}
          showVolumeControls={false}
        />
      </div>
      <p className="text-xs text-gray-400">
        Images must be full <code className="bg-gray-100 px-1 rounded">https://</code> URLs to appear in preview.
      </p>
    </div>
  )
}
