import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import api from '../../services/api'

export const DEFAULT_CLIPS = [
  { id: 'audio',           label: 'Voiceover',        globalStartFrame: 0,   durationFrames: 420, scene: 0, track: 0, color: '#6366f1', offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 },
  { id: 'chrome',          label: 'Top Chrome',        globalStartFrame: 0,   durationFrames: 420, scene: 0, track: 1, color: '#0284c7', offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 },
  { id: 'scene1-hero',     label: 'Hero Image',        globalStartFrame: 0,   durationFrames: 180, scene: 1, track: 2, color: '#0ea5e9', offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 },
  { id: 'scene1-headline', label: 'Scene 1 Headline',  globalStartFrame: 36,  durationFrames: 144, scene: 1, track: 3, color: '#38bdf8', offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 },
  { id: 'scene2-bg',       label: 'Background',        globalStartFrame: 180, durationFrames: 240, scene: 2, track: 4, color: '#10b981', offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 },
  { id: 'scene2-card',     label: 'Player Card',       globalStartFrame: 189, durationFrames: 231, scene: 2, track: 5, color: '#34d399', offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 },
  { id: 'scene2-headline', label: 'Scene 2 Headline',  globalStartFrame: 222, durationFrames: 198, scene: 2, track: 6, color: '#6ee7b7', offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 },
]

const DYNAMIC_COLORS = ['#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16']

// ── Async thunks ──────────────────────────────────────────────────────────────

export const submitRenderJob = createAsyncThunk(
  'videoStudio/submitRenderJob',
  async (payload, { rejectWithValue }) => {
    try {
      const res = await api.post('/video/jobs/render/', payload)
      return res.data
    } catch (err) {
      return rejectWithValue(err.response?.data || err.message)
    }
  }
)

export const submitFallbackExport = createAsyncThunk(
  'videoStudio/submitFallbackExport',
  async (payload, { rejectWithValue }) => {
    try {
      const res = await api.post('/video/jobs/export-fallback/', payload)
      return res.data
    } catch (err) {
      return rejectWithValue(err.response?.data || err.message)
    }
  }
)

export const pollJob = createAsyncThunk(
  'videoStudio/pollJob',
  async (jobId, { rejectWithValue }) => {
    try {
      const res = await api.get(`/video/jobs/${jobId}/`)
      return res.data
    } catch (err) {
      return rejectWithValue(err.response?.data || err.message)
    }
  }
)

export const fetchVideoJobs = createAsyncThunk(
  'videoStudio/fetchVideoJobs',
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get('/video/jobs/')
      return res.data
    } catch (err) {
      return rejectWithValue(err.response?.data || err.message)
    }
  }
)

// ── Default props matching PavilionReelProps ──────────────────────────────────

export const DEFAULT_PROPS = {
  scene1Headline: 'മുഹമ്മദ് സലാ ഈ സീസണിൽ ലിവർപൂൾ വിടുകയാണ്...',
  scene2Headline: 'ആ റൈറ്റ് വിങ്ങിൽ ആരെ കൊണ്ടുവരും?',
  playerName: 'MO SALAH',
  playerImage: 'player-cropped.png',
  heroSrc: 'hero.png',
  stats: [
    { value: '12', label: 'Goals' },
    { value: '8', label: 'Assists' },
    { value: '32', label: 'Apps' },
  ],
  bgColor: '#000000',
  cardColor: '#1f7a6e',
  cardAccent: '#e8b73b',
  accent: '#FF2D2D',
  brandName: 'PAVILIONEND',
  logoSrc: '',
  scene1HeadlineColor: '#ffffff',
  scene1HeadlineFontSize: 78,
  scene1HeadlineFont: 'Anek Malayalam',
  scene2HeadlineColor: '#ffffff',
  scene2HeadlineFontSize: 64,
  scene2HeadlineFont: 'Anek Malayalam',
}

// ── Undo/Redo helpers ─────────────────────────────────────────────────────────

function makeSnapshot(state) {
  return {
    props: { ...state.props, stats: state.props.stats.map(s => ({ ...s })) },
    clips: state.clips.map(c => ({ ...c })),
    audioUrl: state.audioUrl,
    nextClipSeq: state.nextClipSeq,
  }
}

function pushToHistory(state) {
  if (state.past.length >= 50) state.past.shift()
  state.past.push(makeSnapshot(state))
  state.future = []
}

// ── Slice ─────────────────────────────────────────────────────────────────────

