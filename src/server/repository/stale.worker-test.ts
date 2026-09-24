import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { visits } from '../../db/schema'
import { upsertEvent } from './events'
import { StaleWriteError, saveOrConflict } from './stale'
import { actor, db, reset } from './test-helpers'
import { setVisitNextActions, upsertVisit } from './visits'

beforeEach(reset)

async function updatedAtOf(id: string): Promise<string> {
  const [row] = await db.select({ u: visits.updatedAt }).from(visits).where(eq(visits.id, id))
  return row!.u
}

/** 相手が保存した状態を作る（更新日時を過去の別の値にずらす） */
async function touch(id: string, at: string): Promise<void> {
  await db
    .update(visits)
    .set({ updatedAt: sql`${at}` })
    .where(eq(visits.id, id))
}

describe('同時編集の検出', () => {
  it('開いた時点の更新日時が一致すれば保存でき、違えば上書きしない', async () => {
    const id = await upsertVisit(db, { visitedOn: '2030-01-05', attendees: 'both' }, actor)
    await touch(id, '2030-01-01 00:00:00')
    const opened = await updatedAtOf(id)

    // 相手が先に保存
    await upsertVisit(db, { id, visitedOn: '2030-01-05', attendees: 'both', good: '相手' }, actor)

    const res = await saveOrConflict(() =>
      upsertVisit(
        db,
        { id, expectedUpdatedAt: opened, visitedOn: '2030-01-05', attendees: 'both', good: '自分' },
        actor,
      ),
    )
    expect(res).toEqual({ id: null, conflict: true })
    const [row] = await db.select().from(visits).where(eq(visits.id, id))
    expect(row!.good).toBe('相手')

    // 最新の更新日時で開き直せば保存できる
    const latest = await updatedAtOf(id)
    const ok = await saveOrConflict(() =>
      upsertVisit(
        db,
        { id, expectedUpdatedAt: latest, visitedOn: '2030-01-05', attendees: 'both', good: '自分' },
        actor,
      ),
    )
    expect(ok).toEqual({ id, conflict: false })
  })

  it('期待する更新日時を渡さなければ従来どおり上書きする（新規・古い画面）', async () => {
    const id = await upsertVisit(db, { visitedOn: '2030-01-05', attendees: 'both' }, actor)
    await expect(
      upsertVisit(db, { id, visitedOn: '2030-01-06', attendees: 'both' }, actor),
    ).resolves.toBe(id)
  })

  it('予定も同じ仕組み', async () => {
    const id = await upsertEvent(
      db,
      { title: 'テスト', kind: 'visit', startsAt: '2030-01-05', allDay: true },
      actor,
    )
    await expect(
      upsertEvent(
        db,
        {
          id,
          expectedUpdatedAt: '1999-01-01 00:00:00',
          title: 'x',
          kind: 'visit',
          startsAt: '2030-01-05',
          allDay: true,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(StaleWriteError)
  })

  it('次にやることだけの保存: 新しい更新日時を返し、古い基準なら競合', async () => {
    const id = await upsertVisit(
      db,
      { visitedOn: '2030-01-05', attendees: 'both', nextActions: '見積を頼む' },
      actor,
    )
    await touch(id, '2030-01-01 00:00:00')
    const next = await setVisitNextActions(db, id, '済 見積を頼む', '2030-01-01 00:00:00')
    expect(next).not.toBe('2030-01-01 00:00:00')
    await expect(setVisitNextActions(db, id, 'x', '2030-01-01 00:00:00')).rejects.toBeInstanceOf(
      StaleWriteError,
    )
    const [row] = await db.select().from(visits).where(eq(visits.id, id))
    expect(row!.nextActions).toBe('済 見積を頼む')
  })

  it('競合以外の失敗はそのまま投げる', async () => {
    await expect(saveOrConflict(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
  })
})
