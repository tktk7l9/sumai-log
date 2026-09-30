/**
 * Fictional fixtures for the UI tests. Every name, address and e-mail here is made up
 * (AGENTS.md rule 1: no real data in the repository). Places carry no coordinates unless a
 * test sets them, and those use round, made-up values.
 */
import { vi } from 'vitest'

import type {
  Comment,
  Event,
  Photo,
  Place,
  Property,
  Source,
  Vendor,
  VendorNews,
  Video,
  Visit,
} from '../../src/db/schema'
import type { Member } from '../../src/lib/members'

const STAMP = '2026-09-01 00:00:00'
const OWNER = 'owner@example.com'

export const MEMBERS: Member[] = [
  { email: 'owner@example.com', displayName: '甲', color: 'teal' },
  { email: 'partner@example.com', displayName: '乙', color: 'pink' },
]

export function vendor(over: Partial<Vendor> = {}): Vendor {
  return {
    id: 'v1',
    name: 'テスト工務店',
    kind: 'koumuten',
    hq: 'テスト市',
    representative: null,
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
    status: 'interested',
    sourceUrl: null,
    websiteUrl: null,
    socialUrls: [],
    newsUrl: null,
    newsSource: null,
    newsFetchedAt: null,
    newsFetchError: null,
    newsEmailDomain: null,
    representativePhotoKey: null,
    faviconKey: null,
    faviconSource: null,
    research: null,
    createdBy: OWNER,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...over,
  }
}

export function property(over: Partial<Property> = {}): Property {
  return {
    id: 'p1',
    name: 'テストレジデンス',
    address: 'テスト市1-2-3',
    station: 'テスト駅',
    walkMinutes: 8,
    price: 45_000_000,
    areaSqm: 70.5,
    layout: '3LDK',
    builtYear: 2020,
    completionDate: null,
    managementFee: 12_000,
    repairReserve: 9_000,
    listingUrl: null,
    note: null,
    status: 'interested',
    createdBy: OWNER,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...over,
  }
}

export function place(over: Partial<Place> = {}): Place {
  return {
    id: 'pl1',
    name: 'テスト展示場',
    kind: 'showroom',
    address: 'テスト市4-5-6',
    lat: null,
    lng: null,
    coordsText: null,
    geocodeSource: null,
    vendorId: null,
    propertyId: null,
    note: null,
    createdBy: OWNER,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...over,
  }
}

export function event(over: Partial<Event> = {}): Event {
  return {
    id: 'e1',
    title: 'モデルハウス見学',
    kind: 'visit',
    startsAt: '2026-10-10T10:00:00+09:00',
    endsAt: null,
    allDay: false,
    placeId: null,
    vendorId: null,
    propertyId: null,
    note: null,
    createdBy: OWNER,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...over,
  }
}

export function visit(over: Partial<Visit> = {}): Visit {
  return {
    id: 'vi1',
    eventId: null,
    placeId: null,
    vendorId: null,
    propertyId: null,
    visitedOn: '2026-09-20',
    attendees: 'both',
    good: '日当たりが良い',
    concerns: '収納が少ない',
    qa: null,
    nextActions: null,
    createdBy: OWNER,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...over,
  }
}

export function photo(over: Partial<Photo> = {}): Photo {
  return {
    id: 'ph1',
    visitId: 'vi1',
    displayKey: 'photos/vi1/ph1-display.jpg',
    thumbKey: 'photos/vi1/ph1-thumb.jpg',
    width: 1600,
    height: 1200,
    caption: null,
    sortOrder: 0,
    createdBy: OWNER,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...over,
  }
}

export function video(over: Partial<Video> = {}): Video {
  return {
    id: 'vd1',
    url: 'https://www.youtube.com/watch?v=abcdefghijk',
    videoId: 'abcdefghijk',
    title: '断熱の基本を解説',
    channel: 'テストチャンネル',
    thumbnailUrl: null,
    watchedOn: '2026-09-15',
    watchedBy: 'both',
    tags: ['断熱'],
    takeaways: 'UA値は0.46以下を目安にする',
    vendorId: null,
    createdBy: OWNER,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...over,
  }
}

export function comment(over: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    targetType: 'vendor',
    targetId: 'v1',
    body: '担当者の説明が丁寧だった',
    createdBy: OWNER,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...over,
  }
}

export function news(over: Partial<VendorNews> = {}): VendorNews {
  return {
    id: 'n1',
    vendorId: 'v1',
    url: 'https://example.com/news/1',
    title: '完成見学会のお知らせ',
    summary: null,
    publishedOn: '2026-09-25',
    eventStart: null,
    eventEnd: null,
    eventKind: null,
    plannedEventId: null,
    mailId: null,
    firstSeenAt: STAMP,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...over,
  }
}

export function source(over: Partial<Source> = {}): Source {
  return {
    id: 's1',
    kind: 'youtube',
    name: 'テスト住宅チャンネル',
    url: 'https://www.youtube.com/@test-house',
    handle: '@test-house',
    channelId: null,
    genre: 'knowledge',
    description: null,
    avatarUrl: null,
    vendorId: null,
    affiliation: null,
    sortOrder: 0,
    createdBy: OWNER,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...over,
  }
}

/** Make a server function (a `vi.fn()` in the UI tests, see test/ui/setup.ts) resolve to `value` */
export function stub(fn: unknown, value: unknown) {
  const mock = vi.mocked(fn as (...args: unknown[]) => Promise<unknown>)
  mock.mockResolvedValue(value)
  return mock
}

/** The mock behind a server function, for asserting how it was called */
export function mockOf(fn: unknown) {
  return vi.mocked(fn as (...args: unknown[]) => Promise<unknown>)
}

/** A fixed UUID-shaped id (detail routes reject ids of any other shape) */
export function uid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
}
