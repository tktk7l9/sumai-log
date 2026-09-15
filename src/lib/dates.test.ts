import { describe, expect, it } from 'vitest'

import { parseDateInput } from './dates'

describe('parseDateInput', () => {
  it('保存する形はそのまま通す', () => {
    expect(parseDateInput('2026-07-30')).toBe('2026-07-30')
  })

  it('0 埋めが無くても読む', () => {
    expect(parseDateInput('2026-7-3')).toBe('2026-07-03')
  })

  it('スラッシュ・ドット区切りを読む', () => {
    expect(parseDateInput('2026/07/30')).toBe('2026-07-30')
    expect(parseDateInput('2026/7/30')).toBe('2026-07-30')
    expect(parseDateInput('2026.7.30')).toBe('2026-07-30')
  })

  it('区切り無しの8桁を読む', () => {
    expect(parseDateInput('20260730')).toBe('2026-07-30')
  })

  it('日本語表記を読む', () => {
    expect(parseDateInput('2026年7月30日')).toBe('2026-07-30')
    expect(parseDateInput('2026年07月30日')).toBe('2026-07-30')
    // 末尾の「日」が無い書きかけも受ける
    expect(parseDateInput('2026年7月30')).toBe('2026-07-30')
  })

  it('前後の空白は落とす', () => {
    expect(parseDateInput('  2026-07-30  ')).toBe('2026-07-30')
  })

  it('実在しない日付は受けない', () => {
    expect(parseDateInput('2026-02-30')).toBeNull()
    expect(parseDateInput('2026-13-01')).toBeNull()
    expect(parseDateInput('2026-00-10')).toBeNull()
    expect(parseDateInput('2026-07-00')).toBeNull()
    expect(parseDateInput('20260231')).toBeNull()
  })

  it('うるう年は年ごとに判定する', () => {
    expect(parseDateInput('2024-02-29')).toBe('2024-02-29')
    expect(parseDateInput('2026-02-29')).toBeNull()
    // 100 で割り切れるが 400 で割り切れない年は平年
    expect(parseDateInput('2100-02-29')).toBeNull()
    expect(parseDateInput('2000-02-29')).toBe('2000-02-29')
  })

  it('年が無いものは受けない（今年だと決めつけない）', () => {
    expect(parseDateInput('7/30')).toBeNull()
    expect(parseDateInput('07-30')).toBeNull()
  })

  it('読めないものは null', () => {
    expect(parseDateInput('令和8年7月30日')).toBeNull()
    expect(parseDateInput('来週')).toBeNull()
    expect(parseDateInput('2026-07-30 10:00')).toBeNull()
    expect(parseDateInput('')).toBeNull()
    expect(parseDateInput('   ')).toBeNull()
    expect(parseDateInput(null)).toBeNull()
    expect(parseDateInput(undefined)).toBeNull()
  })
})
