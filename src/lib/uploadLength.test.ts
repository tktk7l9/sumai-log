import { describe, expect, it } from 'vitest'

import { checkUploadLength } from './uploadLength'

describe('checkUploadLength', () => {
  it('requires a declared length when the header is missing', () => {
    expect(checkUploadLength(null, 100)).toBe('length-required')
  })

  it.each(['', '  ', 'abc', '-1', '1.5', '1e9'])(
    'treats a malformed value (%j) as undeclared',
    (value) => {
      expect(checkUploadLength(value, 100)).toBe('length-required')
    },
  )

  it('rejects a body over the limit', () => {
    expect(checkUploadLength('101', 100)).toBe('too-large')
  })

  it('accepts a body at the limit', () => {
    expect(checkUploadLength('100', 100)).toBeNull()
    expect(checkUploadLength(' 100 ', 100)).toBeNull()
    expect(checkUploadLength('0', 100)).toBeNull()
  })
})
