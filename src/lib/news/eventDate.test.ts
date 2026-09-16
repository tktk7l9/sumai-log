import { describe, expect, it } from 'vitest'

import { extractEvent, inferYear } from './eventDate'

describe('inferYear', () => {
  it('投稿月より2か月以上前の月は翌年とみなす', () => {
    // 投稿が12月で「1月」は11か月前＝2か月以上前 → 翌年
    expect(inferYear(1, '2026-12-20')).toBe(2027)
  })

  it('投稿月の1か月前ちょうどは同年（2か月以上前ではない）', () => {
    expect(inferYear(11, '2026-12-20')).toBe(2026)
    expect(inferYear(1, '2026-02-01')).toBe(2026)
  })

  it('投稿月と同じ、または後の月は同年', () => {
    expect(inferYear(8, '2026-08-01')).toBe(2026)
    expect(inferYear(9, '2026-08-01')).toBe(2026)
  })
})

describe('extractEvent', () => {
  it('仕様の例1: 《9月12日(土)開催》は見学会・単日', () => {
    const text = '【お住まい見学会】Clam Chowder House《9月12日(土)開催》'
    expect(extractEvent(text, '2026-08-20')).toEqual({
      kind: '見学会',
      start: '2026-09-12',
      end: '2026-09-12',
    })
  })

  it('仕様の例2: 7/6-/7 は同月終端の完成見学会', () => {
    const text = '7/6-/7『開拓者の家Ⅱ』完成見学会のおしらせ'
    expect(extractEvent(text, '2026-06-01')).toEqual({
      kind: '完成見学会',
      start: '2026-07-06',
      end: '2026-07-07',
    })
  })

  it('仕様の例3: 列挙（D日・D日）は構造見学会・範囲', () => {
    const text = '"均悉想和" 構造見学会 11月17日(土)・18日(日)'
    expect(extractEvent(text, '2026-10-01')).toEqual({
      kind: '構造見学会',
      start: '2026-11-17',
      end: '2026-11-18',
    })
  })

  it('M/D-M/D（月をまたぐ範囲）', () => {
    const text = 'セミナー 9/12-10/3のご案内'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: 'セミナー',
      start: '2026-09-12',
      end: '2026-10-03',
    })
  })

  it('M/D〜M/D（波ダッシュ U+301C）', () => {
    const text = '相談会 9/12〜9/20'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: '相談会',
      start: '2026-09-12',
      end: '2026-09-20',
    })
  })

  it('M/D～D（全角チルダ U+FF5E・同月終端の日のみ）', () => {
    const text = 'イベント 9/12～15'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: 'イベント',
      start: '2026-09-12',
      end: '2026-09-15',
    })
  })

  it('M/D 単独（範囲なし）', () => {
    const text = '見学会 9/12開催'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: '見学会',
      start: '2026-09-12',
      end: '2026-09-12',
    })
  })

  it('YYYY年M月D日（明示年は投稿日の年より優先）', () => {
    const text = '完成見学会 2026年9月12日開催'
    // 投稿日を全く違う年にしても、本文の明示年が使われる
    expect(extractEvent(text, '2020-01-01')).toEqual({
      kind: '完成見学会',
      start: '2026-09-12',
      end: '2026-09-12',
    })
  })

  it('年またぎ: 投稿12月で「1月10日」は翌年', () => {
    const text = '見学会 1月10日開催'
    expect(extractEvent(text, '2026-12-20')).toEqual({
      kind: '見学会',
      start: '2027-01-10',
      end: '2027-01-10',
    })
  })

  it('列挙が降順でも min/max を正しく計算する', () => {
    const text = '見学会 11月17日(土)・15日(日)'
    expect(extractEvent(text, '2026-10-01')).toEqual({
      kind: '見学会',
      start: '2026-11-15',
      end: '2026-11-17',
    })
  })

  it('オープンハウスは「見学会」を含まなくても見学会になる', () => {
    const text = 'オープンハウス 9/12開催'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: '見学会',
      start: '2026-09-12',
      end: '2026-09-12',
    })
  })

  it('種別語が無ければ日付があっても null', () => {
    expect(extractEvent('9月12日に工事完了予定', '2026-08-01')).toBeNull()
  })

  it('日付がまったく無ければ null', () => {
    expect(extractEvent('セミナーのご案内', '2026-08-01')).toBeNull()
  })

  it('月の手がかりが無い「D日」だけの表記は無視してイベントにしない', () => {
    expect(extractEvent('見学会 15日から受付開始', '2026-08-01')).toBeNull()
  })
})
