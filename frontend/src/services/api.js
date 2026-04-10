import axios from 'axios'

const normalizeBaseUrl = (url) => {
  const fallback = '/api/'
  if (!url || typeof url !== 'string') {
    return fallback
  }

  const trimmed = url.trim()
  if (trimmed.length === 0) {
    return fallback
  }

  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL)

console.log('API_BASE_URL:', API_BASE_URL)

const isAbsoluteUrl = (url) => /^https?:\/\//i.test(url)

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    const tenantId = localStorage.getItem('tenant_id')
    if (tenantId) {
      config.headers['X-Tenant-ID'] = tenantId
    }
    
    if (typeof config.url === 'string' && !isAbsoluteUrl(config.url)) {
      config.url = config.url.replace(/^\/+/, '')
    }
    
    // If data is FormData, remove Content-Type header to let browser set it with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }
    
    console.log('API Request:', config.method?.toUpperCase(), config.baseURL + config.url, config.params)
    
    return config
  },
  (error) => {
    console.error('API Request Error:', error)
    return Promise.reject(error)
  }
)

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.config.method?.toUpperCase(), response.config.url, response.status, response.data)
    return response
  },
  async (error) => {
    console.error('API Error:', error.config?.method?.toUpperCase(), error.config?.url, error.response?.status, error.response?.data || error.message)
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const refreshToken = localStorage.getItem('refresh_token')
        if (refreshToken) {
        const response = await axios.post(`${API_BASE_URL}auth/refresh/`, {
            refresh: refreshToken,
          })
          const { access } = response.data
          localStorage.setItem('access_token', access)
          originalRequest.headers.Authorization = `Bearer ${access}`
          return api(originalRequest)
        }
      } catch (refreshError) {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export default api

