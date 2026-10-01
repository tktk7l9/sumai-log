/**
 * Watching a tour video inside the app (/works). The embedded player is driven without
 * loading YouTube's script: after the page posts LISTENING_MESSAGE to the iframe, the player
 * posts its state back as JSON strings, and these functions read them.
 */

export const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com'

/** Asks the embedded player to start posting its state to this window */
export const LISTENING_MESSAGE = JSON.stringify({
  event: 'listening',
  id: 'sumai-log',
  channel: 'widget',
})

/** playerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering */
export type PlayerInfo = { currentTime: number; duration: number; playerState: number }

export const EMPTY_PLAYER_INFO: PlayerInfo = { currentTime: 0, duration: 0, playerState: -1 }

const INFO_KEYS = ['currentTime', 'duration', 'playerState'] as const

/** The numbers carried by one message from the player, or null when it is not one of ours */
export function readPlayerMessage(raw: unknown): Partial<PlayerInfo> | null {
  if (typeof raw !== 'string') return null
  let message: unknown
  try {
    message = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof message !== 'object' || message === null) return null
  const { event, info } = message as { event?: unknown; info?: unknown }

  if (event === 'onStateChange') {
    return typeof info === 'number' ? { playerState: info } : null
  }
  if (
    (event !== 'infoDelivery' && event !== 'initialDelivery') ||
    typeof info !== 'object' ||
    !info
  ) {
    return null
  }
  const patch: Partial<PlayerInfo> = {}
  for (const key of INFO_KEYS) {
    const value = (info as Record<string, unknown>)[key]
    if (typeof value === 'number' && Number.isFinite(value)) patch[key] = value
  }
  return Object.keys(patch).length > 0 ? patch : null
}

export function mergePlayerInfo(prev: PlayerInfo, patch: Partial<PlayerInfo>): PlayerInfo {
  return { ...prev, ...patch }
}

/** Watched = the player reported the end, or the position reached 90% of a known length */
export function shouldMarkWatched(info: PlayerInfo): boolean {
  if (info.playerState === 0) return true
  return info.duration > 0 && info.currentTime / info.duration >= 0.9
}

export function embedUrl(videoId: string, origin: string): string {
  const params = new URLSearchParams({ enablejsapi: '1', playsinline: '1', rel: '0', origin })
  return `${YOUTUBE_EMBED_ORIGIN}/embed/${videoId}?${params}`
}
