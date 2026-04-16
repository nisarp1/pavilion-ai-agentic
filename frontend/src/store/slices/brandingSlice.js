/**
 * Redux slice for managing tenant branding configuration.
 *
 * Branding includes:
 * - Logo URL
 * - Favicon URL
 * - Primary, secondary, accent colors
 * - Company name
 * - Font family
 * - Custom domain
 * - Header background/text colors
 */

import { createSlice } from '@reduxjs/toolkit'

const defaultBranding = {
  logo_url: null,
  favicon_url: null,
  primary_color: '#1f2937',
  secondary_color: '#10b981',
  accent_color: '#3b82f6',
  company_name: 'Pavilion',
  company_domain: null,
  font_family: 'Inter, sans-serif',
  header_bg_color: '#ffffff',
  header_text_color: '#1f2937',
}

const brandingSlice = createSlice({
  name: 'branding',
  initialState: {
    config: defaultBranding,
    isLoading: false,
    error: null,
    tenant: null, // Current tenant info
  },
  reducers: {
    // Load branding request
    fetchBrandingRequest: (state) => {
      state.isLoading = true
      state.error = null
    },

    // Load branding success
    fetchBrandingSuccess: (state, action) => {
      const { branding, tenant } = action.payload
      state.config = {
        ...defaultBranding,
        ...branding,
      }
      state.tenant = tenant
      state.isLoading = false
      state.error = null
    },

    // Load branding failure
    fetchBrandingFailure: (state, action) => {
      state.isLoading = false
      state.error = action.payload
      state.config = defaultBranding // Fallback to defaults
    },

    // Reset branding to defaults
    resetBranding: (state) => {
      state.config = defaultBranding
      state.tenant = null
      state.error = null
      state.isLoading = false
    },

    // Set specific branding value (for testing)
    setBrandingValue: (state, action) => {
      const { key, value } = action.payload
      state.config[key] = value
    },
  },
})

export const {
  fetchBrandingRequest,
  fetchBrandingSuccess,
  fetchBrandingFailure,
  resetBranding,
  setBrandingValue,
} = brandingSlice.actions

export default brandingSlice.reducer

// Selectors
export const selectBranding = (state) => state.branding.config
export const selectBrandingLoading = (state) => state.branding.isLoading
export const selectBrandingError = (state) => state.branding.error
export const selectTenant = (state) => state.branding.tenant
