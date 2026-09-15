import { desc, eq } from 'drizzle-orm'

import type { Db } from '../../db/client'
import {
  EVENT_KIND_LABEL,
  PLACE_KIND_LABEL,
  VENDOR_KIND_LABEL,
  comments,
  events,
  photos,
  places,
  properties,
  vendors,
  videos,
  visits,
  type Comment,
} from '../../db/schema'
import { dateKey } from '../../lib/calendar'
import type { FeedItem } from '../../lib/feed'

/**
 * ホームの「最近の更新」フィード用。各 recent* は updatedAt（photos/comments は
 * createdAt）の新しい順に n 件、FeedItem 形（kind/id/title/subtitle/at/by/href）で返す。
 * limit で件数を絞るのは呼び出し側（src/server/feed.ts の mergeFeed）の責務。
 */

export async function recentVisits(db: Db, n: number): Promise<FeedItem[]> {
  const rows = await db
    .select({
      visit: visits,
      placeName: places.name,
      vendorName: vendors.name,
      propertyName: properties.name,
    })
    .from(visits)
    .leftJoin(places, eq(visits.placeId, places.id))
    .leftJoin(vendors, eq(visits.vendorId, vendors.id))
    .leftJoin(properties, eq(visits.propertyId, properties.id))
    .orderBy(desc(visits.updatedAt))
    .limit(n)
  return rows.map((r) => ({
    kind: 'visit',
    id: r.visit.id,
    title: r.placeName ?? r.vendorName ?? r.propertyName ?? '見学記録',
    subtitle: r.visit.visitedOn,
    at: r.visit.updatedAt,
    by: r.visit.createdBy,
    href: { to: '/records/visits/$id', params: { id: r.visit.id } },
  }))
}

export async function recentEvents(db: Db, n: number): Promise<FeedItem[]> {
  const rows = await db
    .select({
      event: events,
      placeName: places.name,
      vendorName: vendors.name,
      propertyName: properties.name,
    })
    .from(events)
    .leftJoin(places, eq(events.placeId, places.id))
    .leftJoin(vendors, eq(events.vendorId, vendors.id))
    .leftJoin(properties, eq(events.propertyId, properties.id))
    .orderBy(desc(events.updatedAt))
    .limit(n)
  return rows.map((r) => ({
    kind: 'event',
    id: r.event.id,
    title: r.event.title,
    subtitle: r.placeName ?? r.vendorName ?? r.propertyName ?? EVENT_KIND_LABEL[r.event.kind],
    at: r.event.updatedAt,
    by: r.event.createdBy,
    href: { to: '/calendar', params: { d: dateKey(r.event.startsAt) } },
  }))
}

export async function recentVendors(db: Db, n: number): Promise<FeedItem[]> {
  const rows = await db.select().from(vendors).orderBy(desc(vendors.updatedAt)).limit(n)
  return rows.map((v) => ({
    kind: 'vendor',
    id: v.id,
    title: v.name,
    subtitle: VENDOR_KIND_LABEL[v.kind],
    at: v.updatedAt,
    by: v.createdBy,
    href: { to: '/candidates/vendors/$id', params: { id: v.id } },
  }))
}

export async function recentProperties(db: Db, n: number): Promise<FeedItem[]> {
  const rows = await db.select().from(properties).orderBy(desc(properties.updatedAt)).limit(n)
  return rows.map((p) => ({
    kind: 'property',
    id: p.id,
    title: p.name,
    subtitle: p.address ?? undefined,
    at: p.updatedAt,
    by: p.createdBy,
    href: { to: '/candidates/properties/$id', params: { id: p.id } },
  }))
}

export async function recentPlaces(db: Db, n: number): Promise<FeedItem[]> {
  const rows = await db.select().from(places).orderBy(desc(places.updatedAt)).limit(n)
  return rows.map((p) => ({
    kind: 'place',
    id: p.id,
    title: p.name,
    subtitle: PLACE_KIND_LABEL[p.kind],
    at: p.updatedAt,
    by: p.createdBy,
    href: { to: '/places/$id', params: { id: p.id } },
  }))
}

