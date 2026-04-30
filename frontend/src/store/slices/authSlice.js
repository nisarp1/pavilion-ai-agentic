import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../services/api'

export const login = createAsyncThunk(
  'auth/login',
  async ({ username, password }, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/login/', { username, password })
      const { access, refresh } = response.data
      localStorage.setItem('access_token', access)
      localStorage.setItem('refresh_token', refresh)
      
      // Fetch tenants after login
      const tenantsResponse = await api.get('/tenants/my_tenants/')
      const tenants = tenantsResponse.data
      if (tenants.length > 0) {
        localStorage.setItem('tenant_id', tenants[0].tenant.id)
      }
      
      return { access, refresh, tenants }
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

export const fetchTenants = createAsyncThunk(
  'auth/fetchTenants',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/tenants/my_tenants/')
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

export const verifyToken = createAsyncThunk(
  'auth/verifyToken',
  async (_, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('access_token')
      if (!token) {
        throw new Error('No token found')
      }
      await api.post('/auth/verify/', { token })
      return { token }
    } catch (error) {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    token: localStorage.getItem('access_token') || null,
    isAuthenticated: !!localStorage.getItem('access_token'),
    loading: false,
    error: null,
    tenants: [], // List of {tenant, role} objects
    activeTenant: localStorage.getItem('tenant_id') || null,
    currentRole: null,
  },
  reducers: {
    logout: (state) => {
      state.token = null
      state.isAuthenticated = false
      state.tenants = []
      state.activeTenant = null
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('tenant_id')
    },
    loginWithGoogle: (state, action) => {
      const { access, refresh, tenant } = action.payload
      state.token = access
      state.isAuthenticated = true
      state.activeTenant = tenant.id
      state.currentRole = tenant.role
      localStorage.setItem('access_token', access)
      localStorage.setItem('refresh_token', refresh)
      localStorage.setItem('tenant_id', tenant.id)
    },
    setActiveTenant: (state, action) => {
      state.activeTenant = action.payload
      localStorage.setItem('tenant_id', action.payload)
      const membership = state.tenants.find(m => m.tenant.id === action.payload)
      state.currentRole = membership ? membership.role : null
    },
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false
        state.isAuthenticated = true
        state.token = action.payload.access
        state.tenants = action.payload.tenants
        if (action.payload.tenants.length > 0) {
          const firstTenantId = action.payload.tenants[0].tenant.id
          if (!state.activeTenant) {
            state.activeTenant = firstTenantId
            state.currentRole = action.payload.tenants[0].role
          } else {
            const activeMembership = action.payload.tenants.find(m => m.tenant.id === state.activeTenant)
            state.currentRole = activeMembership ? activeMembership.role : action.payload.tenants[0].role
          }
        }
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      .addCase(fetchTenants.fulfilled, (state, action) => {
        state.tenants = action.payload
        if (action.payload.length > 0) {
          if (!state.activeTenant) {
            state.activeTenant = action.payload[0].tenant.id
            state.currentRole = action.payload[0].role
            localStorage.setItem('tenant_id', action.payload[0].tenant.id)
          } else {
            const activeMembership = action.payload.find(m => m.tenant.id === state.activeTenant)
            state.currentRole = activeMembership ? activeMembership.role : action.payload[0].role
          }
        }
      })
      .addCase(verifyToken.fulfilled, (state) => {
        state.isAuthenticated = true
      })
      .addCase(verifyToken.rejected, (state) => {
        state.isAuthenticated = false
        state.token = null
        state.tenants = []
        state.activeTenant = null
      })
  },
})

export const { logout, loginWithGoogle, setActiveTenant, clearError } = authSlice.actions
export default authSlice.reducer

