import { useDispatch, useSelector } from 'react-redux'
import { FiPlus, FiTrash2 } from 'react-icons/fi'
import { updateProps, updateStat, addStat, removeStat, setAudioUrl, setAssetUrls } from '../../store/slices/videoStudioSlice'

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none'
const colorCls = 'h-9 w-14 cursor-pointer rounded border border-gray-200'

export default function ReelForm() {
  const dispatch = useDispatch()
  const { props, audioUrl, assetUrls } = useSelector(s => s.videoStudio)

  const set = (key) => (e) => dispatch(updateProps({ [key]: e.target.value }))

  return (
    <div className="space-y-5 overflow-y-auto pr-1" style={{ maxHeight: 'calc(100vh - 220px)' }}>

      {/* ── Scene 1 ─────────────────────────────────────────────────── */}
      <section className="bg-gray-50 rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Scene 1 · Headline (6 s)</h3>
        <Field label="Headline (Malayalam)">
          <textarea
            className={inputCls} rows={3}
            value={props.scene1Headline} onChange={set('scene1Headline')}
            placeholder="ഇവിടെ ഹെഡ്‌ലൈൻ ടൈപ്പ് ചെയ്യുക..."
          />
        </Field>
        <Field label="Hero Image URL">
          <input className={inputCls} value={props.heroSrc} onChange={set('heroSrc')} placeholder="https://example.com/hero.jpg" />
        </Field>
      </section>

      {/* ── Scene 2 ─────────────────────────────────────────────────── */}
      <section className="bg-gray-50 rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Scene 2 · Player Card (8 s)</h3>
        <Field label="Question / Headline (Malayalam)">
          <textarea
            className={inputCls} rows={3}
            value={props.scene2Headline} onChange={set('scene2Headline')}
            placeholder="ചോദ്യം ഇവിടെ..."
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Player Name (ALL CAPS)">
            <input className={inputCls} value={props.playerName} onChange={set('playerName')} placeholder="MO SALAH" />
          </Field>
          <Field label="Player Image URL">
            <input className={inputCls} value={props.playerImage} onChange={set('playerImage')} placeholder="https://..." />
          </Field>
        </div>

        {/* Stats */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Stats (max 6)</label>
            {props.stats.length < 6 && (
              <button onClick={() => dispatch(addStat())} className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 font-medium">
                <FiPlus size={13} /> Add stat
              </button>
            )}
          </div>
          {props.stats.map((stat, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                className={`${inputCls} w-20`}
                placeholder="Value" value={stat.value}
                onChange={e => dispatch(updateStat({ index: i, field: 'value', value: e.target.value }))}
              />
              <input
                className={inputCls}
                placeholder="Label" value={stat.label}
                onChange={e => dispatch(updateStat({ index: i, field: 'label', value: e.target.value }))}
              />
              {props.stats.length > 1 && (
                <button onClick={() => dispatch(removeStat(i))} className="text-red-400 hover:text-red-600 flex-shrink-0">
                  <FiTrash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Brand ───────────────────────────────────────────────────── */}
      <section className="bg-gray-50 rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Brand & Colours</h3>
        <Field label="Brand Name">
          <input className={inputCls} value={props.brandName} onChange={set('brandName')} placeholder="PAVILIONEND" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'bgColor', label: 'Background' },
            { key: 'cardColor', label: 'Card Teal' },
            { key: 'cardAccent', label: 'Accent Stripe' },
            { key: 'accent', label: 'Live Dot' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2">
              <input type="color" className={colorCls} value={props[key]}
                onChange={e => dispatch(updateProps({ [key]: e.target.value }))} />
              <span className="text-xs text-gray-600">{label}<br /><code className="text-gray-400">{props[key]}</code></span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Audio ───────────────────────────────────────────────────── */}
      <section className="bg-gray-50 rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">ElevenLabs / TTS Audio</h3>
        <Field label="Voiceover URL (mp3)">
          <input
            className={inputCls} value={audioUrl}
            onChange={e => dispatch(setAudioUrl(e.target.value))}
            placeholder="https://api.elevenlabs.io/v1/... or GCS URL"
          />
        </Field>
        <p className="text-xs text-gray-400">
          Track A: embedded as audio track in the rendered video.<br />
          Track B: downloaded and bundled inside the ZIP.
        </p>
      </section>

      {/* ── Extra assets for fallback ZIP ───────────────────────────── */}
      <section className="bg-gray-50 rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Extra Assets (Fallback ZIP only)</h3>
        <Field label="Asset URLs — one per line">
          <textarea
            className={inputCls} rows={3}
            value={assetUrls.join('\n')}
            onChange={e => dispatch(setAssetUrls(e.target.value.split('\n').filter(Boolean)))}
            placeholder="https://example.com/clip.mp4&#10;https://example.com/logo.png"
          />
        </Field>
        <p className="text-xs text-gray-400">These files will be downloaded and bundled alongside the .aep template.</p>
      </section>

    </div>
  )
}
