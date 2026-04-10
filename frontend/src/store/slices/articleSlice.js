import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../services/api'

export const fetchArticles = createAsyncThunk(
  'articles/fetchArticles',
  async ({ status, category, page = 1, page_size }, { rejectWithValue }) => {
    try {
      const params = {
        page,
        _t: Date.now() // Prevent caching
      }
      if (status) params.status = status
      if (category) params.category = category
      if (page_size) params.page_size = page_size
      const response = await api.get('/articles/', { params })
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

export const fetchArticle = createAsyncThunk(
  'articles/fetchArticle',
  async (id, { rejectWithValue }) => {
    try {
      // Add timestamp to prevent caching, especially important for polling
      const response = await api.get(`/articles/${id}/?_t=${Date.now()}`)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

export const fetchArticleStatus = createAsyncThunk(
  'articles/fetchArticleStatus',
  async (id, { rejectWithValue }) => {
    try {
      // Add timestamp to prevent caching
      const response = await api.get(`/articles/${id}/?_t=${Date.now()}`)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

export const createArticle = createAsyncThunk(
  'articles/createArticle',
  async (articleData, { rejectWithValue }) => {
    try {
      const response = await api.post('/articles/', articleData)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

export const updateArticle = createAsyncThunk(
  'articles/updateArticle',
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const response = await api.patch(`/articles/${id}/`, data)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

export const generateArticle = createAsyncThunk(
  'articles/generateArticle',
  async (articleId, { rejectWithValue }) => {
    try {
      const response = await api.post(`/articles/${articleId}/generate/`)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

export const publishArticle = createAsyncThunk(
  'articles/publishArticle',
  async (articleId, { rejectWithValue }) => {
    try {
      const response = await api.post(`/articles/${articleId}/publish/`)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

export const archiveArticle = createAsyncThunk(
  'articles/archiveArticle',
  async (articleId, { rejectWithValue }) => {
    try {
      const response = await api.post(`/articles/${articleId}/archive/`)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

export const deleteArticle = createAsyncThunk(
  'articles/deleteArticle',
  async (articleId, { rejectWithValue }) => {
    try {
      await api.delete(`/articles/${articleId}/`)
      return { id: articleId }
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

export const fetchTrends = createAsyncThunk(
  'articles/fetchTrends',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.post('/rss/feeds/fetch-trends/')
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

export const fetchAllFeeds = createAsyncThunk(
  'articles/fetchAllFeeds',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.post('/rss/feeds/fetch_all/')
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

export const bulkUpdateArticles = createAsyncThunk(
  'articles/bulkUpdateArticles',
  async ({ article_ids, updates }, { rejectWithValue }) => {
    try {
      const response = await api.post('/articles/bulk_update/', {
        article_ids,
        updates
      })
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

const articleSlice = createSlice({
  name: 'articles',
  initialState: {
    items: [],
    currentArticle: null,
    pagination: {
      count: 0,
      next: null,
      previous: null,
    },
    loading: false,
    error: null,
    generatingIds: [], // Array of IDs currently being generated
    publishingIds: [], // Array of IDs currently being published
  },
  reducers: {
    clearCurrentArticle: (state) => {
      state.currentArticle = null
    },
    clearError: (state) => {
      state.error = null
    },
    addGeneratingId: (state, action) => {
      if (!state.generatingIds.includes(action.payload)) {
        state.generatingIds.push(action.payload)
      }
    },
    removeGeneratingId: (state, action) => {
      state.generatingIds = state.generatingIds.filter(id => id !== action.payload)
    },
    addPublishingId: (state, action) => {
      if (!state.publishingIds.includes(action.payload)) {
        state.publishingIds.push(action.payload)
      }
    },
    removePublishingId: (state, action) => {
      state.publishingIds = state.publishingIds.filter(id => id !== action.payload)
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchArticles.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchArticles.fulfilled, (state, action) => {
        state.loading = false
        state.items = action.payload.results || action.payload
        state.pagination = {
          count: action.payload.count || action.payload.length,
          next: action.payload.next,
          previous: action.payload.previous,
        }
      })
      .addCase(fetchArticles.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      .addCase(fetchArticle.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchArticle.fulfilled, (state, action) => {
        state.loading = false
        state.currentArticle = action.payload
      })
      .addCase(fetchArticle.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      .addCase(fetchArticleStatus.fulfilled, (state, action) => {
        // Only update the article in the list effectively "silently"
        // Do NOT touch currentArticle or loading state to ensure unrelated edits aren't affected
        const index = state.items.findIndex((item) => item.id === action.payload.id)
        if (index !== -1) {
          state.items[index] = action.payload
        }
      })
      .addCase(createArticle.fulfilled, (state, action) => {
        state.items.unshift(action.payload)
      })
      .addCase(updateArticle.fulfilled, (state, action) => {
        const index = state.items.findIndex((item) => item.id === action.payload.id)
        if (index !== -1) {
          state.items[index] = action.payload
        }
        if (state.currentArticle?.id === action.payload.id) {
          state.currentArticle = action.payload
        }
      })
      .addCase(generateArticle.fulfilled, (state, action) => {
        // Article generation started
      })
      .addCase(publishArticle.fulfilled, (state, action) => {
        const index = state.items.findIndex((item) => item.id === action.payload.id)
        if (index !== -1) {
          state.items[index] = action.payload
        }
        if (state.currentArticle?.id === action.payload.id) {
          state.currentArticle = action.payload
        }
      })
      .addCase(archiveArticle.fulfilled, (state, action) => {
        const index = state.items.findIndex((item) => item.id === action.payload.id)
        if (index !== -1) {
          state.items[index] = action.payload
        }
        if (state.currentArticle?.id === action.payload.id) {
          state.currentArticle = action.payload
        }
      })
      .addCase(deleteArticle.fulfilled, (state, action) => {
        state.items = state.items.filter((item) => item.id !== action.payload.id)
        if (state.currentArticle?.id === action.payload.id) {
          state.currentArticle = null
        }
      })
      .addCase(bulkUpdateArticles.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(bulkUpdateArticles.fulfilled, (state, action) => {
        state.loading = false
        // Refresh the list to show updated articles
      })
      .addCase(bulkUpdateArticles.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
  },
})

export const { clearCurrentArticle, clearError, addGeneratingId, removeGeneratingId, addPublishingId, removePublishingId } = articleSlice.actions
export default articleSlice.reducer

