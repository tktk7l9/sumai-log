import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'

import { getDb } from '../db/client'
import { allMembers, currentActorEmail } from './members'
import { readHomeAreas, readLastSeen } from './repository'
import { measureD1, measureR2, type D1Usage, type R2Usage } from './repository/usage'

export type ResourceUsage = {
  d1: D1Usage | null
  /** null if there is no R2 PHOTOS binding */
  r2: R2Usage | null
}

/**
 * Lets the settings page itself open even if measuring fails (only the usage fields
 * become "取れません" (unavailable))
 */
async function measureUsage(): Promise<ResourceUsage> {
  const [d1, r2] = await Promise.all([
    measureD1(env.DB).catch(() => null),
    env.PHOTOS ? measureR2(env.PHOTOS).catch(() => null) : Promise.resolve(null),
  ])
  return { d1, r2 }
}

export const getSettings = createServerFn().handler(async () => {
  const db = getDb()
  const [homeAreas, actorEmail, lastSeen, usage] = await Promise.all([
    readHomeAreas(db),
    currentActorEmail(),
    readLastSeen(db),
    measureUsage(),
  ])
  return {
    /**
     * Municipalities of the planned building site (matched against the service areas of
     * candidates). Not changed from the screen (read-only)
     */
    homeAreas,
    actorEmail,
    members: allMembers(),
    lastSeen,
    environment: env.ENVIRONMENT ?? 'unknown',
    photosReady: Boolean(env.PHOTOS),
    usage,
  }
})

export const getHomeAreas = createServerFn().handler(async () => readHomeAreas(getDb()))
