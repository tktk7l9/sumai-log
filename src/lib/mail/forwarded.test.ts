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
  it('extracts sender, date, subject and body from an English UI block', () => {
    const b = splitForwardedBlock(EN)
    expect(b).toEqual({
      from: 'news@example.com',
      date: '2026-09-16',
      subject: '完成見学会のご案内',
      body: '9月27日(土)・28日(日) 完成見学会を開催します。\n場所は後日ご案内します。',
    })
  })
  it('does the same with the Japanese UI header words', () => {
    const b = splitForwardedBlock(JA)
    expect(b?.from).toBe('news@example.com')
    expect(b?.date).toBe('2026-09-16')
    expect(b?.subject).toBe('完成見学会のご案内')
    expect(b?.body).toBe('本文です。')
  })
  it('returns null when there is no block', () => {
    expect(splitForwardedBlock('ただの本文')).toBeNull()
    expect(splitForwardedBlock('')).toBeNull()
  })
  it('does not crash when header lines are missing (missing fields are null)', () => {
    const b = splitForwardedBlock('---------- Forwarded message ---------\nSubject: x\n\nbody')
    expect(b).toEqual({ from: null, date: null, subject: 'x', body: 'body' })
  })
  it('gets the body even without a blank line (from where the header lines end)', () => {
    const b = splitForwardedBlock(
      '---------- Forwarded message ---------\nFrom: a@b.com\nbody line',
    )
    expect(b?.from).toBe('a@b.com')
    expect(b?.body).toBe('body line')
  })
  it('returns null when the From / Subject value is empty (the value itself is an empty string)', () => {
    const b = splitForwardedBlock('---------- Forwarded message ---------\nFrom:\nSubject:\n\nbody')
    expect(b?.from).toBeNull()
    expect(b?.subject).toBeNull()
  })
})

describe('parseForwardedDate', () => {
  it('Japanese notation without the Japanese era', () => {
    expect(parseForwardedDate('2026年9月16日(火) 10:05')).toBe('2026-09-16')
  })
  it('English notation (with "at")', () => {
    expect(parseForwardedDate('Tue, Sep 16, 2026 at 10:05 AM')).toBe('2026-09-16')
  })
  it('returns null when unreadable', () => {
    expect(parseForwardedDate('someday')).toBeNull()
    expect(parseForwardedDate('')).toBeNull()
  })
})
