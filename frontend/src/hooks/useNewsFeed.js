import { useEffect, useRef, useCallback } from 'react'

export default function useNewsFeed(onNewArticle) {
  const ws = useRef(null)
  const reconnectTimer = useRef(null)

  const connect = useCallback(() => {
    const wsUrl = `ws://${window.location.hostname}:8000/ws/news-feed/`
    ws.current = new WebSocket(wsUrl)

    ws.current.onopen = () => console.log('[WS] Connected to news feed')

    ws.current.onmessage = (e) => {
      try {
        const article = JSON.parse(e.data)
        onNewArticle(article)
      } catch {}
    }

    ws.current.onclose = () => {
      reconnectTimer.current = setTimeout(connect, 3000)
    }

    ws.current.onerror = () => ws.current.close()
  }, [onNewArticle])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      ws.current?.close()
    }
  }, [connect])
}
