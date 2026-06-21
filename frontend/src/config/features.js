// Build-time feature flags.
//
// STUDIOS_ENABLED — controls whether the Video/Social Studio surfaces (routes +
// nav links) are present in the UI. Default ON so the dev/full build is
// unaffected; the article-only client build sets VITE_ENABLE_STUDIOS=false.
export const STUDIOS_ENABLED = import.meta.env.VITE_ENABLE_STUDIOS !== 'false'