const videoStudioSlice = createSlice({
  name: 'videoStudio',
  initialState: {
    props: { ...DEFAULT_PROPS },
    audioUrl: '',
    assetUrls: [],
    activeJob: null,
    jobs: [],
    polling: false,
    loading: false,
    error: null,
    clips: DEFAULT_CLIPS.map(c => ({ ...c })),
    selectedClipId: null,
    currentFrame: 0,
    past: [],
    future: [],
    nextClipSeq: 7,
    copiedStyle: null,
  },
  reducers: {
    updateProps(state, { payload }) {
      state.props = { ...state.props, ...payload }
    },
    updateStat(state, { payload: { index, field, value } }) {
      state.props.stats = state.props.stats.map((s, i) =>
        i === index ? { ...s, [field]: value } : s
      )
    },
    addStat(state) {
      if (state.props.stats.length < 6) {
        state.props.stats = [...state.props.stats, { value: '', label: '' }]
      }
    },
    removeStat(state, { payload: index }) {
      state.props.stats = state.props.stats.filter((_, i) => i !== index)
    },
    setAudioUrl(state, { payload }) { state.audioUrl = payload },
    setAssetUrls(state, { payload }) { state.assetUrls = payload },
    clearJob(state) { state.activeJob = null; state.error = null; state.polling = false },
    resetProps(state) {
      pushToHistory(state)
      state.props = { ...DEFAULT_PROPS }
      state.audioUrl = ''
      state.assetUrls = []
      state.clips = DEFAULT_CLIPS.map(c => ({ ...c }))
      state.selectedClipId = null
      state.currentFrame = 0
      state.nextClipSeq = 7
    },
    setClips(state, { payload }) {
      pushToHistory(state)
      state.clips = payload.map(c => ({ ...c }))
      // Update nextClipSeq to be higher than any existing track/ID seq
      const maxSeq = payload.reduce((max, c) => {
        const match = c.id?.match(/(\d+)$/)
        const idSeq = match ? parseInt(match[1]) : 0
        return Math.max(max, idSeq, c.track || 0)
      }, 0)
      state.nextClipSeq = maxSeq + 1
    },
    setVideoData(state, { payload: { props, clips, audioUrl } }) {
      pushToHistory(state)
      if (props) state.props = { ...state.props, ...props }
      if (clips) state.clips = clips.map(c => ({ ...c }))
      if (audioUrl !== undefined) state.audioUrl = audioUrl
      
      if (clips) {
         const maxSeq = clips.reduce((max, c) => {
          const match = c.id?.match(/(\d+)$/)
          const idSeq = match ? parseInt(match[1]) : 0
          return Math.max(max, idSeq, c.track || 0)
        }, 0)
        state.nextClipSeq = maxSeq + 1
      }
    },
    updateClip(state, { payload: { id, changes } }) {
      const clip = state.clips.find(c => c.id === id)
      if (!clip || clip.id === 'audio') return
      
      // Dynamic scene constraints if available
      const merged = { ...clip, ...changes }
      const MIN_DUR = 6
      merged.durationFrames = Math.max(MIN_DUR, merged.durationFrames)
      
      // If the clip belongs to a scene, we might want to constrain it to that scene's boundaries
      // but for now let's allow free movement to avoid issues with dynamic scene counts
      Object.assign(clip, merged)
    },
    addClip(state, { payload: { type } }) {
      pushToHistory(state)
      const maxFrames = state.clips.reduce((m, c) => Math.max(m, c.globalStartFrame + c.durationFrames), 420)
      const seq = state.nextClipSeq++
      const dynamicCount = state.clips.filter(c => c.type).length
      const clip = {
        id: `universal-${type === 'image' ? 'img' : type === 'video' ? 'vid' : type === 'audio' ? 'aud' : 'txt'}-${seq}`,
        label: type === 'image' ? 'Image Layer' : type === 'video' ? 'Video Layer' : type === 'audio' ? 'Audio Track' : 'Text Layer',
        type,
        globalStartFrame: 0,
        durationFrames: maxFrames,
        scene: 0,
        track: seq,
        color: DYNAMIC_COLORS[dynamicCount % DYNAMIC_COLORS.length],
        src: '',
        text: 'New Text',
        textColor: '#ffffff',
        fontSize: 72,
        fontFamily: 'Anek Malayalam',
        opacity: 1,
        offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1,
        entryAnimation: 'fadeIn',
      }
      state.clips.push(clip)
      state.selectedClipId = clip.id
    },
    removeClip(state, { payload: clipId }) {
      pushToHistory(state)
      state.clips = state.clips.filter(c => !(c.id === clipId && c.type))
      if (state.selectedClipId === clipId) state.selectedClipId = null
    },
    duplicateClip(state, { payload: clipId }) {
      const orig = state.clips.find(c => c.id === clipId)
      if (!orig || orig.id === 'audio' || orig.id === 'chrome') return
      pushToHistory(state)
      const seq = state.nextClipSeq++
      const newClip = {
        ...orig,
        id: `${orig.id}-copy-${seq}`,
        track: seq,
        offsetX: (orig.offsetX ?? 0) + 40,
        offsetY: (orig.offsetY ?? 0) + 40,
      }
      state.clips.push(newClip)
      state.selectedClipId = newClip.id
    },
    copyStyle(state, { payload: clipId }) {
      const clip = state.clips.find(c => c.id === clipId)
      if (!clip) return
      if (clip.type) {
        state.copiedStyle = {
          clipType: clip.type,
          src: clip.src,
          text: clip.text,
          textColor: clip.textColor,
          fontSize: clip.fontSize,
          fontFamily: clip.fontFamily,
          opacity: clip.opacity,
          offsetX: clip.offsetX, offsetY: clip.offsetY,
          scaleX: clip.scaleX,  scaleY: clip.scaleY,
        }
      } else {
        state.copiedStyle = {
          clipType: 'transform',
          offsetX: clip.offsetX ?? 0, offsetY: clip.offsetY ?? 0,
          scaleX: clip.scaleX ?? 1,  scaleY: clip.scaleY ?? 1,
        }
      }
    },
    pasteStyle(state, { payload: clipId }) {
      const clip = state.clips.find(c => c.id === clipId)
      const cs = state.copiedStyle
      if (!clip || !cs) return
      pushToHistory(state)
      if (cs.clipType === 'transform') {
        Object.assign(clip, { offsetX: cs.offsetX, offsetY: cs.offsetY, scaleX: cs.scaleX, scaleY: cs.scaleY })
      } else if (cs.clipType === clip.type) {
        const { clipType, ...fields } = cs
        Object.assign(clip, fields)
      } else {
        Object.assign(clip, { offsetX: cs.offsetX ?? 0, offsetY: cs.offsetY ?? 0, scaleX: cs.scaleX ?? 1, scaleY: cs.scaleY ?? 1 })
      }
    },
    selectClip(state, { payload }) { state.selectedClipId = payload },
    setCurrentFrame(state, { payload }) { 
      const maxFrames = state.clips.reduce((m, c) => Math.max(m, c.globalStartFrame + c.durationFrames), 420)
      state.currentFrame = Math.max(0, Math.min(maxFrames - 1, payload)) 
    },
    resetClips(state) {
      pushToHistory(state)
      state.clips = DEFAULT_CLIPS.map(c => ({ ...c }))
      state.selectedClipId = null
      state.currentFrame = 0
      state.nextClipSeq = 7
    },
    pushHistory(state) {
      pushToHistory(state)
    },
    undo(state) {
      if (state.past.length === 0) return
      const prev = state.past[state.past.length - 1]
      if (state.future.length >= 50) state.future.pop()
      state.future.unshift(makeSnapshot(state))
      state.past.pop()
      state.props = prev.props
      state.clips = prev.clips
      state.audioUrl = prev.audioUrl
      state.nextClipSeq = prev.nextClipSeq ?? state.nextClipSeq
    },
    redo(state) {
      if (state.future.length === 0) return
      const next = state.future[0]
      if (state.past.length >= 50) state.past.shift()
      state.past.push(makeSnapshot(state))
      state.future.shift()
      state.props = next.props
      state.clips = next.clips
      state.audioUrl = next.audioUrl
      state.nextClipSeq = next.nextClipSeq ?? state.nextClipSeq
    },
  },
  extraReducers: (builder) => {
    const pending = (state) => { state.loading = true; state.error = null }
    const rejected = (state, { payload }) => {
      state.loading = false
      state.error = payload?.error?.message || (typeof payload === 'string' ? payload : JSON.stringify(payload))
    }

    builder
      .addCase(submitRenderJob.pending, pending)
      .addCase(submitRenderJob.fulfilled, (state, { payload }) => {
        state.loading = false; state.activeJob = payload; state.polling = true
      })
      .addCase(submitRenderJob.rejected, rejected)

      .addCase(submitFallbackExport.pending, pending)
      .addCase(submitFallbackExport.fulfilled, (state, { payload }) => {
        state.loading = false; state.activeJob = payload; state.polling = true
      })
      .addCase(submitFallbackExport.rejected, rejected)

      .addCase(pollJob.fulfilled, (state, { payload }) => {
        state.activeJob = payload
        if (['done', 'failed'].includes(payload.status)) state.polling = false
      })

      .addCase(fetchVideoJobs.fulfilled, (state, { payload }) => {
        state.jobs = Array.isArray(payload) ? payload : (payload.results || [])
      })
  },
})

export const {
  updateProps, updateStat, addStat, removeStat,
  setAudioUrl, setAssetUrls, clearJob, resetProps, setClips, setVideoData,
  updateClip, addClip, removeClip, duplicateClip, copyStyle, pasteStyle,
  selectClip, setCurrentFrame, resetClips,
  pushHistory, undo, redo,
} = videoStudioSlice.actions

export default videoStudioSlice.reducer
