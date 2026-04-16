/**
 * Branding Loader Utility
 *
 * Detects tenant from current domain and loads branding configuration.
 * Supports:
 * - Subdomains: acme.app.example.com → tenant slug "acme"
 * - Custom domains: acme.com → lookup via API
 */

import api from '../services/api'

/**
 * Extract tenant identifier from current location
 * @returns {Object} { type: 'subdomain'|'custom'|'unknown', value: string }
 */
export function extractTenantFromDomain() {
  const hostname = window.location.hostname
  const parts = hostname.split('.')

  // Handle localhost (development)
  if (hostname === 'localhost' || hostname.startsWith('127.')) {
    // Get tenant from header or default to first tenant
    const tenantId = localStorage.getItem('tenant_id')
    return { type: 'localStorage', value: tenantId }
  }

  // Try to detect subdomain pattern: acme.app.example.com
  // The app domain should be something like app.example.com
  // So if there are more than 3 parts, first part is subdomain
  if (parts.length > 3 && parts[1] === 'app') {
    // acme.app.example.com → acme
    return { type: 'subdomain', value: parts[0] }
  }

  // Otherwise assume it's a custom domain
  return { type: 'custom', value: hostname }
}

/**
 * Load branding for the current tenant
 * @param {Function} dispatch - Redux dispatch function
 * @param {Function} actions - Branding actions (fetchBrandingRequest, fetchBrandingSuccess, fetchBrandingFailure)
 * @returns {Promise}
 */
export async function loadBrandingForTenant(dispatch, actions) {
  const { fetchBrandingRequest, fetchBrandingSuccess, fetchBrandingFailure } = actions

  dispatch(fetchBrandingRequest())

  try {
    const tenantInfo = extractTenantFromDomain()

    let response

    if (tenantInfo.type === 'subdomain') {
      // Load branding by subdomain
      response = await api.get('/tenants/branding/', {
        params: { subdomain: tenantInfo.value },
      })
    } else if (tenantInfo.type === 'custom') {
      // Load branding by custom domain
      response = await api.get('/tenants/branding/', {
        params: { domain: tenantInfo.value },
      })
    } else if (tenantInfo.type === 'localStorage') {
      // Development: use stored tenant ID
      response = await api.get('/tenants/lookup/', {
        params: { tenant_id: tenantInfo.value },
      })
    } else {
      throw new Error('Could not determine tenant')
    }

    const { branding, id, name, slug } = response.data

    dispatch(
      fetchBrandingSuccess({
        branding: branding || {},
        tenant: { id, name, slug },
      })
    )

    // Store tenant ID for cross-tab communication
    localStorage.setItem('tenant_id', id)

    // Apply CSS variables for branding
    applyBrandingStyles(branding || {})

    return { id, name, slug, branding }
  } catch (error) {
    console.error('Failed to load branding:', error)
    dispatch(fetchBrandingFailure(error.message))
    // Apply default styles
    applyBrandingStyles({})
    throw error
  }
}

/**
 * Apply branding CSS variables to the document
 * @param {Object} branding - Branding configuration object
 */
export function applyBrandingStyles(branding) {
  const root = document.documentElement

  const colors = {
    '--primary-color': branding.primary_color || '#1f2937',
    '--secondary-color': branding.secondary_color || '#10b981',
    '--accent-color': branding.accent_color || '#3b82f6',
    '--header-bg': branding.header_bg_color || '#ffffff',
    '--header-text': branding.header_text_color || '#1f2937',
  }

  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })

  // Apply font family if specified
  if (branding.font_family) {
    document.body.style.fontFamily = branding.font_family
  }

  // Apply favicon if specified
  if (branding.favicon_url) {
    const link =
      document.querySelector("link[rel*='icon']") ||
      document.createElement('link')
    link.rel = 'icon'
    link.href = branding.favicon_url
    document.head.appendChild(link)
  }

  // Apply page title if company name is specified
  if (branding.company_name) {
    document.title = `${branding.company_name} - Content Management`
  }
}

/**
 * Set tenant context for API calls
 * @param {string} tenantId - UUID of the tenant
 */
export function setTenantContext(tenantId) {
  localStorage.setItem('tenant_id', tenantId)

  // Update axios default headers
  api.defaults.headers.common['X-Tenant-ID'] = tenantId
}

/**
 * Get current tenant ID from storage or context
 * @returns {string|null}
 */
export function getCurrentTenantId() {
  return localStorage.getItem('tenant_id')
}
