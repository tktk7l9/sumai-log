import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '../db/client'
import { GEOCODE_SOURCES, PLACE_KINDS, places, properties, vendors } from '../db/schema'
import { parseCoordinate } from '../lib/coords'
import { UUID_SHAPE } from '../lib/ids'
import { currentActorEmail } from './members'
import { deletePlaceCascade, hasVisits, listPlacesWithLinks, upsertPlace } from './repository'

const idInput = z.object({ id: z.string().regex(UUID_SHAPE, 'id の形式が不正です') })
const optionalText = z
  .string()
  .trim()
  .max(2000)
  .transform((v) => (v === '' ? null : v))
  .nullable()

export const placeInput = z
  .object({
    id: z.string().regex(UUID_SHAPE, 'id の形式が不正です').optional(),
    name: z.string().trim().min(1, '名前は必須です').max(200),
    kind: z.enum(PLACE_KINDS),
    address: optionalText,
    /** 住所検索で得た座標（画面が /api/geocode を呼んで埋める） */
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
    /** 手貼りの座標。入っていれば lat/lng より優先し geocodeSource='manual' */
    coordsText: optionalText,
    geocodeSource: z.enum(GEOCODE_SOURCES).nullable(),
    vendorId: z.string().regex(UUID_SHAPE, 'id の形式が不正です').nullable(),
    propertyId: z.string().regex(UUID_SHAPE, 'id の形式が不正です').nullable(),
    note: optionalText,
  })
  .transform((v) => {
    if (v.coordsText) {
      const parsed = parseCoordinate(v.coordsText)
      if (parsed)
        return { ...v, lat: parsed.lat, lng: parsed.lng, geocodeSource: 'manual' as const }
    }
    return v
  })
export type PlaceInput = z.input<typeof placeInput>

export const listPlaces = createServerFn().handler(async () => listPlacesWithLinks(getDb()))

export const getPlace = createServerFn()
  .validator(idInput)
  .handler(async ({ data }) => {
    const db = getDb()
    const [place] = await db.select().from(places).where(eq(places.id, data.id)).limit(1)
    if (!place) throw new Response('Not Found', { status: 404 })
    const [vendor] = place.vendorId
      ? await db.select().from(vendors).where(eq(vendors.id, place.vendorId)).limit(1)
      : []
    const [property] = place.propertyId
      ? await db.select().from(properties).where(eq(properties.id, place.propertyId)).limit(1)
      : []
    const visited = await hasVisits(db, place.id)
    return { place, vendor: vendor ?? null, property: property ?? null, visited }
  })

export const savePlace = createServerFn({ method: 'POST' })
  .validator(placeInput)
  .handler(async ({ data }) => ({
    id: await upsertPlace(getDb(), data, await currentActorEmail()),
  }))

export const deletePlace = createServerFn({ method: 'POST' })
  .validator(idInput)
  .handler(async ({ data }) => deletePlaceCascade(getDb(), data.id))

/** 候補フォームの選択肢 */
export const listLinkTargets = createServerFn().handler(async () => {
  const db = getDb()
  const [v, p] = await Promise.all([
    db.select({ id: vendors.id, name: vendors.name }).from(vendors).orderBy(vendors.name),
    db
      .select({ id: properties.id, name: properties.name })
      .from(properties)
      .orderBy(properties.name),
  ])
  return { vendors: v, properties: p }
})
