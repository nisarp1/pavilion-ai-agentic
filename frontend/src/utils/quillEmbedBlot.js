/**
 * Custom Quill Blot for embedding iframes and social media content
 * Exports a function to register blots on a specific Quill instance
 */

const registerCustomBlots = (Quill) => {
  const BlockEmbed = Quill.import('blots/block/embed')

  class VideoEmbed extends BlockEmbed {
    static create(value) {
      const node = super.create()
      node.setAttribute('contenteditable', 'false')
      if (typeof value === 'string') {
        node.innerHTML = value
      } else {
        console.warn('VideoEmbed: received non-string value', value)
      }
      return node
    }

    static value(node) {
      if (node.innerHTML) {
        return node.innerHTML
      }
      return {
        src: node.getAttribute('src'),
        width: node.getAttribute('width'),
        height: node.getAttribute('height')
      }
    }
  }

  VideoEmbed.blotName = 'videoEmbed'
  VideoEmbed.tagName = 'div'
  VideoEmbed.className = 'ql-video-embed'

  class SocialEmbed extends BlockEmbed {
    static create(value) {
      const node = super.create()
      node.setAttribute('contenteditable', 'false')
      if (typeof value === 'string') {
        node.innerHTML = value
      }
      return node
    }

    static value(node) {
      return node.innerHTML || ''
    }
  }

  SocialEmbed.blotName = 'socialEmbed'
  SocialEmbed.tagName = 'div'
  SocialEmbed.className = 'ql-social-embed'

  try {
    Quill.register(VideoEmbed, true)
    Quill.register(SocialEmbed, true)
    console.log('✅ Custom embeds registered successfully on provided Quill instance')
  } catch (error) {
    console.error('❌ Error registering custom blots:', error)
  }
}

export { registerCustomBlots }
