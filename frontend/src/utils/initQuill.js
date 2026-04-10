/**
 * Initialize Quill modules - called once when app loads
 * This is a safe wrapper that won't crash the app if Quill isn't available
 */
let moduleRegistered = false

export function registerAutoEmbedModule() {
  if (moduleRegistered) {
    return true
  }
  
  try {
    // Use dynamic import to avoid blocking app startup
    import('quill').then((QuillModule) => {
      const Quill = QuillModule.default || QuillModule
      import('./quillAutoEmbed').then((AutoEmbedModule) => {
        const Module = AutoEmbedModule.default || AutoEmbedModule
        if (Quill && Module) {
          Quill.register('modules/autoEmbed', Module)
          moduleRegistered = true
          console.log('✅ AutoEmbed module registered')
        }
      }).catch(() => {
        // Silently fail
      })
    }).catch(() => {
      // Silently fail - registration will happen when ReactQuill components mount
    })
    return false
  } catch (error) {
    console.warn('⚠️ AutoEmbed module registration deferred')
    return false
  }
}

// Try to register immediately, but don't block app startup
registerAutoEmbedModule()

