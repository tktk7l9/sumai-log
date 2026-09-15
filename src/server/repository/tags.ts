import { sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import { DEFAULT_TAGS, tags, type Tag } from '../../db/schema'

export async function listTags(db: Db): Promise<Tag[]> {
  return db.select().from(tags).orderBy(tags.sortOrder, tags.name)
}

/** 無い名前だけ末尾の sortOrder で足す。既存名・呼び出し内の重複名は無視する */
export async function ensureTags(db: Db, names: string[]): Promise<void> {
  const existing = new Set((await db.select({ name: tags.name }).from(tags)).map((r) => r.name))
  const missing = [...new Set(names)].filter((n) => !existing.has(n))
  if (missing.length === 0) return
  const [row] = await db
    .select({ next: sql<number>`coalesce(max(${tags.sortOrder}), -1) + 1` })
    .from(tags)
  const base = Number(row?.next ?? 0)
  await db
    .insert(tags)
    .values(missing.map((name, i) => ({ id: crypto.randomUUID(), name, sortOrder: base + i })))
}

/** 並び＝配列順で全置換。動画側の tags は文字列配列で tags テーブルを参照していないため影響しない */
export async function replaceTags(db: Db, names: string[]): Promise<void> {
  await db.delete(tags)
  const unique = [...new Set(names)]
  if (unique.length === 0) return
  await db
    .insert(tags)
    .values(unique.map((name, i) => ({ id: crypto.randomUUID(), name, sortOrder: i })))
}

/** 0 件のときだけ既定タグ（仕様 §3）を入れる。何度呼んでも冪等 */
export async function seedDefaultTags(db: Db): Promise<void> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(tags)
  if (Number(row?.n ?? 0) > 0) return
  await db
    .insert(tags)
    .values(DEFAULT_TAGS.map((name, i) => ({ id: crypto.randomUUID(), name, sortOrder: i })))
}
