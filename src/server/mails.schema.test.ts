import { describe, expect, it } from 'vitest'

import { assignMailInput, mailIdInput } from './mails.schema'

const uuid = '11111111-1111-4111-8111-111111111111'

describe('mails.schema', () => {
  it('assignMailInput は mailId と vendorId の UUID', () => {
    expect(assignMailInput.parse({ mailId: uuid, vendorId: uuid })).toEqual({
      mailId: uuid,
      vendorId: uuid,
    })
    expect(() => assignMailInput.parse({ mailId: 'x', vendorId: uuid })).toThrow()
  })
  it('mailIdInput は id の UUID', () => {
    expect(mailIdInput.parse({ id: uuid })).toEqual({ id: uuid })
  })
})
