import { describe, expect, it } from 'vitest'

import { isInboxRecipient } from './recipient'

describe('isInboxRecipient', () => {
  it('accepts the forwarding address, ignoring case and surrounding spaces', () => {
    expect(isInboxRecipient('News-Abc@Sumai.Example', ' news-abc@sumai.example ')).toBe(true)
  })
  it('rejects any other recipient once the address is set', () => {
    expect(isInboxRecipient('news@sumai.example', 'news-abc@sumai.example')).toBe(false)
    expect(isInboxRecipient('', 'news-abc@sumai.example')).toBe(false)
  })
  it('accepts every recipient while the secret is not set (nothing to compare with)', () => {
    expect(isInboxRecipient('anything@sumai.example', undefined)).toBe(true)
    expect(isInboxRecipient('anything@sumai.example', null)).toBe(true)
    expect(isInboxRecipient('anything@sumai.example', '  ')).toBe(true)
  })
})
