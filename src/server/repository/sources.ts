import { asc, eq, sql } from 'drizzle-orm'

import type { Db } from '../../db/client'
import { sources, vendors, type NewSource, type Source } from '../../db/schema'
import { DUPLICATE_URL_ERROR } from '../../lib/sources'

type SourceInputRow = Omit<NewSource, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & {
  id?: string
}

/** 更新対象の id が既に消えている（もう一方の端末が先に削除した等）ときのメッセージ。
 * 404 相当の「無い」を表す例外として投げる（saveSource の呼び出し元は
 * extractFormError 経由でそのままトーストに出す） */
export const SOURCE_NOT_FOUND_ERROR = '情報源が見つかりません（既に削除されている可能性があります）'

/** D1（SQLite）の UNIQUE 制約違反を、sources.url のものだけ判別する。drizzle-orm/d1 は
 * 実際の SQLite エラーを `error.cause`（DrizzleQueryError#cause）に持つ（`error.message` は
 * 実行した SQL 文そのもの）。メッセージは
 * `D1_ERROR: UNIQUE constraint failed: sources.url: SQLITE_CONSTRAINT …` の形。 */
function isDuplicateUrlError(e: unknown): boolean {
  const cause = e instanceof Error ? (e as { cause?: unknown }).cause : undefined
  const message = cause instanceof Error ? cause.message : e instanceof Error ? e.message : ''
  return message.includes('UNIQUE constraint failed: sources.url')
}

/**
 * id が無ければ作成、あれば更新。作成者は最初の保存時だけ記録する（videos.ts と同じ形）。
 * - 更新なのに対象の id が既に無ければ `SOURCE_NOT_FOUND_ERROR` を投げる（今までは 0 行
 *   更新のまま黙って成功扱いだった）
 * - url の UNIQUE 制約違反（作成・更新どちらでも起こりうる）は `DUPLICATE_URL_ERROR` に
 *   言い換えて投げる。SourceForm.tsx はこの文言を見て URL 欄にフィールドエラーを出す
 */
export async function upsertSource(
  db: Db,
  input: SourceInputRow,
  actorEmail: string,
): Promise<string> {
  const { id, ...values } = input
  try {
    if (!id) {
      const newId = crypto.randomUUID()
      await db.insert(sources).values({ ...values, id: newId, createdBy: actorEmail })
      return newId
    }
    const updated = await db
      .update(sources)
      .set({ ...values, updatedAt: sql`(datetime('now'))` })
      .where(eq(sources.id, id))
      .returning({ id: sources.id })
    if (updated.length === 0) throw new Error(SOURCE_NOT_FOUND_ERROR)
    return id
  } catch (e) {
    if (isDuplicateUrlError(e)) throw new Error(DUPLICATE_URL_ERROR)
    throw e
  }
}

/** 情報源を消す。行が無ければ何もせず null（videos.ts の deleteVideoCascade と違い、
 * ここは戻り値で「消せたか」を呼び出し元に返す。src/server/repository/photos.ts の
 * deletePhotoRow と同じ形: select で存在確認してから delete し、消した行 or null を返す）。
 * sources.ts の createServerFn ラッパー（公開名 deleteSource）と名前が被らないよう、
 * repository 側はこの名前にする（videos.ts の deleteVideoCascade と同じ理由） */
export async function deleteSourceRow(db: Db, id: string): Promise<Source | null> {
  const [row] = await db.select().from(sources).where(eq(sources.id, id)).limit(1)
  if (!row) return null
  await db.delete(sources).where(eq(sources.id, id))
  return row
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
