import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDb } from '../db/client'
import { mergeFeed, type FeedItem } from '../lib/feed'
import {
  recentComments,
  recentEvents,
  recentPhotos,
  recentPlaces,
  recentProperties,
  recentVendors,
  recentVideos,
  recentVisits,
} from './repository'

/** ホームの「最近の更新」。各系統から 10 件ずつ集め、時系列で limit 件に絞る */
export const recentFeed = createServerFn()
  .validator(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional())
  .handler(async ({ data }): Promise<FeedItem[]> => {
    const db = getDb()
    const limit = data?.limit ?? 20
    const groups = await Promise.all([
      recentVisits(db, 10),
      recentEvents(db, 10),
      recentVendors(db, 10),
      recentProperties(db, 10),
      recentPlaces(db, 10),
      recentVideos(db, 10),
      recentComments(db, 10),
      recentPhotos(db, 10),
    ])
    return mergeFeed(groups, limit)
  })
