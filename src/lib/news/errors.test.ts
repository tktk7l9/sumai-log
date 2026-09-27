import { describe, expect, it } from 'vitest'

import { describeFetchError } from './errors'

describe('describeFetchError', () => {
  it('null returns an empty-string label (does not throw)', () => {
    expect(describeFetchError(null)).toEqual({ label: '' })
  })

  it('rewords HTTP 403 into the blocked-by-site (Cloudflare refused) wording', () => {
    expect(describeFetchError('HTTP 403')).toEqual({
      label: 'サイト側が Cloudflare からのアクセスを拒否（HTTP 403）',
      hint: 'このサイトはお知らせを自動取得できません。メール取り込み（予定）か URL を空にしてください',
    })
  })

  it('treats HTTP 401 / HTTP 451 as Cloudflare being refused in the same way', () => {
    expect(describeFetchError('HTTP 401').label).toBe(
      'サイト側が Cloudflare からのアクセスを拒否（HTTP 401）',
    )
    expect(describeFetchError('HTTP 451').label).toBe(
      'サイト側が Cloudflare からのアクセスを拒否（HTTP 451）',
    )
  })

  it('uses HTTP statuses other than 403/401/451 as the label as is (no hint)', () => {
    expect(describeFetchError('HTTP 500')).toEqual({ label: 'HTTP 500' })
    expect(describeFetchError('HTTP 404')).toEqual({ label: 'HTTP 404' })
  })

  it('uses an error that is not in the HTTP status form as the label as is', () => {
    expect(describeFetchError('応答が上限（1MB）を超えました')).toEqual({
      label: '応答が上限（1MB）を超えました',
    })
    expect(describeFetchError('リダイレクト先が許可されていません')).toEqual({
      label: 'リダイレクト先が許可されていません',
    })
  })

  it('does not treat it as an HTTP status unless "HTTP " is followed by a 3-digit number', () => {
    expect(describeFetchError('HTTP abc')).toEqual({ label: 'HTTP abc' })
    expect(describeFetchError('HTTP 40')).toEqual({ label: 'HTTP 40' })
  })
})
