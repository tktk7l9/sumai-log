import { describe, expect, it } from 'vitest'

import { describeFetchError } from './errors'

describe('describeFetchError', () => {
  it('null は空文字の label を返す（例外にしない）', () => {
    expect(describeFetchError(null)).toEqual({ label: '' })
  })

  it('HTTP 403 は Cloudflare 拒否の文言に言い換える', () => {
    expect(describeFetchError('HTTP 403')).toEqual({
      label: 'サイト側が Cloudflare からのアクセスを拒否（HTTP 403）',
      hint: 'このサイトはお知らせを自動取得できません。メール取り込み（予定）か URL を空にしてください',
    })
  })

  it('HTTP 401 / HTTP 451 も同じく Cloudflare 拒否として扱う', () => {
    expect(describeFetchError('HTTP 401').label).toBe(
      'サイト側が Cloudflare からのアクセスを拒否（HTTP 401）',
    )
    expect(describeFetchError('HTTP 451').label).toBe(
      'サイト側が Cloudflare からのアクセスを拒否（HTTP 451）',
    )
  })

  it('403/401/451 以外の HTTP ステータスはそのまま label にする（hint は付けない）', () => {
    expect(describeFetchError('HTTP 500')).toEqual({ label: 'HTTP 500' })
    expect(describeFetchError('HTTP 404')).toEqual({ label: 'HTTP 404' })
  })

  it('HTTP ステータス形式ではないエラーはそのまま label にする', () => {
    expect(describeFetchError('応答が上限（1MB）を超えました')).toEqual({
      label: '応答が上限（1MB）を超えました',
    })
    expect(describeFetchError('リダイレクト先が許可されていません')).toEqual({
      label: 'リダイレクト先が許可されていません',
    })
  })

  it('"HTTP " の後が 3 桁の数字でなければ HTTP ステータスとして扱わない', () => {
    expect(describeFetchError('HTTP abc')).toEqual({ label: 'HTTP abc' })
    expect(describeFetchError('HTTP 40')).toEqual({ label: 'HTTP 40' })
  })
})
