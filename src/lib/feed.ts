import { groupByDayKeepOrder } from './calendar'
import { parseToUtcMs, toJstDateKey } from './jst'

/**
 * The cross-cutting feed shown on the home screen. Types and a merge function that bring visit
 * records, events, vendors, properties, places, videos, comments and photos into a common,
 * kind-independent shape and bundle them chronologically for display.
 */

export type FeedKind =
  'visit' | 'event' | 'vendor' | 'property' | 'place' | 'video' | 'comment' | 'photo' | 'source'

/**
 * A new addition or an update of an existing record. comment/photo are always 'add'
 * (see server/repository/feed.ts)
 */
export type FeedAction = 'add' | 'update'

export const FEED_ACTION_LABEL: Record<FeedAction, string> = {
  add: '追加',
  update: '更新',
}

export type FeedItem = {
  kind: FeedKind
  id: string
  title: string
  subtitle?: string
  action: FeedAction
  /** A D1 UTC datetime or an ISO string */
  at: string
  /** E-mail address */
  by: string
  /** params is the path parameters (the id of `/records/visits/$id` etc.), search is the query
   * parameters (the d of `/calendar?d=...` etc.). Meant to be passed as is to TanStack Router's
   * `<Link>` as `params`/`search` */
  href: { to: string; params?: Record<string, string>; search?: Record<string, string> }
}

export const FEED_KIND_LABEL: Record<FeedKind, string> = {
  visit: '見学記録',
  event: '予定',
  vendor: '業者',
  property: '物件',
  place: '場所',
  video: '動画',
  comment: 'コメント',
  photo: '写真',
  source: '情報源',
}

/** Display priority at the same time (this order is the priority) */
const FEED_KIND_ORDER: readonly FeedKind[] = [
  'visit',
  'event',
  'vendor',
  'property',
  'place',
  'video',
  'source',
  'comment',
  'photo',
]

/**
 * Data with an unreadable at is treated as the oldest and sent to the end (not dropped from
 * the feed)
 */
function atMs(item: FeedItem): number {
  return parseToUtcMs(item.at) ?? 0
}

/**
 * Bundles feed items from several sources chronologically (newest first).
 * The same time is made stable by FEED_KIND_ORDER, then narrowed to limit items.
 * When limit is 0 or less the result is an empty array (passing a negative number straight to
 * `slice(0, limit)` would trim from the end, so it is normalised with Math.max(0, limit)).
 * Neither the argument arrays nor their items are mutated.
 */
export function mergeFeed(groups: readonly (readonly FeedItem[])[], limit: number): FeedItem[] {
  const entries: { item: FeedItem; ms: number; order: number }[] = []
  for (const group of groups) {
    for (const item of group) {
      entries.push({ item, ms: atMs(item), order: FEED_KIND_ORDER.indexOf(item.kind) })
    }
  }

  entries.sort((a, b) => (a.ms !== b.ms ? b.ms - a.ms : a.order - b.order))
  return entries.slice(0, Math.max(0, limit)).map((e) => e.item)
}

/**
 * Groups the feed by day (the JST date key). items is assumed to be already newest first
 * (after mergeFeed), so the day order is order of first appearance = newer day first.
 * The order within a day keeps the order of items as is. A thin wrapper that leaves the
 * grouping itself to groupByDayKeepOrder in calendar.ts (shared with the vendor news list).
 */
export function groupFeedByDay(items: readonly FeedItem[]): { day: string; items: FeedItem[] }[] {
  return groupByDayKeepOrder(items, (item) => toJstDateKey(item.at))
}

/** Display limit of a comment body (beyond it, cut and append … at the end) */
const COMMENT_BODY_LIMIT = 40

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

/**
 * Fragments for turning 1 feed item into a sentence of the form
 * `<kind> "<target name>" を追加/更新` (added/updated).
 * Only link is meant to become a clickable link (the target name part only).
 */
export function feedSentence(item: FeedItem): { before: string; link: string; after: string } {
  const actionLabel = FEED_ACTION_LABEL[item.action]
  switch (item.kind) {
    case 'visit':
      return { before: '見学記録「', link: item.title, after: `」を${actionLabel}` }
    case 'event':
      return { before: '予定「', link: item.title, after: `」を${actionLabel}` }
    case 'vendor':
      return { before: '業者「', link: item.title, after: `」を${actionLabel}` }
    case 'property':
      return { before: '物件「', link: item.title, after: `」を${actionLabel}` }
    case 'place':
      return { before: '場所「', link: item.title, after: `」を${actionLabel}` }
    case 'video':
      return { before: '動画「', link: item.title, after: `」を${actionLabel}` }
    case 'source':
      return { before: '情報源「', link: item.title, after: `」を${actionLabel}` }
    case 'comment':
      return {
        before: '「',
        link: item.subtitle ?? '（削除済み）',
        after: `」にコメント：${truncate(item.title, COMMENT_BODY_LIMIT)}`,
      }
    case 'photo':
      return { before: '「', link: item.subtitle ?? '見学記録', after: '」に写真を追加' }
  }
}