export async function recentVideos(db: Db, n: number): Promise<FeedItem[]> {
  const rows = await db.select().from(videos).orderBy(desc(videos.updatedAt)).limit(n)
  return rows.map((v) => ({
    kind: 'video',
    id: v.id,
    title: v.title,
    subtitle: v.channel ?? undefined,
    at: v.updatedAt,
    by: v.createdBy,
    href: { to: '/records/videos/$id', params: { id: v.id } },
  }))
}

/** コメント対象の表示名。消えていれば null（呼び出し側で「（削除済み）」にする） */
async function targetName(
  db: Db,
  targetType: Comment['targetType'],
  targetId: string,
): Promise<string | null> {
  switch (targetType) {
    case 'vendor': {
      const [row] = await db
        .select({ name: vendors.name })
        .from(vendors)
        .where(eq(vendors.id, targetId))
        .limit(1)
      return row?.name ?? null
    }
    case 'property': {
      const [row] = await db
        .select({ name: properties.name })
        .from(properties)
        .where(eq(properties.id, targetId))
        .limit(1)
      return row?.name ?? null
    }
    case 'place': {
      const [row] = await db
        .select({ name: places.name })
        .from(places)
        .where(eq(places.id, targetId))
        .limit(1)
      return row?.name ?? null
    }
    case 'video': {
      const [row] = await db
        .select({ name: videos.title })
        .from(videos)
        .where(eq(videos.id, targetId))
        .limit(1)
      return row?.name ?? null
    }
    case 'visit': {
      const [row] = await db
        .select({ visitedOn: visits.visitedOn, placeName: places.name })
        .from(visits)
        .leftJoin(places, eq(visits.placeId, places.id))
        .where(eq(visits.id, targetId))
        .limit(1)
      if (!row) return null
      return row.placeName ?? `見学記録（${row.visitedOn}）`
    }
  }
}

/** コメント対象の詳細ページへの href。targetType ごとに固定で、他 kind の id が混ざらない */
function targetHref(targetType: Comment['targetType'], targetId: string): FeedItem['href'] {
  switch (targetType) {
    case 'vendor':
      return { to: '/candidates/vendors/$id', params: { id: targetId } }
    case 'property':
      return { to: '/candidates/properties/$id', params: { id: targetId } }
    case 'place':
      return { to: '/places/$id', params: { id: targetId } }
    case 'video':
      return { to: '/records/videos/$id', params: { id: targetId } }
    case 'visit':
      return { to: '/records/visits/$id', params: { id: targetId } }
  }
}

export async function recentComments(db: Db, n: number): Promise<FeedItem[]> {
  const rows = await db.select().from(comments).orderBy(desc(comments.createdAt)).limit(n)
  return Promise.all(
    rows.map(async (c) => ({
      kind: 'comment' as const,
      id: c.id,
      title: c.body,
      subtitle: (await targetName(db, c.targetType, c.targetId)) ?? '（削除済み）',
      at: c.createdAt,
      by: c.createdBy,
      href: targetHref(c.targetType, c.targetId),
    })),
  )
}

export async function recentPhotos(db: Db, n: number): Promise<FeedItem[]> {
  const rows = await db
    .select({ photo: photos, placeName: places.name, visitedOn: visits.visitedOn })
    .from(photos)
    .innerJoin(visits, eq(photos.visitId, visits.id))
    .leftJoin(places, eq(visits.placeId, places.id))
    .orderBy(desc(photos.createdAt))
    .limit(n)
  return rows.map((r) => ({
    kind: 'photo',
    id: r.photo.id,
    title: r.photo.caption ?? '写真',
    subtitle: r.placeName ?? r.visitedOn ?? undefined,
    at: r.photo.createdAt,
    by: r.photo.createdBy,
    href: { to: '/records/visits/$id', params: { id: r.photo.visitId } },
  }))
}
