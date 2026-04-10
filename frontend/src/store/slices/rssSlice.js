import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../services/api'

// Fetch all RSS feeds
export const fetchRSSFeeds = createAsyncThunk(
  'rss/fetchFeeds',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/rss/feeds/')
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

// Create RSS feed
export const createRSSFeed = createAsyncThunk(
  'rss/createFeed',
  async (feedData, { rejectWithValue }) => {
    try {
      const response = await api.post('/rss/feeds/', feedData)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

// Update RSS feed
export const updateRSSFeed = createAsyncThunk(
  'rss/updateFeed',
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const response = await api.patch(`/rss/feeds/${id}/`, data)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

// Delete RSS feed
export const deleteRSSFeed = createAsyncThunk(
  'rss/deleteFeed',
  async (id, { rejectWithValue }) => {
    try {
      await api.delete(`/rss/feeds/${id}/`)
      return id
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

// Fetch from a specific feed
export const fetchRSSFeed = createAsyncThunk(
  'rss/fetchFeed',
  async (feedId, { rejectWithValue }) => {
    try {
      const response = await api.post(`/rss/feeds/${feedId}/fetch/`)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

// Fetch from all feeds
export const fetchAllRSSFeeds = createAsyncThunk(
  'rss/fetchAllFeeds',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.post('/rss/feeds/fetch_all/')
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

const rssSlice = createSlice({
  name: 'rss',
  initialState: {
    feeds: [],
    loading: false,
    error: null,
    fetching: false,
    fetchError: null,
  },
  reducers: {
    clearError: (state) => {
      state.error = null
      state.fetchError = null
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch feeds
      .addCase(fetchRSSFeeds.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchRSSFeeds.fulfilled, (state, action) => {
        state.loading = false
        state.feeds = action.payload.results || action.payload
      })
      .addCase(fetchRSSFeeds.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Create feed
      .addCase(createRSSFeed.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createRSSFeed.fulfilled, (state, action) => {
        state.loading = false
        state.feeds.push(action.payload)
      })
      .addCase(createRSSFeed.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Update feed
      .addCase(updateRSSFeed.fulfilled, (state, action) => {
        const index = state.feeds.findIndex((feed) => feed.id === action.payload.id)
        if (index !== -1) {
          state.feeds[index] = action.payload
        }
      })
      // Delete feed
      .addCase(deleteRSSFeed.fulfilled, (state, action) => {
        state.feeds = state.feeds.filter((feed) => feed.id !== action.payload)
      })
      // Fetch from feed
      .addCase(fetchRSSFeed.pending, (state) => {
        state.fetching = true
        state.fetchError = null
      })
      .addCase(fetchRSSFeed.fulfilled, (state) => {
        state.fetching = false
      })
      .addCase(fetchRSSFeed.rejected, (state, action) => {
        state.fetching = false
        state.fetchError = action.payload
      })
      // Fetch all feeds
      .addCase(fetchAllRSSFeeds.pending, (state) => {
        state.fetching = true
        state.fetchError = null
      })
      .addCase(fetchAllRSSFeeds.fulfilled, (state) => {
        state.fetching = false
      })
      .addCase(fetchAllRSSFeeds.rejected, (state, action) => {
        state.fetching = false
        state.fetchError = action.payload
      })
  },
})

export const { clearError } = rssSlice.actions
export default rssSlice.reducer

