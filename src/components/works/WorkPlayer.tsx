import { Anchor, AspectRatio, Stack } from '@mantine/core'
import { useEffect, useRef } from 'react'

import {
  EMPTY_PLAYER_INFO,
  LISTENING_MESSAGE,
  YOUTUBE_EMBED_ORIGIN,
  embedUrl,
  mergePlayerInfo,
  readPlayerMessage,
  shouldMarkWatched,
} from '../../lib/works/watch'
import { canonicalYouTubeUrl } from '../../lib/youtube'

/** The player may not be ready when the iframe loads: ask again until it answers, then stop.
 * Tries are counted only after the load, so a slow connection does not use them up */
const LISTEN_INTERVAL_MS = 500
const LISTEN_RETRIES = 20

/**
 * Tour video played inside the app. YouTube's script is not loaded (the CSP has no script-src
 * for it): the page asks the iframe to post its state, and reads the position from the
 * messages. onWatched fires once, at the end or at 90% (src/lib/works/watch.ts).
 */
export function WorkPlayer({
  videoId,
  title,
  onWatched,
}: {
  videoId: string
  title: string
  onWatched: () => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const loaded = useRef(false)
  const onWatchedRef = useRef(onWatched)
  useEffect(() => {
    onWatchedRef.current = onWatched
  }, [onWatched])

  useEffect(() => {
    let info = EMPTY_PLAYER_INFO
    let heard = false
    let fired = false
    let tries = 0
    loaded.current = false

    function onMessage(event: MessageEvent) {
      // Only the embedded player itself: any page can post a message to this window
      if (event.origin !== YOUTUBE_EMBED_ORIGIN) return
      if (event.source !== frame.current?.contentWindow) return
      const patch = readPlayerMessage(event.data)
      if (!patch) return
      heard = true
      info = mergePlayerInfo(info, patch)
      if (!fired && shouldMarkWatched(info)) {
        fired = true
        onWatchedRef.current()
      }
    }

    window.addEventListener('message', onMessage)
    const timer = window.setInterval(() => {
      if (!loaded.current) return
      tries += 1
      if (heard || tries > LISTEN_RETRIES) {
        window.clearInterval(timer)
        return
      }
      frame.current?.contentWindow?.postMessage(LISTENING_MESSAGE, YOUTUBE_EMBED_ORIGIN)
    }, LISTEN_INTERVAL_MS)

    return () => {
      window.removeEventListener('message', onMessage)
      window.clearInterval(timer)
    }
  }, [videoId])

  return (
    <Stack gap="xs">
      <AspectRatio ratio={16 / 9}>
        <iframe
          ref={frame}
          src={embedUrl(videoId, window.location.origin)}
          title={`${title} のルームツアー動画`}
          // The app sends `referrer-policy: no-referrer` on every response, and YouTube refuses
          // to play an embed that arrives without a referrer (player error 153)
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={(event) => {
            loaded.current = true
            event.currentTarget.contentWindow?.postMessage(LISTENING_MESSAGE, YOUTUBE_EMBED_ORIGIN)
          }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          style={{ border: 0 }}
        />
      </AspectRatio>
      {/* The way out when the embed cannot play (removed, embedding disabled) */}
      <Anchor href={canonicalYouTubeUrl(videoId)} target="_blank" rel="noreferrer" size="sm">
        YouTube で開く
      </Anchor>
    </Stack>
  )
}
