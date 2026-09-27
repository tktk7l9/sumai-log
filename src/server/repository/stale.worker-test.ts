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

/** Creates the state where the other person saved (shifts the update time to a different past value) */
async function touch(id: string, at: string): Promise<void> {
  await db
    .update(visits)
    .set({ updatedAt: sql`${at}` })
    .where(eq(visits.id, id))
}

describe('detecting concurrent edits', () => {
  it('saves when the update time from when it was opened matches, and does not overwrite when it differs', async () => {
    const id = await upsertVisit(db, { visitedOn: '2030-01-05', attendees: 'both' }, actor)
    await touch(id, '2030-01-01 00:00:00')
    const opened = await updatedAtOf(id)

    // The other person saves first
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

    // Reopening with the latest update time allows saving
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

  it('overwrites as before when no expected update time is passed (new rows, old screens)', async () => {
    const id = await upsertVisit(db, { visitedOn: '2030-01-05', attendees: 'both' }, actor)
    await expect(
      upsertVisit(db, { id, visitedOn: '2030-01-06', attendees: 'both' }, actor),
    ).resolves.toBe(id)
  })

  it('events use the same mechanism', async () => {
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

  it('saving only "次にやること" (next actions): returns the new update time, and conflicts on a stale baseline', async () => {
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

  it('failures other than a conflict are thrown as is', async () => {
    await expect(saveOrConflict(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
  })
})
