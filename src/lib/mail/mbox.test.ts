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
  it('splits on "From " lines and restores the ">From " escape', () => {
    const msgs = splitMbox(MBOX)
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toContain('Subject: one')
    expect(msgs[0]).toContain('\nFrom the middle of body')
    expect(msgs[0]).not.toContain('>From ')
    expect(msgs[1].startsWith('Subject: two')).toBe(true)
  })
  it('returns an empty array when empty or without separators', () => {
    expect(splitMbox('')).toEqual([])
    expect(splitMbox('no separator')).toEqual([])
  })
  it('splits with CRLF too', () => {
    expect(splitMbox('From x Wed\r\nSubject: a\r\n\r\nb\r\n')).toEqual(['Subject: a\r\n\r\nb'])
  })
  it('excludes a message with only blank lines right after the separator (no body)', () => {
    const withEmptyMessage = `From a@example.com Wed Sep 16 10:05:00 2026

From b@example.com Thu Sep 17 10:05:00 2026
Subject: two

body two
`
    expect(splitMbox(withEmptyMessage)).toEqual(['Subject: two\n\nbody two'])
  })
})
