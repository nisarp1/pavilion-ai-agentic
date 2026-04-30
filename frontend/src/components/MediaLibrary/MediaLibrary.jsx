import { useState, useEffect, useRef, useCallback } from 'react'
import { FiSearch, FiUpload, FiX, FiImage, FiCheck, FiGlobe, FiDownload, FiCrop, FiZoomIn, FiZoomOut } from 'react-icons/fi'
import Cropper from 'react-easy-crop'
import api from '../../services/api'
import { showSuccess, showError } from '../../utils/toast'

function MediaLibrary({ isOpen, onClose, onSelect, initialMediaId, initialUrl }) {
  const [activeTab, setActiveTab] = useState('library') // 'library' or 'search'
  const [media, setMedia] = useState([])
  const [searchResults, setSearchResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMedia, setSelectedMedia] = useState(null)
  const [selectedExternal, setSelectedExternal] = useState(null)
  const fileInputRef = useRef(null)

  // Cropping State
  const [isCropping, setIsCropping] = useState(false)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [aspect, setAspect] = useState(16 / 9)
  const [aspectLabel, setAspectLabel] = useState('16:9 (Featured)')
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [croppingImage, setCroppingImage] = useState(null) // Media item being cropped

  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'library') {
        fetchMedia()
      } else if (searchQuery && activeTab === 'search') {
        // Optional: Auto-search if query exists when switching tabs?
        // For now, let user trigger search manually or on enter
      }
    }
  }, [isOpen, activeTab])

  // Clear selection when switching tabs, unless it matches initial
  useEffect(() => {
    if (activeTab === 'search') {
      setSelectedMedia(null)
    }
    setSelectedExternal(null)
    setIsCropping(false)
  }, [activeTab])

  const fetchMedia = async () => {
    setLoading(true)
    try {
      const params = {}
      if (searchQuery && activeTab === 'library') {
        params.search = searchQuery
      }
      const response = await api.get('/media/', { params })
      const mediaData = response.data.results || response.data || []
      const mediaList = Array.isArray(mediaData) ? mediaData : []
      setMedia(mediaList)

      // Auto-select match if present and no selection exists
      if (!selectedMedia) {
        let found = null;

        if (initialMediaId) {
          found = mediaList.find(m => m.id === initialMediaId);
        }

        // Fallback to URL matching if ID didn't find anything
        if (!found && initialUrl) {
          // Extract filename or path to fuzzy match, or match exactly
          // Backend URLs might be absolute or relative, so checking 'endsWith' is safer
          // Assuming initialUrl is like "http://.../image.jpg" and media.url is similar
          // Or media.url is "/media/..."

          // Simple check: does one contain the other?
          found = mediaList.find(m => {
            if (m.url === initialUrl) return true;
            // Try to match by filename if full URL differs
            const mName = m.url.split('/').pop();
            const iName = initialUrl.split('/').pop();
            return mName === iName;
          });
        }

        if (found) {
          setSelectedMedia(found);
        }
      }

    } catch (error) {
      console.error('Error fetching media:', error)
      setMedia([])
    } finally {
      setLoading(false)
    }
  }

  const handleExternalSearch = async (e) => {
    if (e) e.preventDefault()
    if (!searchQuery.trim()) return

    setLoading(true)
    setSearchResults([]) // Clear previous results
    try {
      const response = await api.get('/media/search_external/', {
        params: { query: searchQuery }
      })
      setSearchResults(response.data.results || [])
    } catch (error) {
      console.error('Error searching external images:', error)
      showError('Failed to search for images.')
    } finally {
      setLoading(false)
    }
  }

  const handleExternalSelect = async () => {
    if (!selectedExternal) return

    setUploading(true) // Reuse uploading state
    try {
      // Download and save the external image to library
      const response = await api.post('/media/save_external/', {
        image_url: selectedExternal.url,
        title: selectedExternal.title
      })

      const newMedia = response.data

      // If successful, select this new media and notify parent
      if (onSelect) {
        onSelect(newMedia)
        onClose()
      }
    } catch (error) {
      console.error('Error saving external image:', error)
      showError(`Failed to import image: ${error.response?.data?.error || error.message}`)
    } finally {
      setUploading(false)
    }
  }

  const uploadFiles = async (files) => {
    if (files.length === 0) return

    setUploading(true)
    try {
      const uploadPromises = files.map(file => {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('title', file.name)
        return api.post('/media/', formData)
      })

      await Promise.all(uploadPromises)
      await fetchMedia()
    } catch (error) {
      console.error('Error uploading media:', error)
      const errorMessage = error.response?.data?.detail ||
        error.response?.data?.file?.[0] ||
        error.message ||
        'Failed to upload image(s). Please try again.'
      showError(`Upload failed: ${errorMessage}`)
    } finally {
      setUploading(false)
    }
  }

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || [])
    uploadFiles(files)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Handle paste events
  useEffect(() => {
    const handlePaste = (e) => {
      if (!isOpen || activeTab !== 'library' || isCropping) return

      const items = e.clipboardData?.items
      if (!items) return

      const files = []
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile()
          if (file) files.push(file)
        }
      }

      if (files.length > 0) {
        e.preventDefault()
        uploadFiles(files)
      }
    }

    if (isOpen) {
      window.addEventListener('paste', handlePaste)
    }
    return () => window.removeEventListener('paste', handlePaste)
  }, [isOpen, activeTab, isCropping])

  const handleSelect = (mediaItem) => {
    setSelectedMedia(mediaItem)
  }

  const handleSelectExternal = (item) => {
    setSelectedExternal(item)
  }

  const handleConfirm = () => {
    if (activeTab === 'library') {
      if (selectedMedia && onSelect) {
        onSelect(selectedMedia)
        onClose()
      }
    } else {
      handleExternalSelect()
    }
  }

  // Cropping Handlers
  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const startCropping = () => {
    if (selectedMedia) {
      setCroppingImage(selectedMedia)
      setIsCropping(true)
      setZoom(1)
      setCrop({ x: 0, y: 0 })
      // Default to 16:9
      setAspect(16 / 9)
      setAspectLabel('16:9 (Featured)')
    }
  }

  const handleSaveCrop = async () => {
    if (!croppingImage || !croppedAreaPixels) return

    setUploading(true)
    try {
      const response = await api.post(`/media/${croppingImage.id}/crop_image/`, {
        x: Math.round(croppedAreaPixels.x),
        y: Math.round(croppedAreaPixels.y),
        width: Math.round(croppedAreaPixels.width),
        height: Math.round(croppedAreaPixels.height)
      })

      const newMedia = response.data
      await fetchMedia()
      // Select the new cropped image
      setSelectedMedia(newMedia)
      setIsCropping(false)
      setCroppingImage(null)

    } catch (error) {
      console.error('Error saving cropped image:', error)
      showError(`Failed to save cropped image: ${error.response?.data?.error || error.message}`)
    } finally {
      setUploading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col h-[90vh]"> {/* Fixed height for consistency */}
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-xl font-bold text-gray-800">
              {isCropping ? 'Edit Image' : 'Media Library'}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <FiX size={24} />
            </button>
          </div>

          {/* Tabs (Hidden if Cropping) */}
          {!isCropping && (
            <div className="flex border-b border-gray-200 px-6 flex-shrink-0">
              <button
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'library' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('library')}
              >
                <FiImage size={16} />
                Library
              </button>
              <button
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'search' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('search')}
              >
                <FiGlobe size={16} />
                Google Search
              </button>
            </div>
          )}

          {/* Toolbar (Hidden if Cropping) */}
          {!isCropping && (
            <div className="p-4 border-b border-gray-200 space-y-4 flex-shrink-0">
              <div className="flex flex-col sm:flex-row gap-4 justify-between">
                {/* Search Bar */}
                <form onSubmit={activeTab === 'search' ? handleExternalSearch : (e) => { e.preventDefault(); fetchMedia() }} className="relative flex-1">
                  <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="text"
                    placeholder={activeTab === 'library' ? "Search your uploads..." : "Search Google Images..."}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-20 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  {activeTab === 'search' && (
                    <button
                      type="submit"
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 px-3 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200 font-medium"
                    >
                      Search
                    </button>
                  )}
                </form>

                {/* Actions */}
                {activeTab === 'library' && (
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                      title="Upload or Paste (Ctrl+V) images"
                    >
                      <FiUpload size={18} />
                      {uploading ? 'Uploading...' : 'Upload'}
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      accept="image/*"
                      multiple
                      className="hidden"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Main Content Area */}
          <div className="flex-1 overflow-hidden bg-gray-50 relative flex flex-col">
            {isCropping ? (
              // CROPPING VIEW
              <div className="flex-1 relative bg-black">
                <Cropper
                  image={croppingImage?.url}
                  crop={crop}
                  zoom={zoom}
                  aspect={aspect}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                  objectFit="contain" // Ensure whole image is visible to start
                />
              </div>
            ) : (
              // NORMAL GRID VIEW
              <div className="flex-1 overflow-y-auto p-6">
                {loading ? (
                  <div className="flex flex-col items-center justify-center h-64 gap-3">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
                    <p className="text-gray-500 text-sm">{activeTab === 'search' ? 'Searching images...' : 'Loading library...'}</p>
                  </div>
                ) : (activeTab === 'library' ? (
                  // Library Grid
                  media.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                      <FiImage size={48} className="mb-4" />
                      <p>No images found</p>
                      <p className="text-sm mt-2">Upload images to get started</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {media.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => handleSelect(item)}
                          className={`relative group cursor-pointer border-2 rounded-lg overflow-hidden transition-all bg-white shadow-sm hover:shadow-md ${selectedMedia?.id === item.id
                            ? 'border-primary-600 ring-2 ring-primary-200'
                            : 'border-gray-200 hover:border-primary-300'
                            }`}
                        >
                          <div className="aspect-square bg-gray-100">
                            <img
                              src={item.url}
                              alt={item.alt_text || item.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          {selectedMedia?.id === item.id && (
                            <div className="absolute top-2 right-2 bg-primary-600 text-white rounded-full p-1 shadow-sm">
                              <FiCheck size={16} />
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 text-white p-2 text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity">
                            {item.title}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  // External Search Grid
                  searchResults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                      <FiGlobe size={48} className="mb-4" />
                      <p>{searchQuery ? 'No results found.' : 'Enter a search term to find images.'}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {searchResults.map((item, index) => (
                        <div
                          key={index}
                          onClick={() => handleSelectExternal(item)}
                          className={`relative group cursor-pointer border-2 rounded-lg overflow-hidden transition-all bg-white shadow-sm hover:shadow-md ${selectedExternal?.url === item.url
                            ? 'border-primary-600 ring-2 ring-primary-200'
                            : 'border-gray-200 hover:border-primary-300'
                            }`}
                        >
                          <div className="aspect-square bg-gray-100 relative">
                            <img
                              src={item.thumbnail || item.url}
                              alt={item.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            <div className="absolute bottom-2 right-2 bg-black bg-opacity-50 text-white text-[10px] px-1 rounded">
                              {item.width}x{item.height}
                            </div>
                          </div>
                          {selectedExternal?.url === item.url && (
                            <div className="absolute top-2 right-2 bg-primary-600 text-white rounded-full p-1 shadow-sm">
                              <FiCheck size={16} />
                            </div>
                          )}
                          <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white rounded p-1 shadow-sm" title="External Source">
                            <FiGlobe size={12} />
                          </div>
                          <div className="p-2 text-xs">
                            <p className="truncate font-medium text-gray-700">{item.title}</p>
                            <p className="truncate text-gray-400 mt-0.5">{item.source}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ))}
              </div>
            )}

            {/* Cropping Controls Overlay */}
            {isCropping && (
              <div className="bg-white p-4 border-t border-gray-200 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Aspect Ratio: {aspectLabel}</span>
                  <div className="flex gap-2">
                    {[
                      { name: '16:9', ratio: 16 / 9, label: '16:9 (Featured)' },
                      { name: '9:16', ratio: 9 / 16, label: '9:16 (Story)' },
                      { name: '1:1', ratio: 1 / 1, label: '1:1 (Square)' },
                      { name: 'Free', ratio: null, label: 'Free' }
                    ].map((opt) => (
                      <button
                        key={opt.name}
                        onClick={() => { setAspect(opt.ratio); setAspectLabel(opt.label) }}
                        className={`px-3 py-1 text-xs rounded border ${aspect === opt.ratio ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                      >
                        {opt.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <FiZoomOut size={16} className="text-gray-500" />
                  <input
                    type="range"
                    value={zoom}
                    min={1}
                    max={3}
                    step={0.1}
                    aria-labelledby="Zoom"
                    onChange={(e) => setZoom(e.target.value)}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <FiZoomIn size={16} className="text-gray-500" />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-white flex-shrink-0">
            <div>
              {/* Left side actions */}
              {!isCropping && activeTab === 'library' && selectedMedia && (
                <button
                  onClick={startCropping}
                  className="flex items-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <FiCrop size={16} />
                  Edit Image
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (isCropping) {
                    setIsCropping(false)
                    setCroppingImage(null)
                  } else {
                    onClose()
                  }
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>

              {isCropping ? (
                <button
                  onClick={handleSaveCrop}
                  disabled={uploading}
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {uploading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Saving...
                    </>
                  ) : (
                    'Save Crop'
                  )}
                </button>
              ) : (
                <button
                  onClick={handleConfirm}
                  disabled={activeTab === 'library' ? !selectedMedia : !selectedExternal || uploading}
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {uploading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Importing...
                    </>
                  ) : (
                    activeTab === 'library' ? 'Select Image' : 'Import & Select'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MediaLibrary

