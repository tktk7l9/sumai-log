import { describe, expect, it } from 'vitest'

import { parseForwardedDate, splitForwardedBlock } from './forwarded'

const EN = `FYI

---------- Forwarded message ---------
From: Test Builder <news@example.com>
Date: Tue, Sep 16, 2026 at 10:05 AM
Subject: 完成見学会のご案内
To: <owner@example.com>


9月27日(土)・28日(日) 完成見学会を開催します。
場所は後日ご案内します。`

const JA = `---------- 転送メッセージ ---------
差出人: Test Builder <news@example.com>
日付: 2026年9月16日(火) 10:05
件名: 完成見学会のご案内
To: owner@example.com

本文です。`

describe('splitForwardedBlock', () => {
  it('英語 UI のブロックから差出人・日付・件名・本文を取り出す', () => {
    const b = splitForwardedBlock(EN)
    expect(b).toEqual({
      from: 'news@example.com',
      date: '2026-09-16',
      subject: '完成見学会のご案内',
      body: '9月27日(土)・28日(日) 完成見学会を開催します。\n場所は後日ご案内します。',
    })
  })
  it('日本語 UI の見出し語でも同じ', () => {
    const b = splitForwardedBlock(JA)
    expect(b?.from).toBe('news@example.com')
    expect(b?.date).toBe('2026-09-16')
    expect(b?.subject).toBe('完成見学会のご案内')
    expect(b?.body).toBe('本文です。')
  })
  it('ブロックが無ければ null', () => {
    expect(splitForwardedBlock('ただの本文')).toBeNull()
    expect(splitForwardedBlock('')).toBeNull()
  })
  it('ヘッダ行が欠けていても落ちない（無い項目は null）', () => {
    const b = splitForwardedBlock('---------- Forwarded message ---------\nSubject: x\n\nbody')
    expect(b).toEqual({ from: null, date: null, subject: 'x', body: 'body' })
  })
  it('空行が無くても本文が取れる（ヘッダ行が終わったところから）', () => {
    const b = splitForwardedBlock(
      '---------- Forwarded message ---------\nFrom: a@b.com\nbody line',
    )
    expect(b?.from).toBe('a@b.com')
    expect(b?.body).toBe('body line')
  })
})

describe('parseForwardedDate', () => {
  it('和暦なしの日本語表記', () => {
    expect(parseForwardedDate('2026年9月16日(火) 10:05')).toBe('2026-09-16')
  })
  it('英語表記（"at" 付き）', () => {
    expect(parseForwardedDate('Tue, Sep 16, 2026 at 10:05 AM')).toBe('2026-09-16')
  })
  it('読めなければ null', () => {
    expect(parseForwardedDate('someday')).toBeNull()
    expect(parseForwardedDate('')).toBeNull()
  })
})
