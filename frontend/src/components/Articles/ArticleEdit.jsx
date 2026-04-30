import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import PosterEditor from './PosterEditor'
import ArticlePreview from './ArticlePreview'
import { useDispatch, useSelector } from 'react-redux'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { fetchArticle, updateArticle, publishArticle } from '../../store/slices/articleSlice'
import api from '../../services/api'
import { fetchCategoryTree } from '../../store/slices/categorySlice'
import { showSuccess, showError, showInfo } from '../../utils/toast'

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
import { FiImage, FiUser, FiLink, FiTag, FiExternalLink, FiVolume2, FiDownload, FiMove, FiVideo } from 'react-icons/fi'

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
  const [showPosterEditor, setShowPosterEditor] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [voiceAudioUrls, setVoiceAudioUrls] = useState({})
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    summary: '',
    body: '',
    instagram_reel_script: '',
    social_media_poster_text: '',
    social_media_caption: '',
    status: 'draft',
    category: 'reliable_sources',
    category_ids: [],
    author: '',
    meta_title: '',
    meta_description: '',
    og_title: '',
    og_description: '',
    published_at: '',
    video_script: '',
    video_url: '',
    video_audio_url: '',
    video_status: 'idle',
    video_error: '',
    video_format: 'portrait',
    newsroomx_dna: {},
    newsroomx_status: 'idle',
    newsroomx_video_url: '',
    newsroomx_error: '',
  })

  const [sidebarOrder, setSidebarOrder] = useState([
    'status',
    'newsroomx',
    'audio',
    'video_generation',
    'social_poster',
    'featured_image',
    'author',
    'slug',
    'reference_link',
    'source',
    'categories'
  ])

  const [dnaText, setDnaText] = useState('') // New state for raw JSON text

  const isInitialLoad = useRef(true)

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
        const defaultKeys = ['status', 'audio', 'video_generation', 'social_poster', 'featured_image', 'author', 'slug', 'reference_link', 'source', 'categories']
        const merged = [...new Set([...parsed, ...defaultKeys])]
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
        instagram_reel_script: currentArticle.instagram_reel_script || '',
        social_media_poster_text: currentArticle.social_media_poster_text || '',
        social_media_caption: currentArticle.social_media_caption || '',
        status: currentArticle.status || 'draft',
        category: currentArticle.category || 'reliable_sources',
        category_ids: currentArticle.categories?.map(cat => cat.id) || [],
        author: currentArticle.author || '',
        meta_title: currentArticle.meta_title || '',
        meta_description: currentArticle.meta_description || '',
        og_title: currentArticle.og_title || '',
        og_description: currentArticle.og_description || '',
        video_script: currentArticle.video_script || '',
        video_url: currentArticle.video_url || '',
        video_audio_url: currentArticle.video_audio_url || '',
        video_status: currentArticle.video_status || 'idle',
        video_error: currentArticle.video_error || '',
        video_format: currentArticle.video_format || 'portrait',
        published_at: publishedAt,
        newsroomx_dna: currentArticle.newsroomx_dna || {},
        newsroomx_status: currentArticle.newsroomx_status || 'idle',
        newsroomx_video_url: currentArticle.newsroomx_video_url || '',
        newsroomx_error: currentArticle.newsroomx_error || '',
      })
      
      // Initialize DNA text
      if (currentArticle.newsroomx_dna) {
        setDnaText(JSON.stringify(currentArticle.newsroomx_dna, null, 2));
      } else {
        setDnaText('{}');
      }

      // Update video_status in formData even if not initial load to keep UI status updated
      if (!isInitialLoad.current) {
        setFormData(prev => ({
          ...prev,
          video_status: currentArticle.video_status,
          video_url: currentArticle.video_url,
          video_audio_url: currentArticle.video_audio_url,
          video_error: currentArticle.video_error
        }))
      }

      isInitialLoad.current = false
    }
  }, [currentArticle])

  // Poll for updates if the article is in 'fetched' state (likely generating)
  useEffect(() => {
    let intervalId = null;

    // Only poll if we have an article and it's in a state that implies generation might be happening
    if (currentArticle && (
      currentArticle.status === 'fetched' || 
      currentArticle.video_status === 'generating_video' ||
      ['step_a_audio', 'step_b_avatar', 'step_c_composition'].includes(currentArticle.newsroomx_status)
    )) {
      console.log("Polling for updates (Article Status: " + currentArticle.status + ", Video Status: " + currentArticle.video_status + ")...");
      // Poll every 3 seconds
      intervalId = setInterval(() => {
        dispatch(fetchArticle(id));
      }, 3000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [dispatch, id, currentArticle?.status, currentArticle?.video_status]);


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
        ['clean'],
        ['code-block']
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
      const errorMsg = error.response?.data?.error || error.message
      showError(`Failed to generate audio with ${voiceName} voice: ${errorMsg}`)
    } finally {
      setGeneratingAudio(prev => ({ ...prev, [voiceName]: false }))
    }
  }

  const handleGenerateReelAudio = async (voiceName) => {
    if (!formData.instagram_reel_script || !formData.instagram_reel_script.trim()) {
      showError('Reel script cannot be empty.')
      return
    }

    setGeneratingAudio(prev => ({ ...prev, [`reel_${voiceName}`]: true }))
    try {
      // Save changes first to ensure script is saved
      await api.patch(`/articles/${id}/`, { instagram_reel_script: formData.instagram_reel_script })

      const response = await api.post(`/articles/${id}/generate_reel_audio/`, {
        voice_name: voiceName
      })

      if (response.data.reel_audio_url) {
        dispatch(fetchArticle(id))
        showSuccess('Reel audio generated successfully!')
      }
    } catch (error) {
      console.error(`Error generating reel audio:`, error)
      const errorMsg = error.response?.data?.error || error.message
      showError(`Failed to generate reel audio: ${errorMsg}`)
    } finally {
      setGeneratingAudio(prev => ({ ...prev, [`reel_${voiceName}`]: false }))
    }
  }

  const handleGeneratePoster = async () => {
    // Save changes first
    try {
      if (formData.social_media_poster_text !== currentArticle.social_media_poster_text ||
        formData.social_media_caption !== currentArticle.social_media_caption) {
        await api.patch(`/articles/${id}/`, {
          social_media_poster_text: formData.social_media_poster_text,
          social_media_caption: formData.social_media_caption
        })
      }

      setGeneratingAudio(prev => ({ ...prev, poster: true })) // Reuse generating state object

      const response = await api.post(`/articles/${id}/generate_poster/`)

      if (response.data.poster_url) {
        dispatch(fetchArticle(id))
        showSuccess('Poster generated successfully!')
      }
    } catch (error) {
      console.error('Error generating poster:', error)
      const errorMsg = error.response?.data?.error || error.message
      showError(`Failed to generate poster: ${errorMsg}`)
    } finally {
      setGeneratingAudio(prev => ({ ...prev, poster: false }))
    }
  }

  // Helper function to get full audio URL
  const getFullAudioUrl = (audioUrl) => {
    if (!audioUrl) return null
    return audioUrl?.startsWith('http')
      ? audioUrl
      : `http://localhost:8000${audioUrl?.startsWith('/') ? '' : '/'}${audioUrl}`
  }

  const handleGenerateVideoScript = async () => {
    setGeneratingAudio(prev => ({ ...prev, video_script: true }))
    try {
      const response = await api.post(`/articles/${id}/generate_video_script/`, {
        format: formData.video_format
      })
      if (response.data.script) {
        setFormData(prev => ({ ...prev, video_script: response.data.script }))
        showSuccess('Script generated successfully!')
      }
    } catch (error) {
      console.error('Error generating video script:', error)
      showError('Failed to generate script: ' + (error.response?.data?.error || error.message))
    } finally {
      setGeneratingAudio(prev => ({ ...prev, video_script: false }))
    }
  }

  const handleGenerateVideoContent = async () => {
    if (!formData.video_script) {
      showError('Please generate or write a video script first.')
      return
    }

    setGeneratingAudio(prev => ({ ...prev, video_content: true }))
    try {
      const response = await api.post(`/articles/${id}/generate_video_content/`, {
        video_script: formData.video_script,
        format: formData.video_format
      })
      
      if (response.data.status === 'generating_video') {
        dispatch(fetchArticle(id))
        showInfo('Video generation started — this takes 1–2 minutes.')
      }
    } catch (error) {
      console.error('Error generating video:', error)
      showError('Failed to start video generation: ' + (error.response?.data?.error || error.message))
    } finally {
      setGeneratingAudio(prev => ({ ...prev, video_content: false }))
    }
  }

  const handleTriggerNewsroomX = async () => {
    let parsedDna;
    try {
      parsedDna = JSON.parse(dnaText);
    } catch (err) {
      showError("Invalid JSON in DNA field. Please fix before running.");
      return;
    }

    setGeneratingAudio(prev => ({ ...prev, newsroomx: true }))
    try {
      // First save the DNA if it was edited
      await api.patch(`/articles/${id}/`, {
        newsroomx_dna: parsedDna
      })

      const response = await api.post(`/articles/${id}/trigger_newsroomx_pipeline/`, {
        newsroomx_dna: parsedDna
      })

      if (response.data.status) {
        dispatch(fetchArticle(id))
        showInfo('NewsroomX Programmatic Pipeline started!')
      }
    } catch (error) {
      console.error('Error triggering NewsroomX:', error)
      showError('Failed to start NewsroomX pipeline: ' + (error.response?.data?.error || error.message))
    } finally {
      setGeneratingAudio(prev => ({ ...prev, newsroomx: false }))
    }
  }

  const handleFillDefaultDNA = () => {
    const defaultDNA = {
      "pipeline_step": "A_B_C_Sequence",
      "step_A_audio": {
        "engine": "google_chirp_3",
        "ssml": "<speak>ഹലോ, സ്പോർട്സ് വാർത്തകളിലേക്ക് സ്വാഗതം. <break time='500ms'/> ഇന്നത്തെ പ്രധാന വാർത്തകൾ നോക്കാം.</speak>",
        "voice": "ml-IN-Chirp3-HD-Zephyr"
      },
      "step_B_avatar": {
        "service": "DID_API",
        "avatar_url": "https://owyljrj2ayc5s6c1.public.blob.vercel-storage.com/sports_anchor_portrait.png",
        "input": "Use_Audio_From_Step_A"
      },
      "step_C_composition": {
        "service": "Creatomate",
        "template": "newsroom_x_reels_v3",
        "layers": {
          "headline": "ബ്രേക്കിംഗ് ന്യൂസ്",
          "ticker": "കൂടുതൽ വിവരങ്ങൾ ഉടൻ ലഭ്യമാകും • ഫോളോ ചെയ്യൂ",
          "main_media": ""
        }
      }
    };
    setFormData(prev => ({ ...prev, newsroomx_dna: defaultDNA }));
    setDnaText(JSON.stringify(defaultDNA, null, 2));
  };

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
            Audio Comparison (Malayalam Voices)
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Compare all three premium voices for news reading. Generate and play each voice to find the best one.
          </p>

          <div className="space-y-4">
            {/* Chirp Voice */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-gray-800">🥇 Chirp Voice</h4>
                  <p className="text-xs text-gray-500">Best Quality - Most Natural</p>
                </div>
                <button
                  onClick={() => handleGenerateAudio('chirp')}
                  disabled={generatingAudio.chirp}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generatingAudio.chirp ? 'Generating...' : 'Generate'}
                </button>
              </div>
              {voiceAudioUrls.chirp && (
                <audio
                  controls
                  src={getFullAudioUrl(voiceAudioUrls.chirp)}
                  className="w-full"
                  style={{ height: '40px' }}
                >
                  Your browser does not support the audio element.
                </audio>
              )}
              {!voiceAudioUrls.chirp && generatingAudio.chirp === false && (
                <p className="text-xs text-gray-400 italic">Click Generate to create audio with this voice</p>
              )}
            </div>

            {/* Neural2 Voice */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-gray-800">🥈 Neural2 Voice</h4>
                  <p className="text-xs text-gray-500">High Quality - Excellent Prosody</p>
                </div>
                <button
                  onClick={() => handleGenerateAudio('neural2')}
                  disabled={generatingAudio.neural2}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generatingAudio.neural2 ? 'Generating...' : 'Generate'}
                </button>
              </div>
              {voiceAudioUrls.neural2 && (
                <audio
                  controls
                  src={getFullAudioUrl(voiceAudioUrls.neural2)}
                  className="w-full"
                  style={{ height: '40px' }}
                >
                  Your browser does not support the audio element.
                </audio>
              )}
              {!voiceAudioUrls.neural2 && generatingAudio.neural2 === false && (
                <p className="text-xs text-gray-400 italic">Click Generate to create audio with this voice</p>
              )}
            </div>

            {/* WaveNet Voice */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-gray-800">🥉 WaveNet Voice</h4>
                  <p className="text-xs text-gray-500">Premium Quality - Widely Available (Current Default)</p>
                </div>
                <button
                  onClick={() => handleGenerateAudio('wavenet')}
                  disabled={generatingAudio.wavenet}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generatingAudio.wavenet ? 'Generating...' : 'Generate'}
                </button>
              </div>
              {(voiceAudioUrls.wavenet || currentArticle.audio_url) && (
                <audio
                  controls
                  src={getFullAudioUrl(voiceAudioUrls.wavenet || currentArticle.audio_url || currentArticle.audio)}
                  className="w-full"
                  style={{ height: '40px' }}
                >
                  Your browser does not support the audio element.
                </audio>
              )}
              {!voiceAudioUrls.wavenet && !currentArticle.audio_url && generatingAudio.wavenet === false && (
                <p className="text-xs text-gray-400 italic">Click Generate to create audio with this voice</p>
              )}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              💡 <strong>Tip:</strong> Generate all three voices and compare them side by side. The current default audio uses WaveNet voice.
            </p>
          </div>
        </div>
      ) : null
    ),
    social_poster: (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide flex items-center gap-2">
          <FiImage size={16} />
          Social Media Poster
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Headline Text</label>
            <textarea
              name="social_media_poster_text"
              value={formData.social_media_poster_text}
              onChange={handleChange}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-primary-500 focus:border-primary-500"
              placeholder="Short headline for the poster..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Caption / Summary</label>
            <textarea
              name="social_media_caption"
              value={formData.social_media_caption}
              onChange={handleChange}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-primary-500 focus:border-primary-500"
              placeholder="Short summary for the poster..."
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleGeneratePoster}
              disabled={generatingAudio.poster}
              className="flex-1 flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {generatingAudio.poster ? 'Processing...' : 'Auto Generate'}
            </button>

            <button
              onClick={() => setShowPosterEditor(true)}
              className="flex-1 flex items-center justify-center px-4 py-2 border border-indigo-600 rounded-md shadow-sm text-sm font-medium text-indigo-600 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Manual Edit
            </button>
          </div>

          {(currentArticle.poster_url || currentArticle.generated_poster) && (
            <div className="mt-4">
              <p className="text-xs font-medium text-gray-700 mb-2">Generated Poster:</p>
              <a
                href={currentArticle.poster_url || currentArticle.generated_poster}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src={currentArticle.poster_url || currentArticle.generated_poster}
                  alt="Generated Poster"
                  className="w-full rounded-lg border border-gray-200 hover:opacity-90 transition-opacity"
                />
              </a>
            </div>
          )}
        </div>
      </div>
    ),
    video_generation: (
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-primary-600">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide flex items-center gap-2">
          <FiVideo size={16} className="text-primary-600" />
          Auto-Video Generation
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Format</label>
            <select
              name="video_format"
              value={formData.video_format}
              onChange={handleChange}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="portrait">Portrait (9:16) - Reel/Short</option>
              <option value="landscape">Landscape (16:9) - YouTube</option>
            </select>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-medium text-gray-700">Video Script (Malayalam)</label>
              <button
                onClick={handleGenerateVideoScript}
                disabled={generatingAudio.video_script}
                className="text-[10px] text-primary-600 hover:text-primary-800 font-bold uppercase tracking-tighter"
              >
                {generatingAudio.video_script ? 'Generating...' : '✨ Regenerate AI Script'}
              </button>
            </div>
            <textarea
              name="video_script"
              value={formData.video_script}
              onChange={handleChange}
              rows={5}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:ring-primary-500 focus:border-primary-500"
              placeholder="Generate script first or write your own..."
            />
          </div>

          <button
            onClick={handleGenerateVideoContent}
            disabled={generatingAudio.video_content || formData.video_status === 'generating_video' || !formData.video_script}
            className={`w-full flex items-center justify-center px-4 py-3 rounded-lg shadow-sm text-sm font-bold text-white transition-all ${
              formData.video_status === 'generating_video'
                ? 'bg-amber-500 animate-pulse'
                : 'bg-primary-600 hover:bg-primary-700 active:scale-95'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {formData.video_status === 'generating_video' 
              ? 'Generating Video (D-ID)...' 
              : generatingAudio.video_content ? 'Starting...' : '🎬 Generate Final Video'}
          </button>

          {/* Result Section */}
          {(formData.video_url || formData.video_audio_url) && (
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
              {formData.video_audio_url && (
                <div className="bg-gray-50 p-2 rounded-lg">
                  <p className="text-[10px] text-gray-500 font-bold mb-1 uppercase">Narration Audio</p>
                  <audio
                    controls
                    src={formData.video_audio_url}
                    className="w-full h-8"
                  />
                </div>
              )}
              
              {formData.video_url && (
                <div className="bg-gray-50 p-2 rounded-lg">
                  <p className="text-[10px] text-gray-500 font-bold mb-1 uppercase">Final Video</p>
                  <video
                    controls
                    src={formData.video_url}
                    className="w-full rounded-md shadow-inner bg-black"
                  />
                  <a 
                    href={formData.video_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 mt-2 text-xs text-primary-600 hover:underline"
                  >
                    <FiDownload size={12} /> Download Video
                  </a>
                </div>
              )}
            </div>
          )}

          {formData.video_status === 'failed' && (
            <div className="p-2 bg-red-50 text-red-600 text-xs rounded border border-red-100 italic flex flex-col gap-1">
              <p className="font-bold text-[10px] uppercase tracking-wider">Generation failed</p>
              <p>{formData.video_error || "Check logs or try again with a different script."}</p>
              {formData.video_error && (
                <button
                  onClick={() => showError(formData.video_error)}
                  className="text-left underline mt-1 opacity-70 hover:opacity-100"
                >
                  View full error detail
                </button>
              )}
            </div>
          )}
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
              src={currentArticle.featured_image_url}
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
    newsroomx: (
      <div className="bg-white rounded-lg shadow p-6 border-2 border-primary-100">
        <h3 className="text-sm font-semibold text-primary-700 mb-4 uppercase tracking-wide flex items-center gap-2">
          <FiVideo size={16} />
          NewsroomX Orchestrator
        </h3>
        <p className="text-xs text-gray-500 mb-4 italic">
          Programmatic API Pipeline: Audio (Chirp 3) → Avatar (D-ID) → Composition (Creatomate)
        </p>

        <div className="space-y-4">
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-400">STATUS</span>
              <span className={`text-xs font-bold uppercase ${
                formData.newsroomx_status === 'completed' ? 'text-green-600' : 
                formData.newsroomx_status === 'failed' ? 'text-red-600' : 'text-blue-600'
              }`}>
                {(formData.newsroomx_status || 'idle').replace(/_/g, ' ')}
              </span>
            </div>
            {formData.newsroomx_error && (
              <p className="text-[10px] text-red-500 mt-1 bg-red-50 p-1 rounded border border-red-100 leading-tight">
                {formData.newsroomx_error}
              </p>
            )}
          </div>

          <button
            onClick={handleTriggerNewsroomX}
            disabled={generatingAudio.newsroomx || !dnaText}
            className="w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-xs font-bold shadow-sm flex items-center justify-center gap-2"
          >
            {generatingAudio.newsroomx ? 'Starting...' : '🚀 Run Programmatic Pipeline'}
          </button>

          {(!dnaText || dnaText === '{}') && (
            <button
              onClick={handleFillDefaultDNA}
              className="w-full py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-[10px] font-bold border border-gray-300"
            >
              🪄 Use Default DNA Template
            </button>
          )}

          {formData.newsroomx_video_url && (
            <div className="mt-4">
              <p className="text-xs font-bold text-gray-500 mb-2">FINAL COMPOSITION</p>
              <video 
                src={formData.newsroomx_video_url} 
                controls 
                className="w-full rounded-lg shadow-inner bg-black"
                style={{ maxHeight: '300px' }}
              />
              <a 
                href={formData.newsroomx_video_url} 
                target="_blank" 
                rel="noreferrer"
                className="mt-2 text-[10px] text-blue-600 hover:underline flex items-center gap-1"
              >
                <FiDownload size={10} /> Download Final Video
              </a>
            </div>
          )}
          
          <div className="mt-4">
             <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Orchestration DNA (JSON)</label>
             <textarea
                value={dnaText}
                onChange={(e) => setDnaText(e.target.value)}
                rows={10}
                className="w-full text-[10px] font-mono p-2 bg-gray-900 text-green-400 rounded border border-gray-700 focus:ring-0 whitespace-pre"
                style={{ tabSize: 2 }}
             />
          </div>
        </div>
      </div>
    )
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

          {/* Instagram Reel Script */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <label htmlFor="instagram_reel_script" className="block text-sm font-medium text-gray-700">
                Instagram Reel Script
              </label>
              <button
                type="button"
                onClick={() => handleGenerateReelAudio('elevenlabs')}
                disabled={generatingAudio.reel_elevenlabs || !formData.instagram_reel_script}
                className="px-3 py-1.5 text-xs bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 shadow-sm font-medium"
              >
                <FiVolume2 />
                {generatingAudio.reel_elevenlabs ? 'Generating (ElevenLabs)...' : '🎙️ Generate Voice (ElevenLabs)'}
              </button>
            </div>

            <textarea
              id="instagram_reel_script"
              name="instagram_reel_script"
              value={formData.instagram_reel_script || ''}
              onChange={handleChange}
              rows={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent mb-4 font-mono text-sm"
              placeholder="Script for Instagram Reel (auto-generated by AI during article generation)..."
            />

            {/* Reel Audio Player */}
            {currentArticle?.reel_audio_url && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <p className="text-xs text-purple-800 font-medium mb-2">Generated Reel Audio:</p>
                <audio
                  controls
                  src={getFullAudioUrl(currentArticle.reel_audio_url)}
                  className="w-full h-8"
                >
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}
          </div>

          {/* Social Media Content */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Social Media Content</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="social_media_poster_text" className="block text-sm font-medium text-gray-700 mb-2">
                  Poster Text (Short & Punchy)
                </label>
                <input
                  type="text"
                  id="social_media_poster_text"
                  name="social_media_poster_text"
                  value={formData.social_media_poster_text || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-medium"
                  placeholder="Short text for poster image..."
                />
                <p className="mt-1 text-xs text-gray-500">2-5 words max. Use this for the text overlay on the social media image.</p>
              </div>

              <div>
                <label htmlFor="social_media_caption" className="block text-sm font-medium text-gray-700 mb-2">
                  Social Media Caption
                </label>
                <textarea
                  id="social_media_caption"
                  name="social_media_caption"
                  value={formData.social_media_caption || ''}
                  onChange={handleChange}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Engaging caption with hashtags..."
                />
              </div>
            </div>
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

      {showPosterEditor && (
        <PosterEditor
          articleId={id}
          onClose={() => setShowPosterEditor(false)}
          onSaveSuccess={(newUrl) => {
            dispatch(fetchArticle(id));
            showSuccess("Poster updated successfully!");
            setShowPosterEditor(false);
          }}
        />
      )}

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
