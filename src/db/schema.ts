import { sql } from 'drizzle-orm'
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { CANDIDATE_STATUSES } from '../lib/status'

/**
 * 方針: 日付は TEXT の ISO-8601（日付のみ 'YYYY-MM-DD'）、金額は円の整数、
 * 面積は小数。id は text（crypto.randomUUID()）。作成者はメール。
 */
export const timestamps = {
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
}

const id = () => text('id').primaryKey()
const createdBy = () => text('created_by').notNull()
const jsonList = (name: string) =>
  text(name, { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`)

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamps.updatedAt,
})

export const VENDOR_KINDS = ['hm', 'koumuten', 'sekkei', 'developer'] as const
export const VENDOR_KIND_LABEL: Record<(typeof VENDOR_KINDS)[number], string> = {
  hm: 'ハウスメーカー',
  koumuten: '工務店',
  sekkei: '設計事務所',
  developer: 'デベロッパー',
}

/** 業者のお知らせ取得方式。rss = RSS 2.0 フィード、html-list = トップページの <ul><li> 一覧 */
export const NEWS_SOURCES = ['rss', 'html-list'] as const
export const NEWS_SOURCE_LABEL: Record<(typeof NEWS_SOURCES)[number], string> = {
  rss: 'RSS',
  'html-list': 'HTML',
}

/** 戸建ての業者 */
export const vendors = sqliteTable(
  'vendors',
  {
    id: id(),
    name: text('name').notNull(),
    kind: text('kind', { enum: VENDOR_KINDS }).notNull().default('koumuten'),
    hq: text('hq'),
    /** 代表者名。工務店の場合に一覧へ表示する */
    representative: text('representative'),
    /** 施工エリア（市区町村名の配列）。設定の homeAreas と照合する */
    serviceAreas: jsonList('service_areas'),
    /** 加盟団体の id の配列（`src/content/affiliations.ts` の Affiliation['id']） */
    affiliations: jsonList('affiliations'),
    uaValue: real('ua_value'),
    cValuePublished: integer('c_value_published', { mode: 'boolean' }).notNull().default(false),
    seismicGrade: integer('seismic_grade'),
    longTermCertified: integer('long_term_certified', { mode: 'boolean' }).notNull().default(false),
    /** 坪単価の目安（万円） */
    pricePerTsuboMin: integer('price_per_tsubo_min'),
    pricePerTsuboMax: integer('price_per_tsubo_max'),
    structure: text('structure'),
    features: text('features'),
    status: text('status', { enum: CANDIDATE_STATUSES }).notNull().default('interested'),
    sourceUrl: text('source_url'),
    websiteUrl: text('website_url'),
    /** SNS のプロフィール URL（Instagram/X/YouTube/Facebook/TikTok/LINE/Threads/note など） */
    socialUrls: jsonList('social_urls'),
    /** お知らせの取得元 URL（未設定なら取得対象外） */
    newsUrl: text('news_url'),
    /** newsUrl があるときの取得方式 */
    newsSource: text('news_source', { enum: NEWS_SOURCES }),
    /** お知らせの最終取得日時（成功・失敗いずれも更新） */
    newsFetchedAt: text('news_fetched_at'),
    /** 直近の取得失敗理由。成功時は null */
    newsFetchError: text('news_fetch_error'),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index('vendors_status_idx').on(t.status)],
)

/** マンション物件 */
export const properties = sqliteTable(
  'properties',
  {
    id: id(),
    name: text('name').notNull(),
    address: text('address'),
    station: text('station'),
    walkMinutes: integer('walk_minutes'),
    /** 価格（円） */
    price: integer('price'),
    areaSqm: real('area_sqm'),
    layout: text('layout'),
    builtYear: integer('built_year'),
    completionDate: text('completion_date'),
    /** 月額（円） */
    managementFee: integer('management_fee'),
    repairReserve: integer('repair_reserve'),
    listingUrl: text('listing_url'),
    note: text('note'),
    status: text('status', { enum: CANDIDATE_STATUSES }).notNull().default('interested'),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index('properties_status_idx').on(t.status)],
)

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

/** 場所。地図の単位。業者か物件のどちらかに紐づく（どちらも無くてもよい） */
export const places = sqliteTable(
  'places',
  {
    id: id(),
    name: text('name').notNull(),
    kind: text('kind', { enum: PLACE_KINDS }).notNull().default('other'),
    address: text('address'),
    lat: real('lat'),
    lng: real('lng'),
    /** 手貼りした座標の元の表記。変換後の値と突き合わせるために残す */
    coordsText: text('coords_text'),
    geocodeSource: text('geocode_source', { enum: GEOCODE_SOURCES }),
    vendorId: text('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    propertyId: text('property_id').references(() => properties.id, { onDelete: 'set null' }),
    note: text('note'),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index('places_vendor_idx').on(t.vendorId), index('places_property_idx').on(t.propertyId)],
)

export const EVENT_KINDS = ['visit', 'meeting', 'viewing', 'other'] as const
export const EVENT_KIND_LABEL: Record<(typeof EVENT_KINDS)[number], string> = {
  visit: '見学',
  meeting: '打合せ',
  viewing: '内覧',
  other: 'その他',
}

/** 予定。終日なら startsAt は 'YYYY-MM-DD'、それ以外は ISO-8601（+09:00） */
export const events = sqliteTable(
  'events',
  {
    id: id(),
    title: text('title').notNull(),
    kind: text('kind', { enum: EVENT_KINDS }).notNull().default('visit'),
    startsAt: text('starts_at').notNull(),
    endsAt: text('ends_at'),
    allDay: integer('all_day', { mode: 'boolean' }).notNull().default(false),
    placeId: text('place_id').references(() => places.id, { onDelete: 'set null' }),
    vendorId: text('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    propertyId: text('property_id').references(() => properties.id, { onDelete: 'set null' }),
    note: text('note'),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index('events_starts_idx').on(t.startsAt)],
)

/**
 * 業者のお知らせ（RSS/HTML から定期取得）。url が新着判定のキー
 * （既にあれば何もしない。タイトル等の更新は追わない）。
 * イベント判定（event_start/event_end/event_kind）は取得時に 1 回だけ行い結果を保存する。
 * 「行く」で自分の予定（events）に変換したら planned_event_id に紐づける。
 */
export const vendorNews = sqliteTable(
  'vendor_news',
  {
    id: id(),
    vendorId: text('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    url: text('url').notNull().unique(),
    title: text('title').notNull(),
    /** 最大 300 字（呼び出し側で切り詰める） */
    summary: text('summary'),
    /** YYYY-MM-DD。RSS は pubDate、HTML は表記の日付 */
    publishedOn: text('published_on').notNull(),
    /** YYYY-MM-DD。イベントと判定したときのみ */
    eventStart: text('event_start'),
    /** YYYY-MM-DD。複数日なら終端、単日なら eventStart と同じ */
    eventEnd: text('event_end'),
    /** 見学会 / 完成見学会 / 構造見学会 / 相談会 / セミナー / イベント */
    eventKind: text('event_kind'),
    /** 「行く」で作った自分の予定。予定が消えたら null に戻す */
    plannedEventId: text('planned_event_id').references(() => events.id, { onDelete: 'set null' }),
    /** 初回取得の日時 */
    firstSeenAt: text('first_seen_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    ...timestamps,
  },
  (t) => [index('vendor_news_vendor_published_idx').on(t.vendorId, t.publishedOn)],
)

export const ATTENDEES = ['both', 'husband', 'wife'] as const
export const ATTENDEES_LABEL: Record<(typeof ATTENDEES)[number], string> = {
  both: '二人',
  husband: '夫',
  wife: '妻',
}

/** 見学記録 */
export const visits = sqliteTable(
  'visits',
  {
    id: id(),
    eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
    placeId: text('place_id').references(() => places.id, { onDelete: 'set null' }),
    vendorId: text('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    propertyId: text('property_id').references(() => properties.id, { onDelete: 'set null' }),
    visitedOn: text('visited_on').notNull(),
    attendees: text('attendees', { enum: ATTENDEES }).notNull().default('both'),
    good: text('good'),
    concerns: text('concerns'),
    qa: text('qa'),
    nextActions: text('next_actions'),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index('visits_visited_idx').on(t.visitedOn), index('visits_event_idx').on(t.eventId)],
)

/** 写真。R2 のキーは photos/{visitId}/{photoId}-display.jpg / -thumb.jpg */
export const photos = sqliteTable(
  'photos',
  {
    id: id(),
    visitId: text('visit_id')
      .notNull()
      .references(() => visits.id, { onDelete: 'cascade' }),
    displayKey: text('display_key').notNull(),
    thumbKey: text('thumb_key').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    caption: text('caption'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index('photos_visit_idx').on(t.visitId)],
)

/** YouTube メモ */
export const videos = sqliteTable(
  'videos',
  {
    id: id(),
    url: text('url').notNull(),
    videoId: text('video_id').notNull(),
    title: text('title').notNull(),
    channel: text('channel'),
    thumbnailUrl: text('thumbnail_url'),
    watchedOn: text('watched_on'),
    watchedBy: text('watched_by', { enum: ATTENDEES }).notNull().default('both'),
    tags: jsonList('tags'),
    takeaways: text('takeaways'),
    vendorId: text('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index('videos_watched_idx').on(t.watchedOn)],
)

export const COMMENT_TARGETS = ['vendor', 'property', 'place', 'visit', 'video'] as const

/** どの記録にも二人が一言足せる。targetId は外部キーではない（消すときは server 側で掃除する） */
export const comments = sqliteTable(
  'comments',
  {
    id: id(),
    targetType: text('target_type', { enum: COMMENT_TARGETS }).notNull(),
    targetId: text('target_id').notNull(),
    body: text('body').notNull(),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index('comments_target_idx').on(t.targetType, t.targetId)],
)

export const tags = sqliteTable('tags', {
  id: id(),
  name: text('name').notNull().unique(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
})

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

/** 国土地理院 住所検索 API の結果。同じ文字列を二度引かない */
export const geocodeCache = sqliteTable('geocode_cache', {
  query: text('query').primaryKey(),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  title: text('title'),
  fetchedAt: text('fetched_at')
    .notNull()
    .default(sql`(datetime('now'))`),
})

export type Vendor = typeof vendors.$inferSelect
export type NewVendor = typeof vendors.$inferInsert
export type Property = typeof properties.$inferSelect
export type NewProperty = typeof properties.$inferInsert
export type Place = typeof places.$inferSelect
export type NewPlace = typeof places.$inferInsert
export type Event = typeof events.$inferSelect
export type NewEvent = typeof events.$inferInsert
export type VendorNews = typeof vendorNews.$inferSelect
export type NewVendorNews = typeof vendorNews.$inferInsert
export type Visit = typeof visits.$inferSelect
export type NewVisit = typeof visits.$inferInsert
export type Photo = typeof photos.$inferSelect
export type NewPhoto = typeof photos.$inferInsert
export type Video = typeof videos.$inferSelect
export type NewVideo = typeof videos.$inferInsert
export type Comment = typeof comments.$inferSelect
export type Tag = typeof tags.$inferSelect
