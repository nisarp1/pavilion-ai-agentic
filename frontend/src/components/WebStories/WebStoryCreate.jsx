import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import WebStoryForm from './WebStoryForm'
import { createWebStory } from '../../store/slices/webstorySlice'
import { showError } from '../../utils/toast'

const extractErrorMessage = (error) => {
  if (typeof error === 'string') {
    return error
  }
  const data = error?.response?.data
  if (!data) {
    return error?.message || 'Unknown error'
  }
  if (typeof data === 'string') {
    return data
  }
  if (Array.isArray(data)) {
    return data.join(', ')
  }
  return Object.entries(data)
    .map(([field, detail]) => {
      const text = Array.isArray(detail) ? detail.join(', ') : detail
      return `${field}: ${text}`
    })
    .join('\n')
}

function WebStoryCreate() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (payload) => {
    setSaving(true)
    try {
      await dispatch(createWebStory(payload)).unwrap()
      navigate('/webstories')
    } catch (error) {
      console.error('Failed to create story', error)
      const message = extractErrorMessage(error)
      showError(`Failed to create story: ${message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Create Web Story</h1>
        <p className="text-gray-600 mt-1">
          Build a new Pavilion web story with slides and cover image.
        </p>
      </div>

      <WebStoryForm
        initialData={{}}
        onSubmit={handleSubmit}
        saving={saving}
        submitLabel="Create Story"
      />
    </div>
  )
}

export default WebStoryCreate

