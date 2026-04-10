/**
 * Utility functions for detecting and converting URLs to embeds
 */

/**
 * Extract YouTube video ID from various YouTube URL formats
 */
export function getYouTubeVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match && match[1]) {
      return match[1]
    }
  }
  return null
}

/**
 * Extract Twitter/X tweet ID from URL
 */
export function getTwitterTweetId(url) {
  const match = url.match(/twitter\.com\/(?:\w+\/)?status(?:es)?\/(\d+)/i) ||
    url.match(/x\.com\/(?:\w+\/)?status(?:es)?\/(\d+)/i)
  return match ? match[1] : null
}

/**
 * Extract Instagram post ID from URL
 */
export function getInstagramPostId(url) {
  const match = url.match(/instagram\.com\/(?:p|reel)\/([^\/\?#]+)/i)
  return match ? match[1] : null
}

/**
 * Extract Facebook post ID from URL
 */
export function getFacebookPostId(url) {
  const match = url.match(/facebook\.com\/(?:[^\/]+\/)?(?:posts|videos|watch)\/([^\/\?#]+)/i)
  return match ? match[1] : null
}

/**
 * Generate YouTube embed HTML
 */
export function generateYouTubeEmbed(videoId) {
  return `<iframe width="100%" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="max-width: 560px; height: 315px; aspect-ratio: 16 / 9;"></iframe>`
}

/**
 * Generate Twitter/X embed HTML
 */
export function generateTwitterEmbed(tweetId) {
  // We include text in the anchor so it's not empty if JS fails
  return `<blockquote class="twitter-tweet"><a href="https://twitter.com/i/status/${tweetId}">Loading Tweet ${tweetId}...</a></blockquote>`
}

/**
 * Generate Instagram embed HTML
 */
export function generateInstagramEmbed(postId) {
  return `<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/p/${postId}/" data-instgrm-version="14"><a href="https://www.instagram.com/p/${postId}/">Loading Instagram Post...</a></blockquote>`
}

/**
 * Generate Facebook embed HTML
 */
export function generateFacebookEmbed(postId, url) {
  return `<div class="fb-post" data-href="${url}" data-width="500"><a href="${url}">Loading Facebook Post...</a></div>`
}

/**
 * Check if URL is a social media link that can be embedded
 */
export function isEmbeddableUrl(url) {
  if (!url || typeof url !== 'string') return false

  const embeddablePatterns = [
    /youtube\.com|youtu\.be/i,
    /twitter\.com|x\.com/i,
    /instagram\.com/i,
    /facebook\.com/i,
  ]

  return embeddablePatterns.some(pattern => pattern.test(url))
}

/**
 * Convert URL to embed HTML if it's an embeddable URL
 */
export function convertUrlToEmbed(url) {
  if (!url || typeof url !== 'string') return null

  // YouTube
  const youtubeId = getYouTubeVideoId(url)
  if (youtubeId) {
    return generateYouTubeEmbed(youtubeId)
  }

  // Twitter/X
  const twitterId = getTwitterTweetId(url)
  if (twitterId) {
    return generateTwitterEmbed(twitterId)
  }

  // Instagram
  const instagramId = getInstagramPostId(url)
  if (instagramId) {
    return generateInstagramEmbed(instagramId)
  }

  // Facebook
  const facebookId = getFacebookPostId(url)
  if (facebookId) {
    return generateFacebookEmbed(facebookId, url)
  }

  return null
}

/**
 * Extract URLs from clipboard text
 */
export function extractUrls(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g
  return text.match(urlRegex) || []
}

