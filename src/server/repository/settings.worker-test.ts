import { beforeEach, describe, expect, it } from 'vitest'

import { readHomeAreas, readLastSeen, writeLastSeen, writeSetting } from './settings'
import { db, reset } from './test-helpers'

beforeEach(reset)

describe('settings', () => {
  it('homeAreas round-trips as JSON, and a broken value becomes empty', async () => {
    expect(await readHomeAreas(db)).toEqual([])
    await writeSetting(db, 'homeAreas', JSON.stringify(['テスト市']))
    expect(await readHomeAreas(db)).toEqual(['テスト市'])
    await writeSetting(db, 'homeAreas', '{not json')
    expect(await readHomeAreas(db)).toEqual([])
  })

  it('keeps the last used time per email and can overwrite it', async () => {
    expect(await readLastSeen(db)).toEqual({})
    await writeLastSeen(db, 'Owner@Example.com', '2026-09-24T10:00:00.000Z')
    await writeLastSeen(db, 'partner@example.com', '2026-09-24T11:00:00.000Z')
    await writeSetting(db, 'homeAreas', '[]')
    expect(await readLastSeen(db)).toEqual({
      'owner@example.com': '2026-09-24T10:00:00.000Z',
      'partner@example.com': '2026-09-24T11:00:00.000Z',
    })
    await writeLastSeen(db, 'owner@example.com', '2026-09-24T12:00:00.000Z')
    expect((await readLastSeen(db))['owner@example.com']).toBe('2026-09-24T12:00:00.000Z')
  })
})
