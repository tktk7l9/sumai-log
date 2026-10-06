import type { ChannelVideoKind } from './import'

/**
 * The counts of the videos tab come from one GROUP BY over the table (per channel, with the
 * three kinds inside). Before 2026-10-06 the page ran a separate count(*) for the matches of
 * the current filter, which scanned the whole table again; with the counts per kind in hand
 * that number is a sum, and only a title search still needs its own count
 */

export type KindCount = { total: number; watched: number }

export type ChannelSummary = {
  channelId: string
  channel: string
  total: number
  watched: number
  kinds: Record<ChannelVideoKind, KindCount>
}

export type CountFilter = {
  channelId?: string
  kind?: ChannelVideoKind
  unwatched?: boolean
}

/** How many videos the channel / kind / unwatched filter matches (a title search is not a filter here) */
export function matchedFromSummaries(summaries: ChannelSummary[], filter: CountFilter): number {
  let n = 0
  for (const s of summaries) {
    if (filter.channelId && s.channelId !== filter.channelId) continue
    const counts = filter.kind ? [s.kinds[filter.kind]] : Object.values(s.kinds)
    for (const c of counts) n += filter.unwatched ? c.total - c.watched : c.total
  }
  return n
}
