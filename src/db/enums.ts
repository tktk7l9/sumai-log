/**
 * The fixed value lists of the columns (`as const` arrays), their Japanese labels and their
 * types. No drizzle import, and none may be added: pages, components and the zod schemas of
 * the server functions import from here, so whatever this file imports is downloaded by the
 * browser. The tables are in schema.ts, which uses these lists for its `enum` columns and
 * re-exports them (src/lib/clientBundle.test.ts keeps client code off schema.ts).
 */

export const VENDOR_KINDS = ['hm', 'koumuten', 'sekkei', 'developer'] as const
export const VENDOR_KIND_LABEL: Record<(typeof VENDOR_KINDS)[number], string> = {
  hm: 'ハウスメーカー',
  koumuten: '工務店',
  sekkei: '設計事務所',
  developer: 'デベロッパー',
}

/** How vendor news is fetched. rss = RSS 2.0 feed, html-list = the <ul><li> list on the
 * top page */
export const NEWS_SOURCES = ['rss', 'html-list'] as const
/** Origin of favicon_key. 'auto' = fetched automatically (fetchFaviconForVendor),
 * 'manual' = uploaded by hand from the vendor form (design background: an alternative
 * route for servers that refuse access from Cloudflare).
 * For backward compatibility with existing rows the column is nullable, and null is
 * treated as 'auto' (see migration 0008). */
export const FAVICON_SOURCES = ['auto', 'manual'] as const
export type FaviconSource = (typeof FAVICON_SOURCES)[number]
export const NEWS_SOURCE_LABEL: Record<(typeof NEWS_SOURCES)[number], string> = {
  rss: 'RSS',
  'html-list': 'HTML',
}

export const PLACE_KINDS = [
  'showroom',
  'model_house',
  'open_house',
  'gallery',
  'site',
  'other',
] as const
export const PLACE_KIND_LABEL: Record<(typeof PLACE_KINDS)[number], string> = {
  showroom: '住宅展示場',
  model_house: 'モデルハウス',
  open_house: '完成見学会',
  gallery: 'マンションギャラリー',
  site: '物件現地',
  other: 'その他',
}
export const GEOCODE_SOURCES = ['gsi', 'manual'] as const

export const EVENT_KINDS = ['visit', 'meeting', 'viewing', 'other'] as const
export const EVENT_KIND_LABEL: Record<(typeof EVENT_KINDS)[number], string> = {
  visit: '見学',
  meeting: '打合せ',
  viewing: '内覧',
  other: 'その他',
}

export const INBOUND_STATUSES = ['imported', 'unassigned', 'rejected', 'system'] as const
export type InboundStatus = (typeof INBOUND_STATUSES)[number]
export const INBOUND_STATUS_LABEL: Record<InboundStatus, string> = {
  imported: '取込',
  unassigned: '未割当',
  rejected: '拒否',
  system: 'システム',
}

export const ATTENDEES = ['both', 'husband', 'wife'] as const
export const ATTENDEES_LABEL: Record<(typeof ATTENDEES)[number], string> = {
  both: '二人',
  husband: '夫',
  wife: '妻',
}

/** auto = embedded on the site's page; manual = pasted by hand; title = a channel video whose title
 * names the work (scripts/import-channel-videos.ts) */
export const WORK_VIDEO_SOURCES = ['auto', 'manual', 'title'] as const

export const CHANNEL_VIDEO_KINDS = ['video', 'short', 'live'] as const
export const CHANNEL_VIDEO_KIND_LABEL: Record<(typeof CHANNEL_VIDEO_KINDS)[number], string> = {
  video: '動画',
  short: 'ショート',
  live: 'ライブ',
}

export const COMMENT_TARGETS = ['vendor', 'property', 'place', 'visit', 'video'] as const

export const DEFAULT_TAGS = [
  '断熱',
  '気密',
  '耐震',
  '間取り',
  '資金',
  'ローン',
  '土地',
  'マンション',
  '管理',
  '設備',
  '外構',
] as const

/** Kind of a source on the sources page (/sources). 'youtube' when it could be parsed
 * from a YouTube channel URL, otherwise 'site' (see parseYoutubeChannelUrl in
 * src/lib/sources.ts) */
export const SOURCE_KINDS = ['youtube', 'site'] as const

export const TODO_LISTS = ['move', 'account', 'money', 'other'] as const
export type TodoList = (typeof TODO_LISTS)[number]
export const TODO_LIST_LABEL: Record<TodoList, string> = {
  move: '引越し',
  account: 'アカウント',
  money: 'お金',
  other: 'その他',
}
