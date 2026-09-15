import { parseToUtcMs } from './jst'

/**
 * ホームに出す横断フィード。見学記録・予定・業者・物件・場所・動画・コメント・写真を
 * 種類非依存の共通形にそろえ、時系列で束ねて表示するための型と結合関数。
 */

export type FeedKind =
  'visit' | 'event' | 'vendor' | 'property' | 'place' | 'video' | 'comment' | 'photo'

export type FeedItem = {
  kind: FeedKind
  id: string
  title: string
  subtitle?: string
  /** D1 の UTC datetime か ISO 文字列 */
  at: string
  /** メールアドレス */
  by: string
  href: { to: string; params?: Record<string, string> }
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
}

/** 同時刻のときの表示優先順（この並び順が優先度） */
const FEED_KIND_ORDER: readonly FeedKind[] = [
  'visit',
  'event',
  'vendor',
  'property',
  'place',
  'video',
  'comment',
  'photo',
]

/** at が読めないデータは最も古い扱いにして末尾に流す（feed から落とさない） */
function atMs(item: FeedItem): number {
  return parseToUtcMs(item.at) ?? 0
}

/**
 * 複数系統のフィード項目を時系列（新しい順）に束ねる。
 * 同時刻は FEED_KIND_ORDER の順で安定させ、limit 件に絞る。
 * limit が 0 以下なら空配列（`slice(0, limit)` に負数をそのまま渡すと
 * 「末尾から絞る」挙動になってしまうため、Math.max(0, limit) で正規化する）。
 * 引数の配列・要素はいずれも書き換えない。
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
