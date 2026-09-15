import { and, asc, eq } from 'drizzle-orm'

import type { Db } from '../../db/client'
import { comments, type Comment } from '../../db/schema'

export async function listComments(
  db: Db,
  targetType: Comment['targetType'],
  targetId: string,
): Promise<Comment[]> {
  return db
    .select()
    .from(comments)
    .where(and(eq(comments.targetType, targetType), eq(comments.targetId, targetId)))
    .orderBy(asc(comments.createdAt))
}

export async function insertComment(
  db: Db,
  input: { targetType: Comment['targetType']; targetId: string; body: string },
  actorEmail: string,
): Promise<string> {
  const id = crypto.randomUUID()
  await db.insert(comments).values({ ...input, id, createdBy: actorEmail })
  return id
}

/** 自分のコメントだけ消せる。消せたら true */
export async function deleteOwnComment(db: Db, id: string, actorEmail: string): Promise<boolean> {
  const [row] = await db
    .select({ createdBy: comments.createdBy })
    .from(comments)
    .where(eq(comments.id, id))
    .limit(1)
  if (!row || row.createdBy !== actorEmail) return false
  await db.delete(comments).where(eq(comments.id, id))
  return true
}
