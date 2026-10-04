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
 * Policy: dates are ISO-8601 in TEXT (date only is 'YYYY-MM-DD'), amounts are integers in
 * yen, areas are decimals. id is text (crypto.randomUUID()). The author is an e-mail.
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

/** Vendors for detached houses */
export const vendors = sqliteTable(
  'vendors',
  {
    id: id(),
    name: text('name').notNull(),
    kind: text('kind', { enum: VENDOR_KINDS }).notNull().default('koumuten'),
    hq: text('hq'),
    /** Representative's name. Shown in the list when the vendor is a builder */
    representative: text('representative'),
    /** Service area (array of municipality names). Matched against homeAreas in settings */
    serviceAreas: jsonList('service_areas'),
    /** Array of member organization ids (Affiliation['id'] in `src/content/affiliations.ts`) */
    affiliations: jsonList('affiliations'),
    /** Per member organization, the URL of its introduction page for this vendor and a
     * memo (meaning of the stars etc.).
     * The key is the same Affiliation['id'] as affiliations. Organizations that were not
     * chosen are not included */
    affiliationLinks: text('affiliation_links', { mode: 'json' })
      .$type<Record<string, { url: string; note?: string }>>()
      .notNull()
      .default(sql`'{}'`),
    uaValue: real('ua_value'),
    cValuePublished: integer('c_value_published', { mode: 'boolean' }).notNull().default(false),
    seismicGrade: integer('seismic_grade'),
    longTermCertified: integer('long_term_certified', { mode: 'boolean' }).notNull().default(false),
    /** Rough price per tsubo (10,000 yen) */
    pricePerTsuboMin: integer('price_per_tsubo_min'),
    pricePerTsuboMax: integer('price_per_tsubo_max'),
    structure: text('structure'),
    features: text('features'),
    status: text('status', { enum: CANDIDATE_STATUSES }).notNull().default('interested'),
    sourceUrl: text('source_url'),
    websiteUrl: text('website_url'),
    /** SNS profile URLs (Instagram/X/YouTube/Facebook/TikTok/LINE/Threads/note etc.) */
    socialUrls: jsonList('social_urls'),
    /** Source URL of vendor news (when not set, the vendor is not fetched) */
    newsUrl: text('news_url'),
    /** How to fetch when newsUrl exists */
    newsSource: text('news_source', { enum: NEWS_SOURCES }),
    /** Last time vendor news was fetched (updated on both success and failure) */
    newsFetchedAt: text('news_fetched_at'),
    /** Reason of the most recent fetch failure. null on success */
    newsFetchError: text('news_fetch_error'),
    /** Mail import (design 2026-09-19): sender domains of the newsletter. Comma-separated,
     * lowercase.
     * Mail that matches (exact match or subdomain) becomes vendor news of this vendor */
    newsEmailDomain: text('news_email_domain'),
    /** Photo of the representative's face. The R2 key is
     * vendors/{id}/representative-display.jpg (vendorImageKeys).
     * The thumbnail (-thumb.jpg) is determined deterministically from the same vendorId,
     * so there is no separate column */
    representativePhotoKey: text('representative_photo_key'),
    /** Favicon of the site. The R2 key is vendors/{id}/favicon.<ext> (vendorFaviconKey).
     * The extension differs per site (png/ico/jpg/webp. For why SVG is not handled, see
     * the comment on FaviconExt/FaviconMimeType in src/lib/favicon.ts), so the key itself
     * is stored */
    faviconKey: text('favicon_key'),
    /** Origin of favicon_key ('auto' | 'manual'). null is treated as 'auto' (see
     * FAVICON_SOURCES above) */
    faviconSource: text('favicon_source', { enum: FAVICON_SOURCES }),
    /** Research memo (facts for the comparison table, reading material, sources). The
     * shape is VendorResearch in src/lib/research.ts.
     * null when not researched yet. Only saveVendorResearch (src/server/research.ts)
     * saves it, and the vendor form (vendorInput) does not touch this column */
    research: text('research', { mode: 'json' }).$type<VendorResearch>(),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index('vendors_status_idx').on(t.status)],
)

