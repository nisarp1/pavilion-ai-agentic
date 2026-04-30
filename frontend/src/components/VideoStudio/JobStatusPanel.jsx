import { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { FiCheckCircle, FiXCircle, FiLoader, FiDownload, FiX } from 'react-icons/fi'
import { pollJob, clearJob } from '../../store/slices/videoStudioSlice'

const STATUS_CONFIG = {
  pending:   { icon: FiLoader,       color: 'text-gray-500',  bg: 'bg-gray-50',   label: 'Queued…' },
  rendering: { icon: FiLoader,       color: 'text-blue-600',  bg: 'bg-blue-50',   label: 'Rendering…' },
  uploading: { icon: FiLoader,       color: 'text-indigo-600',bg: 'bg-indigo-50', label: 'Uploading to GCS…' },
  done:      { icon: FiCheckCircle,  color: 'text-green-600', bg: 'bg-green-50',  label: 'Done!' },
  failed:    { icon: FiXCircle,      color: 'text-red-600',   bg: 'bg-red-50',    label: 'Failed' },
}

export default function JobStatusPanel() {
  const dispatch = useDispatch()
  const { activeJob, polling } = useSelector(s => s.videoStudio)
  const timerRef = useRef(null)

  useEffect(() => {
    if (polling && activeJob?.id) {
      timerRef.current = setInterval(() => {
        dispatch(pollJob(activeJob.id))
      }, 3000)
    }
    return () => clearInterval(timerRef.current)
  }, [polling, activeJob?.id, dispatch])

  if (!activeJob) return null

  const cfg = STATUS_CONFIG[activeJob.status] || STATUS_CONFIG.pending
  const Icon = cfg.icon
  const spin = ['pending', 'rendering', 'uploading'].includes(activeJob.status)
  const isVideo = activeJob.job_type === 'render'

  return (
    <div className={`rounded-xl border p-4 ${cfg.bg} relative`}>
      <button
        onClick={() => dispatch(clearJob())}
        className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
      >
        <FiX size={16} />
      </button>

      <div className="flex items-center gap-3">
        <Icon size={22} className={`${cfg.color} ${spin ? 'animate-spin' : ''} flex-shrink-0`} />
        <div>
          <p className={`font-semibold text-sm ${cfg.color}`}>{cfg.label}</p>
          <p className="text-xs text-gray-500">
            {isVideo ? 'Cloud Render (GCP)' : 'Fallback Export (AEP ZIP)'}
            {' · '}Job <code className="font-mono">{String(activeJob.id).slice(0, 8)}</code>
          </p>
        </div>
      </div>

      {activeJob.status === 'done' && activeJob.output_url && (
        <a
          href={activeJob.output_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors w-fit"
          download
        >
          <FiDownload size={15} />
          {isVideo ? 'Download MP4' : 'Download ZIP'}
        </a>
      )}

      {activeJob.status === 'failed' && activeJob.error_message && (
        <p className="mt-2 text-xs text-red-700 bg-red-100 rounded p-2 font-mono break-all">
          {activeJob.error_message}
        </p>
      )}
    </div>
  )
}
