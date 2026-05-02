/**
 * CaptionLayer — Word-synced dual-language captions for Pavilion Reels
 *
 * Two tracks rendered frame-accurately via Remotion's useCurrentFrame():
 *   1. Malayalam (primary) — large karaoke-style, bottom-center
 *      Active word highlights in gold; recent words fade in context.
 *   2. English CC (secondary) — small sentence-level pill, above Malayalam
 *
 * Timing data comes from video_production_plan.captions:
 *   ml: [{word, start_s, end_s}]
 *   en: [{text, start_s, end_s}]
 */
import { useCurrentFrame, useVideoConfig } from 'remotion'

// How many words to show per "caption line" (before wrapping to next line)
const WORDS_PER_LINE = 5

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Group a flat word array into lines of N words each */
function groupIntoLines(words, wordsPerLine) {
  const lines = []
  for (let i = 0; i < words.length; i += wordsPerLine) {
    lines.push(words.slice(i, i + wordsPerLine))
  }
  return lines
}

/** Find which line index contains the currently active word */
function activeLineIndex(lines, currentTimeSecs) {
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    const lineStart = line[0]?.start_s ?? Infinity
    const lineEnd   = line[line.length - 1]?.end_s ?? -1
    if (currentTimeSecs >= lineStart && currentTimeSecs <= lineEnd) return li
    // Also show the line a tiny bit after it ends (0.3s grace)
    if (currentTimeSecs > lineEnd && currentTimeSecs <= lineEnd + 0.3) return li
  }
  // Before any word: show first line
  if (lines.length > 0 && currentTimeSecs < (lines[0][0]?.start_s ?? 0)) return 0
  return -1
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MalayalamWord({ word, state }) {
  // state: 'active' | 'past' | 'upcoming'
  const base = {
    display:       'inline',
    fontFamily:    '"Anek Malayalam", "Noto Sans Malayalam", sans-serif',
    fontWeight:    800,
    lineHeight:    1.3,
    textShadow:    '0 2px 12px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,1)',
    transition:    'color 0.05s',
    marginRight:   '0.25em',
  }

  if (state === 'active') {
    return (
      <span style={{
        ...base,
        color:     '#FFD700',   // gold highlight
        fontSize:  80,
        transform: 'scale(1.08)',
        display:   'inline-block',
        filter:    'drop-shadow(0 0 8px rgba(255,215,0,0.6))',
      }}>
        {word.word}
      </span>
    )
  }
  if (state === 'past') {
    return (
      <span style={{ ...base, color: 'rgba(255,255,255,0.75)', fontSize: 74 }}>
        {word.word}
      </span>
    )
  }
  // upcoming
  return (
    <span style={{ ...base, color: 'rgba(255,255,255,0.35)', fontSize: 74 }}>
      {word.word}
    </span>
  )
}

function MalayalamCaptionLine({ words, currentTimeSecs }) {
  if (!words?.length) return null
  return (
    <div style={{
      display:        'flex',
      flexWrap:       'wrap',
      justifyContent: 'center',
      alignItems:     'baseline',
      gap:            '0.1em',
      padding:        '0 40px',
    }}>
      {words.map((w, i) => {
        let state = 'upcoming'
        if (currentTimeSecs >= w.start_s && currentTimeSecs <= w.end_s) {
          state = 'active'
        } else if (currentTimeSecs > w.end_s) {
          state = 'past'
        }
        return <MalayalamWord key={i} word={w} state={state} />
      })}
    </div>
  )
}

function EnglishCaption({ enCaptions, currentTimeSecs }) {
  const current = enCaptions?.find(
    s => currentTimeSecs >= s.start_s && currentTimeSecs <= s.end_s
  )
  if (!current) return null

  return (
    <div style={{
      display:         'flex',
      justifyContent:  'center',
      marginBottom:    20,
      padding:         '0 48px',
    }}>
      <div style={{
        background:    'rgba(0,0,0,0.65)',
        borderRadius:  12,
        padding:       '8px 20px',
        maxWidth:      '90%',
      }}>
        <span style={{
          fontFamily:  '"Inter", "Roboto", sans-serif',
          fontSize:    36,
          fontWeight:  500,
          color:       '#ffffff',
          letterSpacing: 0.3,
          lineHeight:  1.4,
          textAlign:   'center',
          display:     'block',
        }}>
          {current.text}
        </span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function CaptionLayer({ mlCaptions = [], enCaptions = [] }) {
  const frame = useCurrentFrame()
  const { fps, height } = useVideoConfig()
  const currentTimeSecs = frame / fps

  if (!mlCaptions.length) return null

  const lines     = groupIntoLines(mlCaptions, WORDS_PER_LINE)
  const lineIdx   = activeLineIndex(lines, currentTimeSecs)
  const activeLine = lineIdx >= 0 ? lines[lineIdx] : null

  // Fade in the caption block when the first word appears
  const firstWordStart = mlCaptions[0]?.start_s ?? 0
  const opacity = currentTimeSecs >= firstWordStart
    ? Math.min(1, (currentTimeSecs - firstWordStart) / 0.2)  // 0.2s fade-in
    : 0

  return (
    <div style={{
      position:        'absolute',
      left:            0,
      right:           0,
      bottom:          80,                // above any bottom UI chrome
      display:         'flex',
      flexDirection:   'column',
      alignItems:      'center',
      justifyContent:  'flex-end',
      opacity,
      // Ensure captions are above all scene layers
      zIndex:          100,
      pointerEvents:   'none',
    }}>
      {/* English CC — sentence-level, above Malayalam */}
      <EnglishCaption enCaptions={enCaptions} currentTimeSecs={currentTimeSecs} />

      {/* Malayalam karaoke — word-by-word highlighted */}
      <div style={{
        background:    'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)',
        width:         '100%',
        paddingBottom: 16,
        paddingTop:    24,
      }}>
        {activeLine ? (
          <MalayalamCaptionLine words={activeLine} currentTimeSecs={currentTimeSecs} />
        ) : (
          // Show the last line that passed as a ghost (fading out)
          lineIdx === -1 && lines.length > 0 && currentTimeSecs > (mlCaptions[mlCaptions.length - 1]?.end_s ?? 0)
            ? null
            : null
        )}
      </div>
    </div>
  )
}