/** Condominium properties */
export const properties = sqliteTable(
  'properties',
  {
    id: id(),
    name: text('name').notNull(),
    address: text('address'),
    station: text('station'),
    walkMinutes: integer('walk_minutes'),
    /** Price (yen) */
    price: integer('price'),
    areaSqm: real('area_sqm'),
    layout: text('layout'),
    builtYear: integer('built_year'),
    completionDate: text('completion_date'),
    /** Monthly amount (yen) */
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

/** Place. The unit of the map. Linked to either a vendor or a property (may have neither) */
export const places = sqliteTable(
  'places',
  {
    id: id(),
    name: text('name').notNull(),
    kind: text('kind', { enum: PLACE_KINDS }).notNull().default('other'),
    address: text('address'),
    lat: real('lat'),
    lng: real('lng'),
    /** Original notation of hand-pasted coordinates. Kept to compare with the converted value */
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

/** Event. When all-day, startsAt is 'YYYY-MM-DD'; otherwise ISO-8601 (+09:00) */
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
 * Vendor news (fetched periodically from RSS/HTML). url is the key for judging new items
 * (when it already exists nothing is done. Updates to the title etc. are not tracked).
 * Event judgment (event_start/event_end/event_kind) is done only once at fetch time and
 * the result is stored.
 * When "行く" (Go) converts it into the user's own event (events), it is linked through
 * planned_event_id.
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
    /** Up to 300 characters (truncated by the caller) */
    summary: text('summary'),
    /** YYYY-MM-DD. pubDate for RSS, the written date for HTML */
    publishedOn: text('published_on').notNull(),
    /** YYYY-MM-DD. Only when judged to be an event */
    eventStart: text('event_start'),
    /** YYYY-MM-DD. The last day for multiple days, same as eventStart for a single day */
    eventEnd: text('event_end'),
    /** "見学会" (open house) / "完成見学会" (completed-house open house) / "構造見学会"
     * (structure open house) / "相談会" (consultation) / "セミナー" (seminar) /
     * "イベント" (event) */
    eventKind: text('event_kind'),
    /** The user's own event created with "行く". Set back to null when the event is removed */
    plannedEventId: text('planned_event_id').references(() => events.id, { onDelete: 'set null' }),
    /** Vendor news that comes from mail. The body is in inbound_mails.body_text (not
     * stored twice) */
    mailId: text('mail_id').references((): AnySQLiteColumn => inboundMails.id, {
      onDelete: 'set null',
    }),
    /** Time of the first fetch */
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
 * Full record of the mail delivered to news@ (design 2026-09-19 §4). Serves as both the
 * place for unassigned mail and the receive log.
 * Created by the Worker, not by a person, so it has no created_by.
 */
export const inboundMails = sqliteTable(
  'inbound_mails',
  {
    id: id(),
    /** Message-ID of the original mail (with <>). 'hash:<sha256>' when there is none */
    messageId: text('message_id').notNull().unique(),
    /** Receive time, ISO-8601 */
    receivedAt: text('received_at').notNull(),
    /** Original sender (for manual forwarding, the From of the forwarded block) */
    fromAddress: text('from_address').notNull(),
    /** Normalized envelope sender (for both automatic and manual forwarding). 'mbox' for
     * mbox import */
    forwardedBy: text('forwarded_by'),
    subject: text('subject').notNull(),
    /** Date of the original mail, YYYY-MM-DD (JST). null when there is none */
    sentOn: text('sent_on'),
    /** null for rejected (the body is not stored) */
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

/** Visit record */
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

/** Photo. The R2 key is photos/{visitId}/{photoId}-display.jpg / -thumb.jpg */
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

/** YouTube memo */
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

export const WORK_VIDEO_SOURCES = ['auto', 'manual'] as const

/**
 * Built examples published on vendors' sites (/works). Rows come from the SQL that
 * scripts/import-works.ts generates; the app itself only changes the video and the
 * watched columns. Areas are in tsubo.
 */
export const works = sqliteTable(
  'works',
  {
    id: id(),
    /** Detail page of the example. The key the import matches on */
    sourceUrl: text('source_url').notNull().unique(),
    /** Key of the site in seed.local/works-sites.json */
    site: text('site').notNull(),
    vendorId: text('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    category: text('category'),
    location: text('location'),
    /** 'YYYY-MM' or 'YYYY' */
    completedOn: text('completed_on'),
    points: jsonList('points'),
    uaValue: real('ua_value'),
    cValue: real('c_value'),
    family: text('family'),
    siteAreaTsubo: real('site_area_tsubo'),
    floorAreaTsubo: real('floor_area_tsubo'),
    totalAreaTsubo: real('total_area_tsubo'),
    layout: text('layout'),
    youtubeVideoId: text('youtube_video_id'),
    /** Who set youtube_video_id. null is treated as 'auto'. A 'manual' one survives re-imports */
    videoSource: text('video_source', { enum: WORK_VIDEO_SOURCES }),
    /** ISO-8601. null = not watched yet. One flag shared by the two users */
    watchedAt: text('watched_at'),
    watchedBy: text('watched_by'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('works_vendor_idx').on(t.vendorId)],
)

export const CHANNEL_VIDEO_KINDS = ['video', 'short', 'live'] as const
export const CHANNEL_VIDEO_KIND_LABEL: Record<(typeof CHANNEL_VIDEO_KINDS)[number], string> = {
  video: '動画',
  short: 'ショート',
  live: 'ライブ',
}

/**
 * Every video of the vendors' YouTube channels (/works?tab=videos). Rows come from the SQL that
 * scripts/import-channel-videos.ts generates; the app itself only changes the watched columns.
 * A video that is also a work's tour video shares the watched flag with that work.
 */
export const channelVideos = sqliteTable(
  'channel_videos',
  {
    id: id(),
    /** The 11-character YouTube id. The key the import matches on */
    videoId: text('video_id').notNull().unique(),
    /** YouTube channel id ('UC…') */
    channelId: text('channel_id').notNull(),
    /** Display name of the channel, from seed.local/channel-videos.json */
    channel: text('channel').notNull(),
    vendorId: text('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    kind: text('kind', { enum: CHANNEL_VIDEO_KINDS }).notNull(),
    title: text('title').notNull(),
    durationSec: integer('duration_sec'),
    viewCount: integer('view_count'),
    /** ISO-8601 (UTC). When YouTube published the video; null until the import could read it */
    publishedAt: text('published_at'),
    /** Position in the channel, newest first (videos, then live, then shorts) */
    sortOrder: integer('sort_order').notNull().default(0),
    /** ISO-8601. null = not watched yet. One flag shared by the two users */
    watchedAt: text('watched_at'),
    watchedBy: text('watched_by'),
    ...timestamps,
  },
  (t) => [index('channel_videos_channel_idx').on(t.channelId, t.sortOrder)],
)

export const COMMENT_TARGETS = ['vendor', 'property', 'place', 'visit', 'video'] as const

/** Both users can add a short comment to any record. targetId is not a foreign key (on
 * delete, the server side cleans up) */
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

/** Results of the GSI (Geospatial Information Authority of Japan) address search API.
 * The same string is never looked up twice */
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
export type Work = typeof works.$inferSelect
export type NewWork = typeof works.$inferInsert
export type ChannelVideo = typeof channelVideos.$inferSelect
export type NewChannelVideo = typeof channelVideos.$inferInsert
export type Comment = typeof comments.$inferSelect
export type Tag = typeof tags.$inferSelect

/** Kind of a source on the sources page (/sources). 'youtube' when it could be parsed
 * from a YouTube channel URL, otherwise 'site' (see parseYoutubeChannelUrl in
 * src/lib/sources.ts) */
export const SOURCE_KINDS = ['youtube', 'site'] as const

/**
 * Sources of the sources page (mainly YouTube channels). The genre is not a fixed enum; it
 * is expressed by the data in `src/content/sourceGenres.ts` (validity is checked against
 * SOURCE_GENRE_IDS on the zod side in src/server/sources.schema.ts. Unlike vendors.status
 * etc., no drizzle enum constraint is added here).
 */
export const sources = sqliteTable(
  'sources',
  {
    id: id(),
    kind: text('kind', { enum: SOURCE_KINDS }).notNull().default('youtube'),
    name: text('name').notNull(),
    url: text('url').notNull().unique(),
    /** YouTube handle ('@…'). Absent when registered from a URL with only /channel/UC… */
    handle: text('handle'),
    /** YouTube channel ID ('UC…'). Sometimes cannot be obtained from a URL with only /@handle */
    channelId: text('channel_id'),
    /** SourceGenre['id'] in src/content/sourceGenres.ts */
    genre: text('genre').notNull(),
    /** Up to 200 characters (truncated by the caller) */
    description: text('description'),
    /** https only. The host is restricted by isAllowedAvatarUrl in src/lib/sources.ts */
    avatarUrl: text('avatar_url'),
    /** When linking to a candidate company (vendors) */
    vendorId: text('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    /** When linking to a member organization (Affiliation['id'] in
     * src/content/affiliations.ts) */
    affiliation: text('affiliation'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index('sources_genre_idx').on(t.genre)],
)

export type Source = typeof sources.$inferSelect
export type NewSource = typeof sources.$inferInsert
