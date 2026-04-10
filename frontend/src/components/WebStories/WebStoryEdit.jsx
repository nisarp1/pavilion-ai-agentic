import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate, useParams } from 'react-router-dom'
import WebStoryForm from './WebStoryForm'
import {
  fetchWebStory,
  updateWebStory,
  publishWebStory,
  deleteWebStory,
  clearCurrentStory,
} from '../../store/slices/webstorySlice'
import { FiCheckCircle, FiTrash2 } from 'react-icons/fi'

function WebStoryEdit() {
  const { id } = useParams()
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { currentStory, loading } = useSelector((state) => state.webstories)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    dispatch(fetchWebStory(id))
    return () => {
      dispatch(clearCurrentStory())
    }
  }, [dispatch, id])

  const handleSubmit = async (payload) => {
    setSaving(true)
    try {
      await dispatch(updateWebStory({ id, data: payload })).unwrap()
      navigate('/webstories')
    } catch (error) {
      console.error('Failed to save story', error)
      alert('Failed to save story. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    setPublishing(true)
    try {
      await dispatch(publishWebStory(id)).unwrap()
      alert('Story published successfully.')
      navigate('/webstories')
    } catch (error) {
      console.error('Failed to publish story', error)
      alert('Publishing failed. Please try again.')
    } finally {
      setPublishing(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this story permanently?')) return
    try {
      await dispatch(deleteWebStory(id)).unwrap()
      navigate('/webstories')
    } catch (error) {
      alert('Failed to delete story. Please try again.')
    }
  }

  if (loading && !currentStory) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!currentStory) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <p className="text-gray-600">Web story not found.</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Edit Web Story</h1>
          <p className="text-gray-500">
            Last updated {new Date(currentStory.updated_at).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleDelete}
            className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 flex items-center gap-2"
          >
            <FiTrash2 size={16} />
            Delete
          </button>
          {currentStory.status !== 'published' && (
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 disabled:opacity-50"
            >
              <FiCheckCircle size={16} />
              {publishing ? 'Publishing...' : 'Publish'}
            </button>
          )}
        </div>
      </div>

      <WebStoryForm
        initialData={currentStory}
        onSubmit={handleSubmit}
        saving={saving}
        submitLabel="Save Changes"
      />
    </div>
  )
}

export default WebStoryEdit

