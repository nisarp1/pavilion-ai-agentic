/**
 * Normalize a media URL returned by Django so it works in the browser.
 *
 * In dev, Django runs inside Docker (pavilion-django-dev:8000).
 * build_absolute_uri() returns that internal hostname which the browser
 * cannot resolve. We strip the host and let the Vite proxy handle /media/.
 */
export function normalizeMediaUrl(url) {
  if (!url) return url
  try {
    const parsed = new URL(url)
    // If the hostname is the browser's own origin, keep as-is
    if (parsed.origin === window.location.origin) return url
    // Return just the path+query so the Vite proxy (or nginx) serves it
    return parsed.pathname + parsed.search
  } catch {
    // Not a valid absolute URL — already relative, return as-is
    return url
  }
}
