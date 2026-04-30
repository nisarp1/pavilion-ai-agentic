import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../services/api'

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

export const trackTrendClick = createAsyncThunk(
  'trends/trackTrendClick',
  async (topic) => {
    try {
      await api.post('/rss/feeds/trend-click/', { topic })
    } catch {
      // fire-and-forget — never block the UI on a tracking call
    }
  }
)

export const fetchAgenticTrends = createAsyncThunk(
  'trends/fetchAgenticTrends',
  async ({ forceRefresh = false } = {}, { rejectWithValue }) => {
    try {
      const params = forceRefresh ? { refresh: 'true' } : {}
      const response = await api.get('/rss/feeds/agentic-trends/', { params })
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
    enrichedTrends: [],       // enriched data from agentic pipeline
    twitterTrendingTopics: [],
    twitterEnrichedTrends: [], // enriched twitter trends (same pipeline)
    loading: false,
    twitterLoading: false,
    agenticLoading: false,
    error: null,
    twitterError: null,
    agenticError: null,
    lastUpdated: null,
    twitterLastUpdated: null,
    agenticLastUpdated: null,
    cached: false,
    rssOnly: false,
  },
  reducers: {
    clearTrends: (state) => {
      state.trendingTopics = []
      state.enrichedTrends = []
      state.lastUpdated = null
    },
    clearTwitterTrends: (state) => {
      state.twitterTrendingTopics = []
      state.twitterEnrichedTrends = []
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
        state.enrichedTrends = action.payload.enriched_trends || []
        state.lastUpdated = action.payload.timestamp || new Date().toISOString()
        state.cached = action.payload.cached || false
      })
      .addCase(fetchRealtimeTrends.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload || action.error.message
        state.trendingTopics = []
        state.enrichedTrends = []
      })
      .addCase(fetchTwitterTrends.pending, (state) => {
        state.twitterLoading = true
        state.twitterError = null
      })
      .addCase(fetchTwitterTrends.fulfilled, (state, action) => {
        state.twitterLoading = false
        state.twitterTrendingTopics = action.payload.trending_topics || []
        state.twitterEnrichedTrends = action.payload.enriched_trends || []
        state.twitterLastUpdated = action.payload.timestamp || new Date().toISOString()
      })
      .addCase(fetchTwitterTrends.rejected, (state, action) => {
        state.twitterLoading = false
        state.twitterError = action.payload || action.error.message
        state.twitterTrendingTopics = []
        state.twitterEnrichedTrends = []
      })
      .addCase(fetchAgenticTrends.pending, (state) => {
        state.agenticLoading = true
        state.agenticError = null
      })
      .addCase(fetchAgenticTrends.fulfilled, (state, action) => {
        state.agenticLoading = false
        state.trendingTopics = action.payload.trending_topics || []
        state.enrichedTrends = action.payload.enriched_trends || []
        state.agenticLastUpdated = action.payload.timestamp || new Date().toISOString()
        state.cached = action.payload.cached || false
        state.rssOnly = action.payload.rss_only || false
      })
      .addCase(fetchAgenticTrends.rejected, (state, action) => {
        state.agenticLoading = false
        state.agenticError = action.payload || action.error.message
      })
  },
})

export const { clearTrends, clearTwitterTrends } = trendsSlice.actions
export default trendsSlice.reducer
