import { describe, expect, it } from 'vitest'

import { inboundToNews, isMailNews, mailUrl } from './toNews'

describe('mailUrl / isMailNews', () => {
  it('tells them apart by the mail: prefix', () => {
    expect(mailUrl('<a@b>')).toBe('mail:<a@b>')
    expect(isMailNews('mail:<a@b>')).toBe(true)
    expect(isMailNews('https://example.com/')).toBe(false)
  })
})

describe('inboundToNews', () => {
  it('subject is the title, first 300 chars of the body are the summary, event dates come from subject + body', () => {
    const n = inboundToNews(
      {
        messageId: '<m1@example.com>',
        subject: '完成見学会のご案内',
        text: '9月27日(土)・28日(日)に開催します。' + 'あ'.repeat(400),
        sentOn: '2026-09-16',
      },
      'vendor-1',
      '2026-09-17',
    )
    expect(n.vendorId).toBe('vendor-1')
    expect(n.url).toBe('mail:<m1@example.com>')
    expect(n.title).toBe('完成見学会のご案内')
    expect(n.summary?.length).toBe(300)
    expect(n.publishedOn).toBe('2026-09-16')
    expect(n.eventKind).toBe('完成見学会')
    expect(n.eventStart).toBe('2026-09-27')
    expect(n.eventEnd).toBe('2026-09-28')
  })
  it('no date -> received date. Empty subject -> "（件名なし）" (No subject). Empty body -> summary null. No event dates -> null', () => {
    const n = inboundToNews(
      { messageId: 'hash:x', subject: '', text: '', sentOn: null },
      'v',
      '2026-09-17',
    )
    expect(n.publishedOn).toBe('2026-09-17')
    expect(n.title).toBe('（件名なし）')
    expect(n.summary).toBeNull()
    expect(n.eventStart).toBeNull()
    expect(n.eventEnd).toBeNull()
    expect(n.eventKind).toBeNull()
  })
})
