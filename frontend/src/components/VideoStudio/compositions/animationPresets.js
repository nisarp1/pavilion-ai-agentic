import { anim, easeOutCubic, easeOutBack } from './easing'

export const ENTRY_ANIMATIONS = [
  { value: 'none',            label: 'None'             },
  { value: 'fadeIn',          label: 'Fade In'          },
  { value: 'slideFromLeft',   label: 'Slide from Left'  },
  { value: 'slideFromRight',  label: 'Slide from Right' },
  { value: 'slideFromBottom', label: 'Slide Up'         },
  { value: 'slideFromTop',    label: 'Slide Down'       },
  { value: 'zoomIn',          label: 'Zoom In'          },
  { value: 'bounceIn',        label: 'Bounce In'        },
]

export function entryAnimStyle(t, animation = 'fadeIn') {
  const D = 0.5
  switch (animation) {
    case 'none':           return { opacity: 1 }
    case 'fadeIn':         return { opacity: anim(t, 0, 1, 0, D, easeOutCubic) }
    case 'slideFromLeft':  { const p = anim(t, 0, 1, 0, D, easeOutCubic); return { opacity: p, transform: `translateX(${(1 - p) * -80}px)` } }
    case 'slideFromRight': { const p = anim(t, 0, 1, 0, D, easeOutCubic); return { opacity: p, transform: `translateX(${(1 - p) * 80}px)` } }
    case 'slideFromBottom':{ const p = anim(t, 0, 1, 0, D, easeOutCubic); return { opacity: p, transform: `translateY(${(1 - p) * 80}px)` } }
    case 'slideFromTop':   { const p = anim(t, 0, 1, 0, D, easeOutCubic); return { opacity: p, transform: `translateY(${(1 - p) * -80}px)` } }
    case 'zoomIn':         { const p = anim(t, 0, 1, 0, D, easeOutCubic); return { opacity: p, transform: `scale(${0.7 + 0.3 * p})` } }
    case 'bounceIn':       { const p = anim(t, 0, 1, 0, 0.7, easeOutBack); return { opacity: Math.min(1, p * 2), transform: `scale(${p})` } }
    default:               return { opacity: 1 }
  }
}
