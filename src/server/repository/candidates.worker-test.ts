import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { comments, places, vendors } from '../../db/schema'
import { vendorInput } from '../candidates.schema'
import {
  deletePropertyCascade,
  deleteVendorCascade,
  getVendorFaviconSource,
  getVendorWebsiteUrl,
  listVendorsWithWebsite,
  setVendorFaviconKey,
  setVendorRepresentativePhotoKey,
  upsertProperty,
  upsertVendor,
  vendorExists,
} from './candidates'
import { upsertPlace } from './places'
import { actor, db, reset } from './test-helpers'

beforeEach(reset)

describe('vendors', () => {
  it('create -> update -> delete. Service areas round-trip as a JSON array, and deletion detaches vendorId from places', async () => {
    const id = await upsertVendor(
      db,
      { name: '甲工務店', kind: 'koumuten', serviceAreas: ['テスト市'] },
      actor,
    )
    let [row] = await db.select().from(vendors).where(eq(vendors.id, id))
    expect(row.serviceAreas).toEqual(['テスト市'])
    expect(row.createdBy).toBe(actor)

    await upsertVendor(
      db,
      { id, name: '甲工務店', kind: 'hm', serviceAreas: [] },
      'partner@example.com',
    )
    ;[row] = await db.select().from(vendors).where(eq(vendors.id, id))
    expect(row.kind).toBe('hm')
    expect(row.createdBy).toBe(actor)

    const placeId = await upsertPlace(
      db,
      { name: 'テスト展示場', kind: 'showroom', vendorId: id },
      actor,
    )
    await deleteVendorCascade(db, id)
    const [place] = await db.select().from(places).where(eq(places.id, placeId))
    expect(place.vendorId).toBeNull()
  })

  it('representative name and affiliations round-trip as a JSON array, and become null / an empty array when not given', async () => {
    const id = await upsertVendor(
      db,
      {
        name: '乙工務店',
        kind: 'koumuten',
        serviceAreas: [],
        representative: '架空太郎',
        affiliations: ['iedukuri100', 'miratsugu'],
      },
      actor,
    )
    let [row] = await db.select().from(vendors).where(eq(vendors.id, id))
    expect(row.representative).toBe('架空太郎')
    expect(row.affiliations).toEqual(['iedukuri100', 'miratsugu'])

    const otherId = await upsertVendor(
      db,
      { name: '丙工務店', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    ;[row] = await db.select().from(vendors).where(eq(vendors.id, otherId))
    expect(row.representative).toBeNull()
    expect(row.affiliations).toEqual([])
  })

  it('setVendorFaviconKey / setVendorRepresentativePhotoKey return the value before the replacement and do not touch updated_at', async () => {
    const id = await upsertVendor(
      db,
      { name: 'キー更新工務店', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    const [before] = await db.select().from(vendors).where(eq(vendors.id, id))

    const prevFavicon = await setVendorFaviconKey(db, id, `vendors/${id}/favicon.png`, 'auto')
    expect(prevFavicon).toBeNull()
    const prevPhoto = await setVendorRepresentativePhotoKey(
      db,
      id,
      `vendors/${id}/representative-display.jpg`,
    )
    expect(prevPhoto).toBeNull()

    let [after] = await db.select().from(vendors).where(eq(vendors.id, id))
    expect(after.faviconKey).toBe(`vendors/${id}/favicon.png`)
    expect(after.faviconSource).toBe('auto')
    expect(after.representativePhotoKey).toBe(`vendors/${id}/representative-display.jpg`)
    expect(after.updatedAt).toBe(before.updatedAt)

    // The 2nd call returns the key set by the 1st call as "the value before the
    // replacement", and source is replaced too
    const prevFavicon2 = await setVendorFaviconKey(db, id, `vendors/${id}/favicon.ico`, 'manual')
    expect(prevFavicon2).toBe(`vendors/${id}/favicon.png`)
    ;[after] = await db.select().from(vendors).where(eq(vendors.id, id))
    expect(after.faviconSource).toBe('manual')

    // Passing null for key and null for source clears both (the deletion form)
    const prevFavicon3 = await setVendorFaviconKey(db, id, null, null)
    expect(prevFavicon3).toBe(`vendors/${id}/favicon.ico`)
    ;[after] = await db.select().from(vendors).where(eq(vendors.id, id))
    expect(after.faviconKey).toBeNull()
    expect(after.faviconSource).toBeNull()

    // Passing null clears it
    await setVendorRepresentativePhotoKey(db, id, null)
    ;[after] = await db.select().from(vendors).where(eq(vendors.id, id))
    expect(after.representativePhotoKey).toBeNull()
  })

  it('getVendorFaviconSource returns favicon_source, and null when not set', async () => {
    const id = await upsertVendor(
      db,
      { name: 'ソース確認工務店', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    expect(await getVendorFaviconSource(db, id)).toBeNull()
    await setVendorFaviconKey(db, id, `vendors/${id}/favicon.png`, 'manual')
    expect(await getVendorFaviconSource(db, id)).toBe('manual')
  })

  it('getVendorWebsiteUrl returns website_url, and null for a vendor without one', async () => {
    const id = await upsertVendor(
      db,
      {
        name: 'URL業者',
        kind: 'koumuten',
        serviceAreas: [],
        websiteUrl: 'https://vendor.example.com/',
      },
      actor,
    )
    expect(await getVendorWebsiteUrl(db, id)).toBe('https://vendor.example.com/')

    const noUrlId = await upsertVendor(
      db,
      { name: 'URL無し業者', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    expect(await getVendorWebsiteUrl(db, noUrlId)).toBeNull()
    expect(await getVendorWebsiteUrl(db, '11111111-1111-1111-1111-111111111111')).toBeNull()
  })

  it('listVendorsWithWebsite returns only vendors that have website_url', async () => {
    const withUrlId = await upsertVendor(
      db,
      {
        name: 'URLあり',
        kind: 'koumuten',
        serviceAreas: [],
        websiteUrl: 'https://vendor.example.com/',
      },
      actor,
    )
    await upsertVendor(db, { name: 'URLなし', kind: 'koumuten', serviceAreas: [] }, actor)

    const rows = await listVendorsWithWebsite(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      id: withUrlId,
      name: 'URLあり',
      websiteUrl: 'https://vendor.example.com/',
      newsUrl: null,
      faviconKey: null,
      faviconSource: null,
      newsFetchError: null,
    })
  })

  it('vendorExists returns true only for an id that really exists (for the guard before R2 write/delete)', async () => {
    const id = await upsertVendor(
      db,
      { name: '存在確認業者', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    expect(await vendorExists(db, id)).toBe(true)
    expect(await vendorExists(db, '99999999-9999-9999-9999-999999999999')).toBe(false)

    await deleteVendorCascade(db, id)
    expect(await vendorExists(db, id)).toBe(false)
  })
})

describe('properties', () => {
  it('create -> delete. propertyId on linked places is detached, and comments on the property are deleted too', async () => {
    const id = await upsertProperty(
      db,
      { name: 'テストマンション', address: '東京都渋谷区' },
      actor,
    )

    const placeId = await upsertPlace(
      db,
      { name: 'テストギャラリー', kind: 'gallery', propertyId: id },
      actor,
    )
    const commentId = crypto.randomUUID()
    await db.insert(comments).values({
      id: commentId,
      targetType: 'property',
      targetId: id,
      body: '感想です',
      createdBy: actor,
    })

    await deletePropertyCascade(db, id)

    const [place] = await db.select().from(places).where(eq(places.id, placeId))
    expect(place.propertyId).toBeNull()
    const [comment] = await db.select().from(comments).where(eq(comments.id, commentId))
    expect(comment).toBeUndefined()
  })
})

describe('vendorInput.newsEmailDomain', () => {
  const base = {
    name: 'x',
    kind: 'koumuten' as const,
    serviceAreas: [],
    affiliations: [],
    affiliationLinks: {},
    uaValue: null,
    cValuePublished: false,
    seismicGrade: null,
    longTermCertified: false,
    pricePerTsuboMin: null,
    pricePerTsuboMax: null,
    structure: null,
    features: null,
    status: 'interested' as const,
    sourceUrl: null,
    websiteUrl: null,
    socialUrls: [],
    newsUrl: null,
    newsSource: null,
    hq: null,
    representative: null,
  }
  it('normalizes and saves. Empty becomes null', () => {
    expect(
      vendorInput.parse({ ...base, newsEmailDomain: ' A.com, info@B.com ' }).newsEmailDomain,
    ).toBe('a.com,b.com')
    expect(vendorInput.parse({ ...base, newsEmailDomain: '' }).newsEmailDomain).toBeNull()
    expect(vendorInput.parse({ ...base, newsEmailDomain: null }).newsEmailDomain).toBeNull()
  })
})
