import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import ArticlePreview from './ArticlePreview'
import { useDispatch, useSelector } from 'react-redux'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { fetchArticle, updateArticle } from '../../store/slices/articleSlice'
import api from '../../services/api'
import { fetchCategoryTree } from '../../store/slices/categorySlice'
import { showSuccess, showError } from '../../utils/toast'
import { normalizeMediaUrl } from '../../utils/mediaUrl'

import MediaLibrary from '../MediaLibrary/MediaLibrary'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'
import 'react-quill/dist/quill.snow.css'
import { registerCustomBlots } from '../../utils/quillEmbedBlot'

// Manual registration to ensure ReactQuill finds it
registerCustomBlots(ReactQuill.Quill)

import { convertUrlToEmbed } from '../../utils/embedUtils'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { FiImage, FiUser, FiLink, FiTag, FiExternalLink, FiVolume2, FiMove, FiVideo } from 'react-icons/fi'

function SortableSidebarItem(props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: props.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 right-2 p-2 text-gray-400 hover:text-primary-600 cursor-grab active:cursor-grabbing z-10 bg-white rounded-full shadow-sm border border-gray-100"
        style={{ touchAction: 'none' }}
        title="Drag to reorder"
      >
        <FiMove size={16} />
      </div>
      {props.children}
    </div>
  )
}

function ArticleEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const currentArticle = useSelector((state) => state.articles.currentArticle)
  const loading = useSelector((state) => state.articles.loading)
  const { categoryTree } = useSelector((state) => state.categories)
  const quillRef = useRef(null)
  const fileInputRef = useRef(null)
  const editorCursorRef = useRef(null)
  const [mediaLibraryMode, setMediaLibraryMode] = useState('featured') // 'featured' or 'body'
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [showMediaLibrary, setShowMediaLibrary] = useState(false)
  const [generatingAudio, setGeneratingAudio] = useState({})
  const [showPreview, setShowPreview] = useState(false)
  const [voiceAudioUrls, setVoiceAudioUrls] = useState({})
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    summary: '',
    body: '',
    status: 'draft',
    category: 'reliable_sources',
    category_ids: [],
    author: '',
    meta_title: '',
    meta_description: '',
    og_title: '',
    og_description: '',
    published_at: '',
  })

  const [sidebarOrder, setSidebarOrder] = useState([
    'status',
    'audio',
    'studio_links',
    'featured_image',
    'author',
    'slug',
    'reference_link',
    'source',
    'categories',
  ])

  const isInitialLoad = useRef(true)
  const autoAudioTriggered = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    const savedOrder = localStorage.getItem('articleEditSidebarOrder')
    if (savedOrder) {
      try {
        const parsed = JSON.parse(savedOrder)
        const validKeys = new Set(['status', 'audio', 'studio_links', 'featured_image', 'author', 'slug', 'reference_link', 'source', 'categories'])
        const filtered = parsed.filter(k => validKeys.has(k))
        const defaultKeys = ['status', 'audio', 'studio_links', 'featured_image', 'author', 'slug', 'reference_link', 'source', 'categories']
        const merged = [...new Set([...filtered, ...defaultKeys])]
        setSidebarOrder(merged)
      } catch (e) { }
    }
  }, [])

  const handleDragEnd = (event) => {
    const { active, over } = event

    if (active.id !== over.id) {
      setSidebarOrder((items) => {
        const oldIndex = items.indexOf(active.id)
        const newIndex = items.indexOf(over.id)
        const newOrder = arrayMove(items, oldIndex, newIndex)
        localStorage.setItem('articleEditSidebarOrder', JSON.stringify(newOrder))
        return newOrder
      })
    }
  }
  useEffect(() => {
    dispatch(fetchArticle(id))
    dispatch(fetchCategoryTree())
    // Reset initial load flag on ID change
    isInitialLoad.current = true
  }, [dispatch, id])

  useEffect(() => {
    if (currentArticle && (isInitialLoad.current || !formData.title)) {
      // Format published_at for datetime-local input (YYYY-MM-DDTHH:mm)
      let publishedAt = ''
      if (currentArticle.published_at) {
        const date = new Date(currentArticle.published_at)
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        publishedAt = `${year}-${month}-${day}T${hours}:${minutes}`
      }

      setFormData({
        title: currentArticle.title || '',
        slug: currentArticle.slug || '',
        summary: currentArticle.summary || '',
        body: currentArticle.body || '',
        status: currentArticle.status || 'draft',
        category: currentArticle.category || 'reliable_sources',
        category_ids: currentArticle.categories?.map(cat => cat.id) || [],
        author: currentArticle.author || '',
        meta_title: currentArticle.meta_title || '',
        meta_description: currentArticle.meta_description || '',
        og_title: currentArticle.og_title || '',
        og_description: currentArticle.og_description || '',
        published_at: publishedAt,
      })

      isInitialLoad.current = false
    }
  }, [currentArticle])

  // Poll for updates if the article is in 'fetched' state (likely generating)
  useEffect(() => {
    let intervalId = null;

    // Poll while article is being generated
    if (currentArticle && currentArticle.status === 'fetched') {
      intervalId = setInterval(() => {
        dispatch(fetchArticle(id));
      }, 3000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [dispatch, id, currentArticle?.status]);


  // Load social media scripts
  useEffect(() => {
    // Twitter/X
    if (!window.twttr) {
      const script = document.createElement('script')
      script.src = 'https://platform.twitter.com/widgets.js'
      script.async = true
      script.charset = 'utf-8'
      document.body.appendChild(script)
    }

    // Instagram
    if (!window.instgrm) {
      const script = document.createElement('script')
      script.src = '//www.instagram.com/embed.js'
      script.async = true
      document.body.appendChild(script)
    }
  }, [])

  // Paste handler for embeds - proven method from web research
  useEffect(() => {
    let handlePaste = null
    let timer = null

    try {
      // Wait for editor to be ready
      timer = setTimeout(() => {
        try {
          if (!quillRef.current) return

          const quill = quillRef.current.getEditor()
          if (!quill || !quill.root) return

          handlePaste = async (e) => {
            const clipboardData = e.clipboardData || window.clipboardData
            if (!clipboardData) return

            const text = clipboardData.getData('text/plain')
            if (!text) return

            const trimmedText = text.trim()

            // Check if it's a pure URL (exactly matches URL pattern)
            const urlRegex = /^(https?:\/\/[^\s]+)$/i
            if (!urlRegex.test(trimmedText)) return

            const url = trimmedText

            // Check if it's an embeddable URL
            if (!/youtube\.com|youtu\.be|twitter\.com|x\.com|instagram\.com|facebook\.com/i.test(url)) {
              return
            }

            // Convert URL to embed HTML
            const embedHtml = convertUrlToEmbed(url)
            if (!embedHtml) return

            // Prevent default paste behavior
            e.preventDefault()
            e.stopPropagation()

            // Get current selection or end of document
            const range = quill.getSelection(true)
            const index = range ? range.index : quill.getLength()

            // Insert embed using the custom blot
            // Detect type of embed to use correct Blot and styling
            const isIframe = embedHtml.includes('<iframe')
            const blotType = isIframe ? 'videoEmbed' : 'socialEmbed'

            quill.insertEmbed(index, blotType, embedHtml, 'user')

            // Insert a newline after to breakout
            quill.insertText(index + 1, '\n', 'user')

            // Trigger SDK re-scan for new embeds
            setTimeout(() => {
              // Twitter
              if (window.twttr && window.twttr.widgets) {
                window.twttr.widgets.load()
              }
              // Instagram
              if (window.instgrm && window.instgrm.Embeds) {
                window.instgrm.Embeds.process()
              }
            }, 100)

            // Move cursor after embed
            setTimeout(() => {
              quill.setSelection(index + 2, 'silent')
            }, 10)
          }

          // Attach paste handler to editor root with capture phase
          const editorElement = quill.root
          editorElement.addEventListener('paste', handlePaste, true)

          console.log('✅ Embed paste handler registered')
        } catch (error) {
          console.error('Error setting up paste handler:', error)
        }
      }, 500) // Increased timeout slightly to ensure Quill is ready
    } catch (error) {
      console.error('Error in paste handler useEffect:', error)
    }

    return () => {
      if (timer) {
        clearTimeout(timer)
      }
      if (quillRef.current && handlePaste) {
        try {
          const quill = quillRef.current.getEditor()
          if (quill && quill.root) {
            quill.root.removeEventListener('paste', handlePaste, true)
          }
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }
  }, [loading])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleBodyChange = (content) => {
    setFormData((prev) => ({ ...prev, body: content }))
  }

  const handleStatusChange = (newStatus) => {
    setFormData((prev) => ({ ...prev, status: newStatus }))
  }

  const handleSave = async (status) => {
    setSaving(true)
    try {
      const dataToSave = { ...formData, status }

      // Convert published_at from datetime-local format to ISO string
      if (dataToSave.published_at) {
        const date = new Date(dataToSave.published_at)
        dataToSave.published_at = date.toISOString()
      } else if (status === 'published') {
        // If publishing and no published_at set, use current time
        dataToSave.published_at = new Date().toISOString()
      } else {
        // Essential: Send null instead of empty string to avoid "Datetime has wrong format" error
        dataToSave.published_at = null
      }

      await dispatch(updateArticle({ id, data: dataToSave })).unwrap()
      showSuccess(status === 'published' ? 'Article published' : 'Draft saved')
      navigate('/articles')
    } catch (error) {
      console.error('Error saving article:', error)
      showError('Error saving article: ' + (error.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = () => {
    handleSave('published')
  }

  const handleSaveDraft = () => {
    handleSave('draft')
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showError('Please select an image file')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      showError('Image size must be less than 5MB')
      return
    }

    setUploadingImage(true)
    try {
      const formDataToSend = new FormData()
      formDataToSend.append('featured_image', file)

      const response = await api.patch(`/articles/${id}/`, formDataToSend)

      const updatedArticle = response.data
      dispatch({ type: 'articles/updateArticle/fulfilled', payload: updatedArticle })

      // Refresh the article to get the new image URL
      dispatch(fetchArticle(id))
    } catch (error) {
      console.error('Error uploading image:', error)
      showError('Failed to upload image. Please try again.')
    } finally {
      setUploadingImage(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleFeaturedImageClick = () => {
    setMediaLibraryMode('featured')
    setShowMediaLibrary(true)
  }

  const handleQuillImageClick = useCallback(() => {
    const quill = quillRef.current?.getEditor()
    if (quill) {
      const range = quill.getSelection()
      editorCursorRef.current = range ? range.index : quill.getLength()
    }
    setMediaLibraryMode('body')
    setShowMediaLibrary(true)
  }, [])

  const modules = useMemo(() => ({
    toolbar: {
      container: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        [{ 'align': [] }],
        ['link', 'image'],
        ['blockquote', 'code-block'],
        ['clean']
      ],
      handlers: {
        image: handleQuillImageClick
      }
    },
    clipboard: {
      matchVisual: false,
      matchers: []
    }
  }), [handleQuillImageClick])

  const handleMediaSelect = async (mediaItem) => {
    if (mediaLibraryMode === 'body') {
      const quill = quillRef.current?.getEditor()
      if (quill) {
        const index = editorCursorRef.current !== null ? editorCursorRef.current : quill.getLength()
        quill.insertEmbed(index, 'image', mediaItem.url)
        quill.insertText(index + 1, '\n') // Add newline after image
        quill.setSelection(index + 2)
      }
      return
    }

    try {
      setUploadingImage(true)
      // Update article with selected media ID AND current form data to save progress
      const updateData = {
        ...formData,
        featured_media_id_write: mediaItem.id
      }

      // Format published_at if it exists (matching handleSave logic)
      if (updateData.published_at) {
        const date = new Date(updateData.published_at)
        updateData.published_at = date.toISOString()
      } else {
        // Essential: Send null instead of empty string to avoid "Datetime has wrong format" error
        updateData.published_at = null
      }

      const updateResponse = await api.patch(`/articles/${id}/`, updateData)
      const updatedArticle = updateResponse.data
      dispatch({ type: 'articles/updateArticle/fulfilled', payload: updatedArticle })
      dispatch(fetchArticle(id))
    } catch (error) {
      console.error('Error setting featured image:', error)
      showError('Failed to set featured image. Please try again.')
    } finally {
      setUploadingImage(false)
    }
  }

  const handleGenerateAudio = async (voiceName) => {
    if (!currentArticle.body || !currentArticle.body.trim()) {
      showError('Article must have content to generate audio.')
      return
    }

    setGeneratingAudio(prev => ({ ...prev, [voiceName]: true }))
    try {
      const response = await api.post(`/articles/${id}/generate_audio/`, {
        voice_name: voiceName
      })

      const audioUrl = response.data.audio_url || response.data.article?.audio_url
      if (audioUrl) {
        // Store the audio URL for this specific voice
        setVoiceAudioUrls(prev => ({ ...prev, [voiceName]: audioUrl }))
        // Refresh article to get updated audio (for WaveNet which is the default)
        if (voiceName === 'wavenet' || voiceName === 'karthika') {
          dispatch(fetchArticle(id))
        }
      }
    } catch (error) {
      console.error(`Error generating audio with ${voiceName}:`, error)
      const errorMsg = error.response?.data?.error?.message || response?.data?.detail || error.message
      showError(`Failed to generate audio with ${voiceName} voice: ${errorMsg}`)
    } finally {
      setGeneratingAudio(prev => ({ ...prev, [voiceName]: false }))
    }
  }

  // Helper function to get full audio URL
  const getFullAudioUrl = (audioUrl) => {
    if (!audioUrl) return null
    return audioUrl?.startsWith('http')
      ? audioUrl
      : `http://localhost:8000${audioUrl?.startsWith('/') ? '' : '/'}${audioUrl}`
  }

  // Auto-generate Chirp3 HD audio when a freshly generated article has no audio yet
  useEffect(() => {
    if (
      !autoAudioTriggered.current &&
      currentArticle &&
      currentArticle.status === 'generated' &&
      !currentArticle.audio &&
      !currentArticle.audio_url &&
      currentArticle.body?.trim()
    ) {
      autoAudioTriggered.current = true
      api.post(`/articles/${id}/generate_audio/`, { voice_name: 'chirp' })
        .then(res => {
          const audioUrl = res.data.audio_url || res.data.article?.audio_url
          if (audioUrl) {
            setVoiceAudioUrls(prev => ({ ...prev, chirp: audioUrl }))
            dispatch(fetchArticle(id))
          }
        })
        .catch(err => console.warn('Auto audio generation failed:', err))
    }
  }, [currentArticle?.id, currentArticle?.status])

  if (loading || !currentArticle) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const categoryOptions = [
    { value: 'reliable_sources', label: 'Reliable Sources' },
    { value: 'trends', label: 'Trends' },
    { value: 'subscriptions', label: 'Subscriptions' },
  ]

  const sidebarComponents = {
    status: (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Status</h3>
        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="radio"
              name="status"
              value="draft"
              checked={formData.status === 'draft'}
              onChange={() => handleStatusChange('draft')}
              className="w-4 h-4 text-primary-600 focus:ring-primary-500"
            />
            <span className="ml-2 text-sm text-gray-700">Draft</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="status"
              value="published"
              checked={formData.status === 'published'}
              onChange={() => handleStatusChange('published')}
              className="w-4 h-4 text-primary-600 focus:ring-primary-500"
            />
            <span className="ml-2 text-sm text-gray-700">Published</span>
          </label>
        </div>

        {formData.status === 'published' && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <label htmlFor="published_at" className="block text-sm font-medium text-gray-700 mb-2">
              Published Date & Time
            </label>
            <input
              type="datetime-local"
              id="published_at"
              name="published_at"
              value={formData.published_at || ''}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-500">
              Change when this article was/will be published
            </p>
          </div>
        )}
      </div>
    ),
    audio: (
      currentArticle.body && currentArticle.body.trim() ? (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide flex items-center gap-2">
            <FiVolume2 size={16} />
            Voice Audio (Chirp3 HD)
          </h3>

          {/* Existing audio from article */}
          {(voiceAudioUrls.chirp || currentArticle.audio_url || currentArticle.audio) ? (
            <div className="space-y-3">
              <audio
                controls
                src={getFullAudioUrl(voiceAudioUrls.chirp || currentArticle.audio_url || currentArticle.audio)}
                className="w-full"
                style={{ height: '40px' }}
              >
                Your browser does not support the audio element.
              </audio>
              <button
                onClick={() => handleGenerateAudio('chirp')}
                disabled={generatingAudio.chirp}
                className="w-full px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                {generatingAudio.chirp ? 'Regenerating...' : 'Regenerate'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {generatingAudio.chirp ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                  Generating Malayalam voice...
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No audio yet</p>
              )}
              <button
                onClick={() => handleGenerateAudio('chirp')}
                disabled={generatingAudio.chirp}
                className="w-full px-3 py-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {generatingAudio.chirp ? 'Generating...' : 'Generate Voice'}
              </button>
            </div>
          )}
        </div>
      ) : null
    ),
    studio_links: (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Open In</h3>
        <div className="space-y-3">
          <Link
            to="/social-studio"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
          >
            <FiExternalLink size={15} />
            Open in Social Studio
          </Link>
          <Link
            to={`/video-studio?article=${id}`}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors text-sm font-medium"
          >
            <FiVideo size={15} />
            Open in Video Studio
          </Link>
        </div>
      </div>
    ),
    featured_image: (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide flex items-center gap-2">
          <FiImage size={16} />
          Featured Image
        </h3>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageUpload}
          accept="image/*"
          className="hidden"
        />
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageUpload}
          accept="image/*"
          className="hidden"
        />
        {currentArticle.featured_image_url ? (
          <div className="space-y-3">
            <img
              src={normalizeMediaUrl(currentArticle.featured_image_url)}
              alt="Featured"
              onClick={handleFeaturedImageClick}
              className="w-full h-48 object-cover rounded-lg border border-gray-300 cursor-pointer hover:opacity-90 transition-opacity"
              onError={(e) => {
                e.target.style.display = 'none'
              }}
            />
            <button
              type="button"
              onClick={handleFeaturedImageClick}
              disabled={uploadingImage}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploadingImage ? 'Uploading...' : 'Change Image'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleFeaturedImageClick}
            disabled={uploadingImage}
            className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-primary-500 hover:text-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploadingImage ? 'Uploading...' : 'Set featured image'}
          </button>
        )}
      </div>
    ),
    author: (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide flex items-center gap-2">
          <FiUser size={16} />
          Author
        </h3>
        <input
          type="text"
          name="author"
          value={currentArticle.author_name || 'admin'}
          readOnly
          className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-600"
        />
        <p className="mt-2 text-xs text-gray-500">Author cannot be changed</p>
      </div>
    ),
    slug: (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide flex items-center gap-2">
          <FiLink size={16} />
          Slug
        </h3>
        <input
          type="text"
          name="slug"
          value={formData.slug}
          onChange={handleChange}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
          placeholder="article-slug"
        />
        <p className="mt-2 text-xs text-gray-500">The "slug" is the URL-friendly version of the name.</p>
      </div>
    ),
    reference_link: (
      currentArticle.source_url ? (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide flex items-center gap-2">
            <FiExternalLink size={16} />
            Reference Link
          </h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <a
                href={currentArticle.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex-1 truncate"
              >
                {currentArticle.source_url}
              </a>
              <FiExternalLink size={14} className="text-gray-400 flex-shrink-0" />
            </div>
            <p className="text-xs text-gray-500">Original source URL for this article.</p>
          </div>
        </div>
      ) : null
    ),
    source: (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide flex items-center gap-2">
          <FiTag size={16} />
          Source
        </h3>
        <div className="space-y-2">
          {categoryOptions.map((option) => (
            <label key={option.value} className="flex items-center">
              <input
                type="radio"
                name="category"
                value={option.value}
                checked={formData.category === option.value}
                onChange={handleChange}
                className="w-4 h-4 text-primary-600 focus:ring-primary-500"
              />
              <span className="ml-2 text-sm text-gray-700">{option.label}</span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-500">Article source type</p>
      </div>
    ),
    categories: (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide flex items-center gap-2">
          <FiTag size={16} />
          Content Categories
        </h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {categoryTree.length === 0 ? (
            <p className="text-sm text-gray-500">
              No categories available.{' '}
              <Link to="/categories" className="text-blue-600 hover:underline">
                Create categories
              </Link>
            </p>
          ) : (
            categoryTree.map((parentCategory) => (
              <div key={parentCategory.id} className="space-y-1">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.category_ids.includes(parentCategory.id)}
                    onChange={(e) => {
                      const newIds = e.target.checked
                        ? [...formData.category_ids, parentCategory.id]
                        : formData.category_ids.filter(id => id !== parentCategory.id)
                      setFormData({ ...formData, category_ids: newIds })
                    }}
                    className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm font-medium text-gray-900">
                    {parentCategory.name}
                  </span>
                </label>
                {parentCategory.children && parentCategory.children.length > 0 && (
                  <div className="ml-6 space-y-1">
                    {parentCategory.children.map((childCategory) => (
                      <label key={childCategory.id} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.category_ids.includes(childCategory.id)}
                          onChange={(e) => {
                            const newIds = e.target.checked
                              ? [...formData.category_ids, childCategory.id]
                              : formData.category_ids.filter(id => id !== childCategory.id)
                            setFormData({ ...formData, category_ids: newIds })
                          }}
                          className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="ml-2 text-sm text-gray-700">
                          {childCategory.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Select content categories (Cricket, Football, etc.)
        </p>
      </div>
    ),
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header with Publish/Draft buttons */}
      <div className="mb-6 flex justify-between items-center border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Edit Article</h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowPreview(true)}
            className="px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium flex items-center gap-1"
            title="Preview article"
          >
            Preview
          </button>
          <button
            onClick={handleSaveDraft}
            disabled={saving}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${formData.status === 'draft'
              ? 'bg-gray-200 text-gray-700'
              : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            onClick={handlePublish}
            disabled={saving}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {saving
              ? (formData.status === 'published' ? 'Updating...' : 'Publishing...')
              : (formData.status === 'published' ? 'Update' : 'Publish')
            }
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Title */}
          <div className="bg-white rounded-lg shadow p-6">
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
              Title *
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              lang="en"
              autoComplete="off"
              spellCheck="true"
              style={{ imeMode: 'auto' }}
              className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Enter article title"
            />
          </div>

          {/* Body Editor */}
          <div className="bg-white rounded-lg shadow p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Content *</label>
            <div className="border border-gray-300 rounded-lg">
              <ReactQuill
                ref={quillRef}
                theme="snow"
                value={formData.body}
                onChange={handleBodyChange}
                modules={modules}
                formats={[
                  'header',
                  'bold', 'italic', 'underline', 'strike',
                  'color', 'background',
                  'list', 'bullet',
                  'align',
                  'link', 'image',
                  'blockquote',
                  'code-block',
                  'videoEmbed', 'socialEmbed'
                ]}
                style={{ height: '400px', marginBottom: '50px' }}
                placeholder="Write your article content here... (Paste YouTube or social media links to auto-embed)"
                className="text-sm"
              />
            </div>
          </div>

          {/* Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <label htmlFor="summary" className="block text-sm font-medium text-gray-700 mb-2">
              Excerpt
            </label>
            <textarea
              id="summary"
              name="summary"
              value={formData.summary}
              onChange={handleChange}
              rows={4}
              lang="en"
              autoComplete="off"
              spellCheck="true"
              style={{ imeMode: 'auto' }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Write an excerpt..."
            />
          </div>

          {/* SEO Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">SEO Metadata</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="meta_title" className="block text-sm font-medium text-gray-700 mb-2">
                  Meta Title
                </label>
                <input
                  type="text"
                  id="meta_title"
                  name="meta_title"
                  value={formData.meta_title}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="meta_description" className="block text-sm font-medium text-gray-700 mb-2">
                  Meta Description
                </label>
                <textarea
                  id="meta_description"
                  name="meta_description"
                  value={formData.meta_description}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="og_title" className="block text-sm font-medium text-gray-700 mb-2">
                  OG Title
                </label>
                <input
                  type="text"
                  id="og_title"
                  name="og_title"
                  value={formData.og_title}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="og_description" className="block text-sm font-medium text-gray-700 mb-2">
                  OG Description
                </label>
                <textarea
                  id="og_description"
                  name="og_description"
                  value={formData.og_description}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sidebarOrder}
              strategy={verticalListSortingStrategy}
            >
              {sidebarOrder.map((id) => {
                const component = sidebarComponents[id]
                if (!component) return null
                return (
                  <SortableSidebarItem key={id} id={id}>
                    {component}
                  </SortableSidebarItem>
                )
              })}
            </SortableContext>
          </DndContext>
        </div>
      </div>


      <MediaLibrary
        isOpen={showMediaLibrary}
        onClose={() => setShowMediaLibrary(false)}
        onSelect={handleMediaSelect}
        initialMediaId={mediaLibraryMode === 'featured' ? (currentArticle?.featured_media_id || currentArticle?.featured_image_id) : null}
        initialUrl={mediaLibraryMode === 'featured' ? currentArticle?.featured_image_url : null}
      />

      {showPreview && (
        <ArticlePreview
          article={currentArticle}
          formData={formData}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div >
  )
}

export default ArticleEdit
