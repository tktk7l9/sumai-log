import { beforeEach, describe, expect, it } from 'vitest'

import { comments, visits } from '../../db/schema'
import { deleteOwnComment, insertComment, listComments } from './comments'
import { actor, db, reset } from './test-helpers'
import { deleteVisitCascade } from './visits'

beforeEach(reset)

describe('comments', () => {
  it('古い順に並び、自分のものだけ消せる', async () => {
    const target = crypto.randomUUID()
    const a = await insertComment(
      db,
      { targetType: 'visit', targetId: target, body: '一言' },
      actor,
    )
    const b = await insertComment(
      db,
      { targetType: 'visit', targetId: target, body: '二言' },
      'partner@example.com',
    )
    expect((await listComments(db, 'visit', target)).map((c) => c.id)).toEqual([a, b])
    expect(await deleteOwnComment(db, b, actor)).toBe(false)
    expect(await deleteOwnComment(db, b, 'partner@example.com')).toBe(true)
    expect(await listComments(db, 'visit', target)).toHaveLength(1)
    expect(await db.select().from(comments)).toHaveLength(1)
  })

  it('対象を消すとコメントも消える', async () => {
    const visitId = crypto.randomUUID()
    await db.insert(visits).values({ id: visitId, visitedOn: '2030-01-05', createdBy: actor })
    await insertComment(db, { targetType: 'visit', targetId: visitId, body: '一言' }, actor)
    expect(await listComments(db, 'visit', visitId)).toHaveLength(1)
    await deleteVisitCascade(db, visitId)
    expect(await db.select().from(comments)).toHaveLength(0)
  })
})
