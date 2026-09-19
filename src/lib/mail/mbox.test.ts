import { describe, expect, it } from 'vitest'

import { splitMbox } from './mbox'

const MBOX = `From a@example.com Wed Sep 16 10:05:00 2026
Subject: one
Content-Type: text/plain

body one
>From the middle of body

From b@example.com Thu Sep 17 10:05:00 2026
Subject: two

body two
`

describe('splitMbox', () => {
  it('"From " 行で分け、">From " のエスケープを戻す', () => {
    const msgs = splitMbox(MBOX)
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toContain('Subject: one')
    expect(msgs[0]).toContain('\nFrom the middle of body')
    expect(msgs[0]).not.toContain('>From ')
    expect(msgs[1].startsWith('Subject: two')).toBe(true)
  })
  it('空・区切りが無いなら空配列', () => {
    expect(splitMbox('')).toEqual([])
    expect(splitMbox('no separator')).toEqual([])
  })
  it('CRLF でも分けられる', () => {
    expect(splitMbox('From x Wed\r\nSubject: a\r\n\r\nb\r\n')).toEqual(['Subject: a\r\n\r\nb'])
  })
  it('区切り直後が空行だけ（本文が無い）のメッセージは含めない', () => {
    const withEmptyMessage = `From a@example.com Wed Sep 16 10:05:00 2026

From b@example.com Thu Sep 17 10:05:00 2026
Subject: two

body two
`
    expect(splitMbox(withEmptyMessage)).toEqual(['Subject: two\n\nbody two'])
  })
})
