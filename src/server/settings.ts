import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'

import { getDb } from '../db/client'
import { allMembers, currentActorEmail } from './members'
import { readHomeAreas, readLastSeen } from './repository'
import { measureD1, measureR2, type D1Usage, type R2Usage } from './repository/usage'

export type ResourceUsage = {
  d1: D1Usage | null
  /** R2 の PHOTOS バインディングが無ければ null */
  r2: R2Usage | null
}

/** 計測に失敗しても設定ページ自体は開けるようにする（使用量の欄だけ「取れません」になる） */
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
    /** 建築予定地の市区町村（候補の施工エリアと照合）。画面からは変えない（読み取り専用） */
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
