import { anim, easeOutCubic, easeOutBack } from './compositions/easing'

export const ENTRY_ANIMATIONS = [
  { id: 'none', label: 'None' },
  { id: 'fadeIn', label: 'Fade In' },
  { id: 'slideFromLeft', label: 'Slide from Left' },
  { id: 'slideFromRight', label: 'Slide from Right' },
  { id: 'slideFromBottom', label: 'Slide from Bottom' },
  { id: 'zoomIn', label: 'Zoom In' },
  { id: 'bounceIn', label: 'Bounce In' }
]

export function getEntryAnimStyle(t, animationType) {
  if (t < 0) return { opacity: 0 }
  
  if (animationType === 'fadeIn') {
    const op = anim(t, 0, 1, 0, 0.4, easeOutCubic)
    return { opacity: op }
  }
  
  if (animationType === 'slideFromLeft') {
    const op = anim(t, 0, 1, 0, 0.2, easeOutCubic)
    const x = anim(t, -200, 0, 0, 0.5, easeOutCubic)
    return { opacity: op, transform: `translateX(${x}px)` }
  }
  
  if (animationType === 'slideFromRight') {
    const op = anim(t, 0, 1, 0, 0.2, easeOutCubic)
    const x = anim(t, 200, 0, 0, 0.5, easeOutCubic)
    return { opacity: op, transform: `translateX(${x}px)` }
  }
  
  if (animationType === 'slideFromBottom') {
    const op = anim(t, 0, 1, 0, 0.2, easeOutCubic)
    const y = anim(t, 200, 0, 0, 0.5, easeOutCubic)
    return { opacity: op, transform: `translateY(${y}px)` }
  }
  
  if (animationType === 'zoomIn') {
    const op = anim(t, 0, 1, 0, 0.2, easeOutCubic)
    const s = anim(t, 0.5, 1, 0, 0.4, easeOutCubic)
    return { opacity: op, transform: `scale(${s})` }
  }
  
  if (animationType === 'bounceIn') {
    const op = anim(t, 0, 1, 0, 0.2, easeOutCubic)
    // easeOutBack overshoot
    const s = anim(t, 0, 1, 0, 0.6, easeOutBack) 
    return { opacity: op, transform: `scale(${s})` }
  }

  // default / none
  return { opacity: 1 }
}
