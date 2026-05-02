import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { updateProps } from '../../store/slices/videoStudioSlice'
import { FiMic, FiFilm, FiPackage, FiCopy, FiCheck, FiExternalLink, FiDownload } from 'react-icons/fi'

const TABS = [
  { id: 'voiceover', label: 'Voiceover', icon: FiMic },
  { id: 'scenes', label: 'Scenes', icon: FiFilm },
  { id: 'assets', label: 'Assets', icon: FiPackage },
]

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={handleCopy} className="p-1 text-gray-400 hover:text-blue-600 transition-colors" title="Copy to clipboard">
      {copied ? <FiCheck size={13} className="text-green-500" /> : <FiCopy size={13} />}
    </button>
  )
}

function VoiceoverTab({ plan }) {
  const vo = plan.voiceover || {}
  const script = vo.script_plain || ''
  const avatar = plan.avatar || {}

  return (
    <div className="space-y-4">
      {/* Main voiceover script */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Voiceover Script (Malayalam)</h4>
          <CopyButton text={script} />
        </div>
        <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap border border-gray-100 max-h-48 overflow-y-auto">
          {script || <span className="text-gray-400 italic">No script generated</span>}
        </div>
        <div className="flex gap-4 mt-2 text-xs text-gray-400">
          <span>⏱ ~{vo.estimated_duration_seconds || '?'}s</span>
          <span>🌐 {vo.language || 'ml-IN'}</span>
          <span>🎤 {vo.voice_id || 'Default'}</span>
        </div>
      </div>

      {/* Avatar scripts if any */}
      {avatar.needed && (
        <div className="border-t border-gray-100 pt-4">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">🧑‍💼 Avatar Scripts (Heygen)</h4>
          {avatar.opener_script && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-purple-600">Opener (10-14s)</span>
                <CopyButton text={avatar.opener_script} />
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-sm text-purple-800 border border-purple-100">
                {avatar.opener_script}
              </div>
            </div>
          )}
          {avatar.closer_script && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-purple-600">Closer (8-10s)</span>
                <CopyButton text={avatar.closer_script} />
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-sm text-purple-800 border border-purple-100">
                {avatar.closer_script}
              </div>
            </div>
          )}
          {avatar.hook_scripts?.length > 0 && avatar.hook_scripts.map((h, i) => (
            <div key={i} className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-amber-600">Hook {i + 1}</span>
                <CopyButton text={h} />
              </div>
              <div className="bg-amber-50 rounded-lg p-2 text-sm text-amber-800 border border-amber-100">{h}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ScenesTab({ plan }) {
  const scenes = plan.scenes || []
  const scriptScenes = plan._script_data?.scene_descriptions || []

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Scene Breakdown ({scenes.length} scenes)</h4>
      {scenes.length === 0 && <p className="text-sm text-gray-400 italic">No scenes generated</p>}
      {scenes.map((scene, i) => {
        const startSec = ((scene.start_frame || 0) / 30).toFixed(1)
        const endSec = (((scene.start_frame || 0) + (scene.duration_frames || 0)) / 30).toFixed(1)
        return (
          <div key={i} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-gray-700">
                Scene {scene.scene_number || i + 1}
                <span className="text-gray-400 font-normal ml-1.5">{scene.template_id}</span>
              </span>
              <span className="text-xs font-mono text-gray-400">{startSec}s – {endSec}s</span>
            </div>
            <p className="text-sm text-gray-600 mb-2">{scene.description}</p>
            {scene.props && (
              <div className="text-xs text-gray-400 space-y-0.5">
                {Object.entries(scene.props).map(([k, v]) => {
                  if (k === 'stats') return null
                  const display = typeof v === 'string' ? v : JSON.stringify(v)
                  return (
                    <div key={k} className="flex gap-1">
                      <span className="font-medium text-gray-500 flex-shrink-0">{k}:</span>
                      <span className="truncate">{display}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* Key Hooks */}
      {plan._script_data?.key_hooks?.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">🪝 Key Hooks</h4>
          {plan._script_data.key_hooks.map((hook, i) => (
            <div key={i} className="flex items-start gap-2 mb-1.5">
              <span className="text-xs font-bold text-amber-500 flex-shrink-0">{i + 1}.</span>
              <span className="text-sm text-gray-700">{hook}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AssetsTab({ plan }) {
  const dispatch = useDispatch()
  const assets = plan.assets_needed || []

  const statusColors = {
    needed: 'bg-red-50 text-red-600 border-red-200',
    auto_filled: 'bg-green-50 text-green-600 border-green-200',
    uploaded: 'bg-blue-50 text-blue-600 border-blue-200',
    pending_generation: 'bg-amber-50 text-amber-600 border-amber-200',
  }

  const statusLabels = {
    needed: '⬚ Needed',
    auto_filled: '✅ Auto-filled',
    uploaded: '📎 Uploaded',
    pending_generation: '⏳ Pending',
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Assets Checklist ({assets.length})</h4>
        <span className="text-xs text-gray-400">
          {assets.filter(a => a.status !== 'needed').length}/{assets.length} ready
        </span>
      </div>

      {assets.length === 0 && <p className="text-sm text-gray-400 italic">No assets identified</p>}

      {assets.map((asset, i) => (
        <div key={i} className={`rounded-xl p-3 border ${statusColors[asset.status] || 'bg-gray-50 border-gray-200'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold">
              {asset.id}
              <span className="font-normal text-gray-400 ml-1">({asset.type})</span>
            </span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-white/60">
              {statusLabels[asset.status] || asset.status}
            </span>
          </div>
          <p className="text-xs mb-2 opacity-80">{asset.description}</p>

          {/* Show URL if auto-filled */}
          {asset.url && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-gray-500 truncate flex-1">{asset.url}</span>
              <a href={asset.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 flex-shrink-0">
                <FiExternalLink size={11} />
              </a>
            </div>
          )}

          {/* Search query hint */}
          {asset.fallback_search_query && asset.status === 'needed' && (
            <div className="mt-1.5 text-[10px] text-gray-400">
              🔍 Search: <span className="italic">{asset.fallback_search_query}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function ProductionPlanPanel({ plan }) {
  const [tab, setTab] = useState('voiceover')

  if (!plan) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
        <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center mb-3 text-xl">🪄</div>
        <p className="text-sm font-medium text-gray-500">No production plan yet</p>
        <p className="text-xs text-gray-400 mt-1">Paste a URL or topic above and click Generate to create one.</p>
      </div>
    )
  }

  const meta = plan.metadata || {}

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-sm font-bold text-gray-700 truncate flex-1">{meta.title || 'Production Plan'}</h3>
          <span className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium flex-shrink-0 ml-2">
            {meta.video_format || 'reel'} · {meta.duration_seconds || '?'}s
          </span>
        </div>
        <div className="text-[10px] text-gray-400">
          {meta.resolution?.w}×{meta.resolution?.h} · {meta.fps || 30}fps · {meta.total_frames || '?'} frames
          {meta.pipeline_elapsed_seconds && <span className="ml-2">⏱ {meta.pipeline_elapsed_seconds}s</span>}
        </div>
        {plan.article_id && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded font-medium">
              📝 Draft #{plan.article_id}
            </span>
            <a
              href={`/articles`}
              className="text-[10px] text-blue-500 hover:text-blue-700 underline"
            >
              View in Articles →
            </a>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 flex-shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-b-2 ${
              tab === t.id
                ? 'text-purple-700 border-purple-500 bg-purple-50/50'
                : 'text-gray-400 border-transparent hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            <t.icon size={12} />
            {t.label}
            {t.id === 'assets' && plan.assets_needed?.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-red-100 text-red-600 text-[9px] font-bold flex items-center justify-center">
                {plan.assets_needed.filter(a => a.status === 'needed').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'voiceover' && <VoiceoverTab plan={plan} />}
        {tab === 'scenes' && <ScenesTab plan={plan} />}
        {tab === 'assets' && <AssetsTab plan={plan} />}
      </div>
    </div>
  )
}
