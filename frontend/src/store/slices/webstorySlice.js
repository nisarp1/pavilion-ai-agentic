import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../services/api'

const normalizeListResponse = (payload) => {
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload.results)) return payload.results
  return []
}

const errorPayload = (error) => error.response?.data || error.message || 'Unknown error'

export const fetchWebStories = createAsyncThunk(
  'webstories/fetchWebStories',
  async (params = {}, { rejectWithValue }) => {
    try {
      const response = await api.get('/webstories/', { params })
      return response.data
    } catch (error) {
      return rejectWithValue(errorPayload(error))
    }
  }
)

export const fetchWebStory = createAsyncThunk(
  'webstories/fetchWebStory',
  async (id, { rejectWithValue }) => {
    try {
      const response = await api.get(`/webstories/${id}/`)
      return response.data
    } catch (error) {
      return rejectWithValue(errorPayload(error))
    }
  }
)

export const createWebStory = createAsyncThunk(
  'webstories/createWebStory',
  async (data, { rejectWithValue }) => {
    try {
      const response = await api.post('/webstories/', data)
      return response.data
    } catch (error) {
      return rejectWithValue(errorPayload(error))
    }
  }
)

export const updateWebStory = createAsyncThunk(
  'webstories/updateWebStory',
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const response = await api.patch(`/webstories/${id}/`, data)
      return response.data
    } catch (error) {
      return rejectWithValue(errorPayload(error))
    }
  }
)

export const deleteWebStory = createAsyncThunk(
  'webstories/deleteWebStory',
  async (id, { rejectWithValue }) => {
    try {
      await api.delete(`/webstories/${id}/`)
      return id
    } catch (error) {
      return rejectWithValue(errorPayload(error))
    }
  }
)

export const publishWebStory = createAsyncThunk(
  'webstories/publishWebStory',
  async (id, { rejectWithValue }) => {
    try {
      const response = await api.post(`/webstories/${id}/publish/`)
      return response.data
    } catch (error) {
      return rejectWithValue(errorPayload(error))
    }
  }
)

const webstorySlice = createSlice({
  name: 'webstories',
  initialState: {
    items: [],
    currentStory: null,
    loading: false,
    error: null,
  },
  reducers: {
    clearCurrentStory: (state) => {
      state.currentStory = null
    },
    clearWebStoryError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWebStories.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchWebStories.fulfilled, (state, action) => {
        state.loading = false
        state.items = normalizeListResponse(action.payload)
      })
      .addCase(fetchWebStories.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      .addCase(fetchWebStory.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchWebStory.fulfilled, (state, action) => {
        state.loading = false
        state.currentStory = action.payload
      })
      .addCase(fetchWebStory.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      .addCase(createWebStory.fulfilled, (state, action) => {
        state.items.unshift(action.payload)
      })
      .addCase(updateWebStory.fulfilled, (state, action) => {
        const index = state.items.findIndex((story) => story.id === action.payload.id)
        if (index !== -1) {
          state.items[index] = action.payload
        }
        if (state.currentStory?.id === action.payload.id) {
          state.currentStory = action.payload
        }
      })
      .addCase(deleteWebStory.fulfilled, (state, action) => {
        state.items = state.items.filter((story) => story.id !== action.payload)
        if (state.currentStory?.id === action.payload) {
          state.currentStory = null
        }
      })
      .addCase(publishWebStory.fulfilled, (state, action) => {
        const index = state.items.findIndex((story) => story.id === action.payload.id)
        if (index !== -1) {
          state.items[index] = action.payload
        }
        if (state.currentStory?.id === action.payload.id) {
          state.currentStory = action.payload
        }
      })
  },
})

export const { clearCurrentStory, clearWebStoryError } = webstorySlice.actions
export default webstorySlice.reducer

