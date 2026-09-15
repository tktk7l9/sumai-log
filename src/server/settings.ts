import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDb } from '../db/client'
import { parseAreaList } from '../lib/serviceArea'
import { allMembers, currentActorEmail } from './members'
import { readHomeAreas, writeSetting } from './repository'

export const getSettings = createServerFn().handler(async () => {
  const db = getDb()
  const [homeAreas, actorEmail] = await Promise.all([readHomeAreas(db), currentActorEmail()])
  return {
    homeAreas,
    actorEmail,
    members: allMembers(),
    environment: env.ENVIRONMENT ?? 'unknown',
    photosReady: Boolean(env.PHOTOS),
  }
})

export const saveHomeAreas = createServerFn({ method: 'POST' })
  .validator(z.object({ areas: z.string().max(500) }))
  .handler(async ({ data }) => {
    const areas = parseAreaList(data.areas)
    await writeSetting(getDb(), 'homeAreas', JSON.stringify(areas))
    return { ok: true as const, areas }
  })

export const getHomeAreas = createServerFn().handler(async () => readHomeAreas(getDb()))
