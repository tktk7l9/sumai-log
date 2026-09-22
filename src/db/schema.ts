import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core'

import type { VendorResearch } from '../lib/research'
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
/** favicon_key の由来。'auto' = 自動取得（fetchFaviconForVendor）、'manual' = 業者フォームからの
 * 手動アップロード（design 背景: Cloudflare からのアクセスを拒否するサーバー向けの代替経路）。
 * 既存行との後方互換のため列は nullable にし、null は 'auto' として扱う（migration 0008 参照）。 */
export const FAVICON_SOURCES = ['auto', 'manual'] as const
export type FaviconSource = (typeof FAVICON_SOURCES)[number]
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
    /** 加盟団体ごとの、この業者向けの紹介ページ URL とメモ（星の意味等）。
     * キーは affiliations と同じ Affiliation['id']。選ばなかった団体は入らない */
    affiliationLinks: text('affiliation_links', { mode: 'json' })
      .$type<Record<string, { url: string; note?: string }>>()
      .notNull()
      .default(sql`'{}'`),
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
    /** メール取込（design 2026-09-19）: メルマガの差出人ドメイン。カンマ区切り・小文字。
     * 一致（完全一致またはサブドメイン）したメールをこの業者のお知らせにする */
    newsEmailDomain: text('news_email_domain'),
    /** 代表者の顔写真。R2 キーは vendors/{id}/representative-display.jpg（vendorImageKeys）。
     * サムネ（-thumb.jpg）は同じ vendorId から決定的に決まるので別列は持たない */
    representativePhotoKey: text('representative_photo_key'),
    /** サイトのファビコン。R2 キーは vendors/{id}/favicon.<ext>（vendorFaviconKey）。
     * 拡張子がサイトごとに変わるため（png/ico/jpg/webp。SVG は扱わない理由は
     * src/lib/favicon.ts の FaviconExt/FaviconMimeType のコメント参照）、鍵そのものを保持する */
    faviconKey: text('favicon_key'),
    /** favicon_key の由来（'auto' | 'manual'）。null は 'auto' 扱い（上の FAVICON_SOURCES 参照） */
    faviconSource: text('favicon_source', { enum: FAVICON_SOURCES }),
    /** 調査メモ（比較表の事実・読み物・出典）。形は src/lib/research.ts の VendorResearch。
     * 未調査なら null。保存は saveVendorResearch（src/server/research.ts）だけが行い、
     * 業者フォーム（vendorInput）はこの列に触らない */
    research: text('research', { mode: 'json' }).$type<VendorResearch>(),
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
    /** メール由来のお知らせ。本文は inbound_mails.body_text にある（二重保存しない） */
    mailId: text('mail_id').references((): AnySQLiteColumn => inboundMails.id, {
      onDelete: 'set null',
    }),
    /** 初回取得の日時 */
    firstSeenAt: text('first_seen_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    ...timestamps,
  },
  (t) => [index('vendor_news_vendor_published_idx').on(t.vendorId, t.publishedOn)],
)

export const INBOUND_STATUSES = ['imported', 'unassigned', 'rejected', 'system'] as const
export type InboundStatus = (typeof INBOUND_STATUSES)[number]
export const INBOUND_STATUS_LABEL: Record<InboundStatus, string> = {
  imported: '取込',
  unassigned: '未割当',
  rejected: '拒否',
  system: 'システム',
}

/**
 * news@ に届いたメールの全記録（設計 2026-09-19 §4）。未割当の置き場と受信ログを兼ねる。
 * 人ではなく Worker が作るので created_by は持たない。
 */
export const inboundMails = sqliteTable(
  'inbound_mails',
  {
    id: id(),
    /** 元メールの Message-ID（<> 付き）。無ければ 'hash:<sha256>' */
    messageId: text('message_id').notNull().unique(),
    /** 受信時刻 ISO-8601 */
    receivedAt: text('received_at').notNull(),
    /** 元の差出人（手動転送なら転送ブロックの From） */
    fromAddress: text('from_address').notNull(),
    /** 正規化したエンベロープ送信者（自動転送・手動転送とも）。mbox 取込は 'mbox' */
    forwardedBy: text('forwarded_by'),
    subject: text('subject').notNull(),
    /** 元メールの日付 YYYY-MM-DD（JST）。無ければ null */
    sentOn: text('sent_on'),
    /** rejected は null（本文を保存しない） */
    bodyText: text('body_text'),
    bodyTruncated: integer('body_truncated', { mode: 'boolean' }).notNull().default(false),
    status: text('status', { enum: INBOUND_STATUSES }).notNull(),
    rejectReason: text('reject_reason'),
    vendorId: text('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    newsId: text('news_id').references((): AnySQLiteColumn => vendorNews.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => [index('inbound_mails_status_received_idx').on(t.status, t.receivedAt)],
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
export type InboundMail = typeof inboundMails.$inferSelect
export type NewInboundMail = typeof inboundMails.$inferInsert
export type Visit = typeof visits.$inferSelect
export type NewVisit = typeof visits.$inferInsert
export type Photo = typeof photos.$inferSelect
export type NewPhoto = typeof photos.$inferInsert
export type Video = typeof videos.$inferSelect
export type NewVideo = typeof videos.$inferInsert
export type Comment = typeof comments.$inferSelect
export type Tag = typeof tags.$inferSelect

/** 情報収集（/sources）の情報源の種類。YouTube チャンネル URL から解析できたら
 * 'youtube'、それ以外は 'site'（src/lib/sources.ts の parseYoutubeChannelUrl 参照） */
export const SOURCE_KINDS = ['youtube', 'site'] as const

/**
 * 情報収集ページの情報源（主に YouTube チャンネル）。ジャンルは固定 enum ではなく
 * `src/content/sourceGenres.ts` のデータで表す（妥当性は src/server/sources.schema.ts の
 * zod 側で SOURCE_GENRE_IDS と照合する。vendors.status 等と違ってここでは drizzle の
 * enum 制約を付けない）。
 */
export const sources = sqliteTable(
  'sources',
  {
    id: id(),
    kind: text('kind', { enum: SOURCE_KINDS }).notNull().default('youtube'),
    name: text('name').notNull(),
    url: text('url').notNull().unique(),
    /** YouTube ハンドル（'@…'）。/channel/UC… だけの URL から登録した場合は無い */
    handle: text('handle'),
    /** YouTube チャンネル ID（'UC…'）。/@handle だけの URL では取得できないことがある */
    channelId: text('channel_id'),
    /** src/content/sourceGenres.ts の SourceGenre['id'] */
    genre: text('genre').notNull(),
    /** 最大 200 字（呼び出し側で切り詰める） */
    description: text('description'),
    /** https のみ。ホストは src/lib/sources.ts の isAllowedAvatarUrl で絞る */
    avatarUrl: text('avatar_url'),
    /** 候補の会社（vendors）と紐づける場合 */
    vendorId: text('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    /** 加盟団体（src/content/affiliations.ts の Affiliation['id']）と紐づける場合 */
    affiliation: text('affiliation'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index('sources_genre_idx').on(t.genre)],
)

export type Source = typeof sources.$inferSelect
export type NewSource = typeof sources.$inferInsert
