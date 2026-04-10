/**
 * Quill module for auto-embedding YouTube and social media links on paste
 */
import { convertUrlToEmbed, isEmbeddableUrl } from './embedUtils'

class AutoEmbedModule {
  constructor(quill, options) {
    this.quill = quill
    this.options = options || {}
    
    // Setup paste handler after a short delay to ensure editor is ready
    setTimeout(() => {
      this.setupPasteHandler()
    }, 100)
  }
  
  setupPasteHandler() {
    if (!this.quill || !this.quill.root) {
      console.warn('AutoEmbed: Quill or root not available')
      return
    }
    
    const editorElement = this.quill.root
    
    this.handlePaste = (e) => {
      try {
        const clipboardData = e.clipboardData
        if (!clipboardData) return
        
        const pastedText = clipboardData.getData('text/plain')
        if (!pastedText) return
        
        const trimmedText = pastedText.trim()
        if (isEmbeddableUrl(trimmedText)) {
          e.preventDefault()
          e.stopPropagation()
          
          const embedHtml = convertUrlToEmbed(trimmedText)
          if (embedHtml) {
            const range = this.quill.getSelection(true) || { index: this.quill.getLength(), length: 0 }
            const wrapperHtml = `<div style="margin: 1rem 0; text-align: center; max-width: 100%;">${embedHtml}</div>`
            
            this.quill.clipboard.dangerouslyPasteHTML(range.index, wrapperHtml, 'user')
            
            setTimeout(() => {
              const newRange = this.quill.getSelection()
              if (newRange) {
                this.quill.setSelection(newRange.index + 1, 'silent')
              }
            }, 10)
          }
        }
      } catch (error) {
        console.error('AutoEmbed paste handler error:', error)
      }
    }
    
    editorElement.addEventListener('paste', this.handlePaste, true)
  }
  
  destroy() {
    if (this.quill && this.quill.root && this.handlePaste) {
      this.quill.root.removeEventListener('paste', this.handlePaste, true)
    }
  }
}

export default AutoEmbedModule

