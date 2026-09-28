import { describe, expect, it } from 'vitest'

import { appendAction, parseActions, toggleAction } from './nextActions'

describe('parseActions', () => {
  it('splits by line, removes the marks, and tells done items apart', () => {
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
  it('adds "済 " (done) when marking done and removes it when reverting', () => {
    const text = '見積を頼む\n済 資金計画'
    expect(toggleAction(text, 0)).toBe('済 見積を頼む\n済 資金計画')
    expect(toggleAction(text, 1)).toBe('見積を頼む\n資金計画')
  })

  it('leaves the text as is for a line that does not exist', () => {
    expect(toggleAction('a', 5)).toBe('a')
  })
})

describe('appendAction', () => {
  it('appends at the end. An empty item is not appended', () => {
    expect(appendAction('a\n', ' b ')).toBe('a\nb')
    expect(appendAction(null, 'b')).toBe('b')
    expect(appendAction('a', '  ')).toBe('a')
  })
})
