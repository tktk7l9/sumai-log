import { beforeEach, describe, expect, it } from 'vitest'

import { readHomeAreas, writeSetting } from './settings'
import { db, reset } from './test-helpers'

beforeEach(reset)

describe('settings', () => {
  it('homeAreas を JSON で往復し、壊れた値は空にする', async () => {
    expect(await readHomeAreas(db)).toEqual([])
    await writeSetting(db, 'homeAreas', JSON.stringify(['テスト市']))
    expect(await readHomeAreas(db)).toEqual(['テスト市'])
    await writeSetting(db, 'homeAreas', '{not json')
    expect(await readHomeAreas(db)).toEqual([])
  })
})
