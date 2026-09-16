import { groupByDayKeepOrder } from './calendar'
import { parseToUtcMs, toJstDateKey } from './jst'

/**
 * ホームに出す横断フィード。見学記録・予定・業者・物件・場所・動画・コメント・写真を
 * 種類非依存の共通形にそろえ、時系列で束ねて表示するための型と結合関数。
 */

export type FeedKind =
  'visit' | 'event' | 'vendor' | 'property' | 'place' | 'video' | 'comment' | 'photo' | 'source'

/** 新規追加か、既存レコードの更新か。comment/photo は常に 'add'（server/repository/feed.ts 参照） */
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
  /** D1 の UTC datetime か ISO 文字列 */
  at: string
  /** メールアドレス */
  by: string
  /** params はパスパラメータ（`/records/visits/$id` の id 等）、search はクエリ
   * パラメータ（`/calendar?d=...` の d 等）。TanStack Router の `<Link>` にそのまま
   * `params`/`search` として渡す想定 */
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

/** 同時刻のときの表示優先順（この並び順が優先度） */
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

/**
 * フィードを日（JST の日付キー）でまとめる。items は既に新しい順（mergeFeed 後）
 * を前提にしており、日の並び順は「最初に出てきた順」＝新しい日が先になる。
 * 日内の順序は items の並びをそのまま保つ。グルーピング自体は calendar.ts の
 * groupByDayKeepOrder（お知らせ一覧と共通）に委ねる薄いラッパー。
 */
export function groupFeedByDay(items: readonly FeedItem[]): { day: string; items: FeedItem[] }[] {
  return groupByDayKeepOrder(items, (item) => toJstDateKey(item.at))
}

/** コメント本文の表示上限（超えたら末尾に … を付けて切る） */
const COMMENT_BODY_LIMIT = 40

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

/**
 * フィード 1 件を「◯◯「対象名」を追加/更新」の文にするための断片。
 * link だけをクリック可能なリンクにする想定（対象名部分のみ）。
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
