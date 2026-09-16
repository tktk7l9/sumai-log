import { asc, eq, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import { sources, vendors, type NewSource, type Source } from '../../db/schema'

type SourceInputRow = Omit<NewSource, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & {
  id?: string
}

/** id が無ければ作成、あれば更新。作成者は最初の保存時だけ記録する（videos.ts と同じ形） */
export async function upsertSource(
  db: Db,
  input: SourceInputRow,
  actorEmail: string,
): Promise<string> {
  const { id, ...values } = input
  if (!id) {
    const newId = crypto.randomUUID()
    await db.insert(sources).values({ ...values, id: newId, createdBy: actorEmail })
    return newId
  }
  await db
    .update(sources)
    .set({ ...values, updatedAt: sql`(datetime('now'))` })
    .where(eq(sources.id, id))
  return id
}

/** 情報源を消す。sources.ts の createServerFn ラッパー（公開名 deleteSource）と名前が
 * 被らないよう、repository 側はこの名前にする（videos.ts の deleteVideoCascade と同じ理由） */
export async function deleteSourceRow(db: Db, id: string): Promise<void> {
  await db.delete(sources).where(eq(sources.id, id))
}

/** 一覧: 並び順（sortOrder 昇順→name）で業者名を付ける。並べ替え自体は
 * src/lib/sources.ts の groupSourcesByGenre がジャンルごとに行うので、ここでの
 * 順序は「同じジャンル内でどちらが先か」が既に合っていれば十分 */
export async function listSourcesWithLinks(
  db: Db,
): Promise<(Source & { vendorName: string | null })[]> {
  const rows = await db
    .select({ source: sources, vendorName: vendors.name })
    .from(sources)
    .leftJoin(vendors, eq(sources.vendorId, vendors.id))
    .orderBy(asc(sources.sortOrder), asc(sources.name))
  return rows.map((r) => ({ ...r.source, vendorName: r.vendorName ?? null }))
}
