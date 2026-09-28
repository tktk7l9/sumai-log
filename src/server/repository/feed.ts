import { desc, eq, inArray } from 'drizzle-orm'

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
  sources,
  vendors,
  videos,
  visits,
  type Comment,
} from '../../db/schema'
import { dateKey } from '../../lib/calendar'
import type { FeedAction, FeedItem } from '../../lib/feed'
import { parseToUtcMs } from '../../lib/jst'

/**
 * For the home "最近の更新" (Recent updates) feed. Each recent* returns n items, newest
 * updatedAt first (createdAt for photos/comments), in FeedItem shape
 * (kind/id/title/subtitle/action/at/by/href).
 * Narrowing the count with limit is the caller's responsibility (mergeFeed in
 * src/server/feed.ts).
 */

/** Right after insertion createdAt and updatedAt nearly match because they come from the
 * same datetime('now') call, so it is 'add'; a row updated later than that (the difference
 * exceeds 60 seconds) is 'update'.
 * If either one is in an unreadable format, fall to the safe side, 'add'. comments/photos
 * do not call this (they have no concept of update and are always 'add'). */
function actionFor(createdAt: string, updatedAt: string): FeedAction {
  const createdMs = parseToUtcMs(createdAt)
  const updatedMs = parseToUtcMs(updatedAt)
  if (createdMs === null || updatedMs === null) return 'add'
  return updatedMs - createdMs > 60_000 ? 'update' : 'add'
}

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
    action: actionFor(r.visit.createdAt, r.visit.updatedAt),
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
    action: actionFor(r.event.createdAt, r.event.updatedAt),
    at: r.event.updatedAt,
    by: r.event.createdBy,
    href: { to: '/calendar', search: { d: dateKey(r.event.startsAt) } },
  }))
}

export async function recentVendors(db: Db, n: number): Promise<FeedItem[]> {
  const rows = await db.select().from(vendors).orderBy(desc(vendors.updatedAt)).limit(n)
  return rows.map((v) => ({
    kind: 'vendor',
    id: v.id,
    title: v.name,
    subtitle: VENDOR_KIND_LABEL[v.kind],
    action: actionFor(v.createdAt, v.updatedAt),
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
    action: actionFor(p.createdAt, p.updatedAt),
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
    action: actionFor(p.createdAt, p.updatedAt),
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
    action: actionFor(v.createdAt, v.updatedAt),
    at: v.updatedAt,
    by: v.createdBy,
    href: { to: '/records/videos/$id', params: { id: v.id } },
  }))
}

/** Every href points to the list page (/sources). Sources have no detail page, so
 * href.params is not set (unlike recentVendors etc., it cannot jump to an id page) */
export async function recentSources(db: Db, n: number): Promise<FeedItem[]> {
  const rows = await db.select().from(sources).orderBy(desc(sources.updatedAt)).limit(n)
  return rows.map((s) => ({
    kind: 'source',
    id: s.id,
    title: s.name,
    subtitle: s.handle ?? undefined,
    action: actionFor(s.createdAt, s.updatedAt),
    at: s.updatedAt,
    by: s.createdBy,
    href: { to: '/sources' },
  }))
}

/**
 * Target id -> display name per targetType. Issuing 1 query per comment would be N+1, so
 * recentComments looks them up in 1 query per targetType, batched (`inArray`).
 * An id that is not found does not enter the Map (the caller turns it into
 * "（削除済み）" (deleted))
 */
async function targetNamesByType(
  db: Db,
  targetType: Comment['targetType'],
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  switch (targetType) {
    case 'vendor': {
      const rows = await db
        .select({ id: vendors.id, name: vendors.name })
        .from(vendors)
        .where(inArray(vendors.id, ids))
      return new Map(rows.map((r) => [r.id, r.name]))
    }
    case 'property': {
      const rows = await db
        .select({ id: properties.id, name: properties.name })
        .from(properties)
        .where(inArray(properties.id, ids))
      return new Map(rows.map((r) => [r.id, r.name]))
    }
    case 'place': {
      const rows = await db
        .select({ id: places.id, name: places.name })
        .from(places)
        .where(inArray(places.id, ids))
      return new Map(rows.map((r) => [r.id, r.name]))
    }
    case 'video': {
      const rows = await db
        .select({ id: videos.id, name: videos.title })
        .from(videos)
        .where(inArray(videos.id, ids))
      return new Map(rows.map((r) => [r.id, r.name]))
    }
    case 'visit': {
      const rows = await db
        .select({ id: visits.id, visitedOn: visits.visitedOn, placeName: places.name })
        .from(visits)
        .leftJoin(places, eq(visits.placeId, places.id))
        .where(inArray(visits.id, ids))
      return new Map(rows.map((r) => [r.id, r.placeName ?? `見学記録（${r.visitedOn}）`]))
    }
  }
}

/** href to the comment target's detail page. Fixed per targetType, so ids of other kinds do not mix in */
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

  // Group the target ids per targetType and issue only as many queries as there are
  // targetType kinds (avoids the N+1 of 1 query per comment)
  const idsByType = new Map<Comment['targetType'], string[]>()
  for (const c of rows) {
    const ids = idsByType.get(c.targetType)
    if (ids) ids.push(c.targetId)
    else idsByType.set(c.targetType, [c.targetId])
  }
  const nameMaps = new Map(
    await Promise.all(
      [...idsByType.entries()].map(
        async ([targetType, ids]) =>
          [targetType, await targetNamesByType(db, targetType, ids)] as const,
      ),
    ),
  )

  return rows.map((c) => ({
    kind: 'comment' as const,
    id: c.id,
    title: c.body,
    subtitle: nameMaps.get(c.targetType)?.get(c.targetId) ?? '（削除済み）',
    action: 'add' as const,
    at: c.createdAt,
    by: c.createdBy,
    href: targetHref(c.targetType, c.targetId),
  }))
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
    action: 'add' as const,
    at: r.photo.createdAt,
    by: r.photo.createdBy,
    href: { to: '/records/visits/$id', params: { id: r.photo.visitId } },
  }))
}
