import { describe, expect, it } from 'vitest'

import { appendAction, parseActions, toggleAction } from './nextActions'

describe('parseActions', () => {
  it('行ごとに分け、印を外し、済みを見分ける', () => {
    expect(parseActions('・見積を頼む\n済 資金計画\n\n✓ 電話\n- \n1. 土地の資料')).toEqual([
      { line: 0, text: '見積を頼む', done: false },
      { line: 1, text: '資金計画', done: true },
      { line: 3, text: '電話', done: true },
      { line: 5, text: '土地の資料', done: false },
    ])
    expect(parseActions(null)).toEqual([])
  })
})

describe('toggleAction', () => {
  it('済にするときは「済 」を付け、戻すときは外す', () => {
    const text = '見積を頼む\n済 資金計画'
    expect(toggleAction(text, 0)).toBe('済 見積を頼む\n済 資金計画')
    expect(toggleAction(text, 1)).toBe('見積を頼む\n資金計画')
  })

  it('無い行はそのまま', () => {
    expect(toggleAction('a', 5)).toBe('a')
  })
})

describe('appendAction', () => {
  it('末尾に足す。空の項目は足さない', () => {
    expect(appendAction('a\n', ' b ')).toBe('a\nb')
    expect(appendAction(null, 'b')).toBe('b')
    expect(appendAction('a', '  ')).toBe('a')
  })
})
