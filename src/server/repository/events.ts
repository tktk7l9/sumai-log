import { asc, eq, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import { events, places, properties, vendors, type NewEvent } from '../../db/schema'

type EventInput = Omit<NewEvent, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & { id?: string }

export async function upsertEvent(db: Db, input: EventInput, actorEmail: string): Promise<string> {
  const { id, ...values } = input
  if (!id) {
    const newId = crypto.randomUUID()
    await db.insert(events).values({ ...values, id: newId, createdBy: actorEmail })
    return newId
  }
  await db
    .update(events)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(eq(events.id, id))
  return id
}

/** 予定を消す。見学記録の eventId は FK の SET NULL で外れる（記録は残る） */
export async function deleteEvent(db: Db, id: string): Promise<void> {
  await db.delete(events).where(eq(events.id, id))
}

export async function listEventsBetween(db: Db, fromKey: string, toKey: string) {
  return db
    .select()
    .from(events)
    .where(sql`substr(${events.startsAt}, 1, 10) between ${fromKey} and ${toKey}`)
    .orderBy(asc(events.startsAt))
}

export async function listAllEvents(db: Db) {
  return db.select().from(events).orderBy(asc(events.startsAt))
}

export async function listEventsWithLinks(db: Db, fromKey: string, toKey: string) {
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
    .where(sql`substr(${events.startsAt}, 1, 10) between ${fromKey} and ${toKey}`)
    .orderBy(asc(events.startsAt))
  return rows.map((r) => ({
    ...r.event,
    placeName: r.placeName ?? null,
    vendorName: r.vendorName ?? null,
    propertyName: r.propertyName ?? null,
  }))
}
export type EventWithLinks = Awaited<ReturnType<typeof listEventsWithLinks>>[number]
