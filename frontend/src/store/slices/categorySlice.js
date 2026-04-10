import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../services/api'

// Fetch all categories
export const fetchCategories = createAsyncThunk(
  'categories/fetchCategories',
  async (params = {}, { rejectWithValue }) => {
    try {
      const { parent_only, is_active } = params
      const queryParams = new URLSearchParams()
      if (parent_only) queryParams.append('parent_only', parent_only)
      if (is_active !== undefined) {
        // Convert boolean to string if needed
        queryParams.append('is_active', is_active === true || is_active === 'true' ? 'true' : 'false')
      }
      
      const response = await api.get(`/categories/?${queryParams.toString()}`)
      // Handle paginated response or direct array
      const data = response.data
      return Array.isArray(data) ? data : (data.results || data)
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

// Fetch category tree
export const fetchCategoryTree = createAsyncThunk(
  'categories/fetchCategoryTree',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/categories/tree/')
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

// Create category
export const createCategory = createAsyncThunk(
  'categories/createCategory',
  async (categoryData, { rejectWithValue }) => {
    try {
      const response = await api.post('/categories/', categoryData)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

// Update category
export const updateCategory = createAsyncThunk(
  'categories/updateCategory',
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const response = await api.patch(`/categories/${id}/`, data)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

// Delete category
export const deleteCategory = createAsyncThunk(
  'categories/deleteCategory',
  async (id, { rejectWithValue }) => {
    try {
      await api.delete(`/categories/${id}/`)
      return id
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

// Batch update categories (for drag and drop reordering)
export const batchUpdateCategories = createAsyncThunk(
  'categories/batchUpdate',
  async (updates, { rejectWithValue }) => {
    try {
      const response = await api.post('/categories/batch_update/', { updates })
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

const categorySlice = createSlice({
  name: 'categories',
  initialState: {
    categories: [],
    categoryTree: [],
    loading: false,
    error: null,
  },
  reducers: {
    clearCategories: (state) => {
      state.categories = []
      state.categoryTree = []
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch categories
      .addCase(fetchCategories.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.loading = false
        state.categories = action.payload
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
      // Fetch category tree
      .addCase(fetchCategoryTree.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchCategoryTree.fulfilled, (state, action) => {
        state.loading = false
        state.categoryTree = action.payload
      })
      .addCase(fetchCategoryTree.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
      // Create category
      .addCase(createCategory.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createCategory.fulfilled, (state, action) => {
        state.loading = false
        // Don't modify categories array here - let fetchCategoryTree handle it
      })
      .addCase(createCategory.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
      // Update category
      .addCase(updateCategory.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateCategory.fulfilled, (state, action) => {
        state.loading = false
        const index = state.categories.findIndex(cat => cat.id === action.payload.id)
        if (index !== -1) {
          state.categories[index] = action.payload
        }
      })
      .addCase(updateCategory.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
      // Delete category
      .addCase(deleteCategory.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(deleteCategory.fulfilled, (state, action) => {
        state.loading = false
        state.categories = state.categories.filter(cat => cat.id !== action.payload)
      })
      .addCase(deleteCategory.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
  },
})

export const { clearCategories } = categorySlice.actions
export default categorySlice.reducer

