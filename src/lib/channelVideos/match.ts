import { sqlValue } from '../works/sql'

/**
 * Linking a work to its tour video by name, for works whose page has no embedded video: the
 * same vendor's channel often has a video whose title names the work (「〇〇の家」 ->
 * 【ルームツアー】〇〇の家 …). Used by scripts/import-channel-videos.ts.
 */

export type MatchableWork = {
  sourceUrl: string
  title: string
  vendorId: string | null
  youtubeVideoId: string | null
}

export type MatchableVideo = {
  videoId: string
  title: string
  vendorId: string | null
  kind: 'video' | 'short' | 'live'
}

/** Shorter names (「緒」) appear inside too many unrelated titles */
const MIN_NAME_LENGTH = 2
const TOUR = /room\s*tour|ルームツアー/i

/**
 * The name a video title would use: what is inside 「」 when there is one, else the title up to
 * its reading or subtitle (～, 〜, （, (, _ or a full-width space). 「普添の家」 ～ふてんのいえ～ -> 普添の家,
 * 一期荘（いちごそう） -> 一期荘
 */
export function workNameOf(title: string): string {
  const quoted = /「([^」]+)」/.exec(title)?.[1]
  // Not at an ASCII space: English names have them (WEAVE HOUSE must not shrink to WEAVE)
  return (quoted ?? title.replace(/[～〜（(_　].*$/s, '')).trim()
}

/**
 * Pairs of (work, video) for works without a video: a video of the same vendor, not a short,
 * whose title contains the work's name. When several match, tour videos win; a work still left
 * with more than one, or a video claimed by more than one work, is not linked at all (a missing
 * link is better than a wrong one).
 */
export function matchWorksToVideos(
  works: MatchableWork[],
  videos: MatchableVideo[],
): { sourceUrl: string; videoId: string }[] {
  const taken = new Set(works.map((w) => w.youtubeVideoId).filter(Boolean))
  const candidates = works.flatMap((work) => {
    const name = workNameOf(work.title)
    if (work.youtubeVideoId || !work.vendorId || name.length < MIN_NAME_LENGTH) return []
    let hits = videos.filter(
      (v) =>
        v.vendorId === work.vendorId &&
        v.kind !== 'short' &&
        !taken.has(v.videoId) &&
        v.title.includes(name),
    )
    if (hits.length > 1) hits = hits.filter((v) => TOUR.test(v.title))
    const [only] = hits
    return hits.length === 1 && only ? [{ sourceUrl: work.sourceUrl, videoId: only.videoId }] : []
  })
  const claims = new Map<string, number>()
  for (const { videoId } of candidates) claims.set(videoId, (claims.get(videoId) ?? 0) + 1)
  return candidates.filter(({ videoId }) => claims.get(videoId) === 1)
}

/**
 * Sets the matched video on works that still have none (a video the site embeds or one pasted
 * by hand is never replaced), then carries over the watched mark of the channel video.
 */
export function workVideoLinkSql(pairs: { sourceUrl: string; videoId: string }[]): string[] {
  const links = pairs.map(
    ({ sourceUrl, videoId }) =>
      `UPDATE works SET youtube_video_id = ${sqlValue(videoId)}, video_source = 'title', ` +
      `updated_at = datetime('now') WHERE source_url = ${sqlValue(sourceUrl)} AND youtube_video_id IS NULL;`,
  )
  const from = (column: string) =>
    `(SELECT ${column} FROM channel_videos WHERE channel_videos.video_id = works.youtube_video_id)`
  return [
    ...links,
    `UPDATE works SET watched_at = ${from('watched_at')}, watched_by = ${from('watched_by')}, ` +
      `updated_at = datetime('now') WHERE watched_at IS NULL AND youtube_video_id IN ` +
      `(SELECT video_id FROM channel_videos WHERE watched_at IS NOT NULL);`,
  ]
}
