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
  it('作成→更新→削除。施工エリアは JSON 配列で往復し、削除で場所の vendorId が外れる', async () => {
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

  it('代表者名・加盟団体は JSON 配列で往復し、未指定なら null / 空配列になる', async () => {
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

  it('setVendorFaviconKey / setVendorRepresentativePhotoKey は差し替え前の値を返し、updated_at を動かさない', async () => {
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

    // 2 回目は「差し替え前の値」として 1 回目に設定したキーが返り、source も差し替わる
    const prevFavicon2 = await setVendorFaviconKey(db, id, `vendors/${id}/favicon.ico`, 'manual')
    expect(prevFavicon2).toBe(`vendors/${id}/favicon.png`)
    ;[after] = await db.select().from(vendors).where(eq(vendors.id, id))
    expect(after.faviconSource).toBe('manual')

    // key に null・source に null を渡すと両方消せる（削除の形）
    const prevFavicon3 = await setVendorFaviconKey(db, id, null, null)
    expect(prevFavicon3).toBe(`vendors/${id}/favicon.ico`)
    ;[after] = await db.select().from(vendors).where(eq(vendors.id, id))
    expect(after.faviconKey).toBeNull()
    expect(after.faviconSource).toBeNull()

    // null を渡すと消せる
    await setVendorRepresentativePhotoKey(db, id, null)
    ;[after] = await db.select().from(vendors).where(eq(vendors.id, id))
    expect(after.representativePhotoKey).toBeNull()
  })

  it('getVendorFaviconSource は favicon_source を返し、未設定は null', async () => {
    const id = await upsertVendor(
      db,
      { name: 'ソース確認工務店', kind: 'koumuten', serviceAreas: [] },
      actor,
    )
    expect(await getVendorFaviconSource(db, id)).toBeNull()
    await setVendorFaviconKey(db, id, `vendors/${id}/favicon.png`, 'manual')
    expect(await getVendorFaviconSource(db, id)).toBe('manual')
  })

  it('getVendorWebsiteUrl は website_url を返し、無い業者は null', async () => {
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

  it('listVendorsWithWebsite は website_url がある業者だけ返す', async () => {
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

  it('vendorExists は実在する id だけ true を返す（R2 write/delete の前段ガード用）', async () => {
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
  it('作成→削除。紐づく場所の propertyId が外れ、物件へのコメントも消える', async () => {
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
  it('正規化して保存する。空は null', () => {
    expect(
      vendorInput.parse({ ...base, newsEmailDomain: ' A.com, info@B.com ' }).newsEmailDomain,
    ).toBe('a.com,b.com')
    expect(vendorInput.parse({ ...base, newsEmailDomain: '' }).newsEmailDomain).toBeNull()
    expect(vendorInput.parse({ ...base, newsEmailDomain: null }).newsEmailDomain).toBeNull()
  })
})
