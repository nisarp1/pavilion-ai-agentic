import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../services/api'

// Fetch real-time Google Trends
export const fetchRealtimeTrends = createAsyncThunk(
  'trends/fetchRealtimeTrends',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/rss/feeds/realtime-trends/')
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

// Fetch real-time Twitter Trends for sports in India
export const fetchTwitterTrends = createAsyncThunk(
  'trends/fetchTwitterTrends',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/rss/feeds/twitter-trends/')
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

const trendsSlice = createSlice({
  name: 'trends',
  initialState: {
    trendingTopics: [],
    twitterTrendingTopics: [],
    loading: false,
    twitterLoading: false,
    error: null,
    twitterError: null,
    lastUpdated: null,
    twitterLastUpdated: null,
  },
  reducers: {
    clearTrends: (state) => {
      state.trendingTopics = []
      state.lastUpdated = null
    },
    clearTwitterTrends: (state) => {
      state.twitterTrendingTopics = []
      state.twitterLastUpdated = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRealtimeTrends.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchRealtimeTrends.fulfilled, (state, action) => {
        state.loading = false
        state.trendingTopics = action.payload.trending_topics || []
        state.lastUpdated = action.payload.timestamp || new Date().toISOString()
      })
      .addCase(fetchRealtimeTrends.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload || action.error.message
        state.trendingTopics = []
      })
      .addCase(fetchTwitterTrends.pending, (state) => {
        state.twitterLoading = true
        state.twitterError = null
      })
      .addCase(fetchTwitterTrends.fulfilled, (state, action) => {
        state.twitterLoading = false
        state.twitterTrendingTopics = action.payload.trending_topics || []
        state.twitterLastUpdated = action.payload.timestamp || new Date().toISOString()
      })
      .addCase(fetchTwitterTrends.rejected, (state, action) => {
        state.twitterLoading = false
        state.twitterError = action.payload || action.error.message
        state.twitterTrendingTopics = []
      })
  },
})

export const { clearTrends, clearTwitterTrends } = trendsSlice.actions
export default trendsSlice.reducer

