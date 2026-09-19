import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import { reset } from './test-helpers'

beforeEach(reset)

describe('inbound_mails', () => {
  it('テーブルと列がある', async () => {
    const { results } = await env.DB.prepare('PRAGMA table_info(inbound_mails)').all()
    const names = results.map((r) => (r as { name: string }).name)
    expect(names).toEqual(
      expect.arrayContaining(['message_id', 'status', 'body_text', 'vendor_id', 'news_id']),
    )
    const vn = await env.DB.prepare('PRAGMA table_info(vendor_news)').all()
    expect(vn.results.map((r) => (r as { name: string }).name)).toContain('mail_id')
  })
})
