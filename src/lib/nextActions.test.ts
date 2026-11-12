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

describe('words that only look like a mark', () => {
  it('does not take 完了 / 済 at the head of an ordinary word for the done mark', () => {
    expect(parseActions('完了検査の立会い日を確認\n済んでいない書類を出す')).toEqual([
      { line: 0, text: '完了検査の立会い日を確認', done: false },
      { line: 1, text: '済んでいない書類を出す', done: false },
    ])
  })

  it('ticking and unticking such a line keeps every character', () => {
    const ticked = toggleAction('完了検査の立会い日を確認', 0)
    expect(ticked).toBe('済 完了検査の立会い日を確認')
    expect(parseActions(ticked)).toEqual([
      { line: 0, text: '完了検査の立会い日を確認', done: true },
    ])
    expect(toggleAction(ticked, 0)).toBe('完了検査の立会い日を確認')
  })

  it('still reads the marks people write: with a space, a colon, み, or alone', () => {
    expect(
      parseActions('済 電話\n済み 見積もり\n完了: 予約\n完了：資料請求\n✓契約書\n[x] 測量\n済').map(
        (a) => [a.text, a.done],
      ),
    ).toEqual([
      ['電話', true],
      ['見積もり', true],
      ['予約', true],
      ['資料請求', true],
      ['契約書', true],
      ['測量', true],
    ])
  })

  it('does not take the integer part of a decimal or a date for a numbered bullet', () => {
    expect(parseActions('10.5畳のLDKを確認\n2026.11.20までに書類提出\n1. 電話\n2)予約')).toEqual([
      { line: 0, text: '10.5畳のLDKを確認', done: false },
      { line: 1, text: '2026.11.20までに書類提出', done: false },
      { line: 2, text: '電話', done: false },
      { line: 3, text: '予約', done: false },
    ])
  })
})
