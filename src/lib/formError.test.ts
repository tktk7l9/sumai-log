import { describe, expect, it } from 'vitest'

import { extractErrorMessage, extractFormError } from './formError'

function issueError(issues: unknown[]): Error {
  return new Error(JSON.stringify(issues))
}

describe('extractFormError', () => {
  it('Error でない値は既定のメッセージ・path なし', () => {
    expect(extractFormError('boom')).toEqual({ message: '保存できませんでした', path: null })
    expect(extractFormError(undefined)).toEqual({ message: '保存できませんでした', path: null })
  })

  it('issues 配列として読めないプレーンな Error は、日本語ならそのまま使う', () => {
    expect(extractFormError(new Error('ネットワークに問題があります'))).toEqual({
      message: 'ネットワークに問題があります',
      path: null,
    })
  })

  it('issues 配列として読めないプレーンな Error で、英語なら既定のメッセージにする', () => {
    expect(extractFormError(new Error('Network error'))).toEqual({
      message: '保存できませんでした',
      path: null,
    })
  })

  it('issues 配列として読めないプレーンな Error で、message が空なら既定のメッセージにする', () => {
    expect(extractFormError(new Error())).toEqual({ message: '保存できませんでした', path: null })
  })

  it('サーバーが明示的に日本語で投げた issue のメッセージはそのまま使う', () => {
    const error = issueError([
      { code: 'custom', path: ['url'], message: 'YouTube の URL を入れてください' },
    ])
    expect(extractFormError(error)).toEqual({
      message: 'YouTube の URL を入れてください',
      path: 'url',
    })
  })

  it('tags too_big（10 個超）は言い換える', () => {
    const error = issueError([{ code: 'too_big', path: ['tags'], message: 'Too big' }])
    expect(extractFormError(error)).toEqual({
      message: 'タグは 1〜30 文字、最大 10 個です',
      path: 'tags',
    })
  })

  it('tags too_big（1 個の 30 文字超、path は [tags, index]）も先頭フィールドで言い換える', () => {
    const error = issueError([{ code: 'too_big', path: ['tags', 0], message: 'Too big' }])
    expect(extractFormError(error)).toEqual({
      message: 'タグは 1〜30 文字、最大 10 個です',
      path: 'tags',
    })
  })

  it('tags too_small も同じ文言に言い換える', () => {
    const error = issueError([{ code: 'too_small', path: ['tags'], message: 'Too small' }])
    expect(extractFormError(error).message).toBe('タグは 1〜30 文字、最大 10 個です')
  })

  it('title too_big / too_small はそれぞれ別の文言', () => {
    expect(
      extractFormError(issueError([{ code: 'too_big', path: ['title'], message: 'Too big' }]))
        .message,
    ).toBe('題名は 300 文字までです')
    expect(
      extractFormError(issueError([{ code: 'too_small', path: ['title'], message: 'Too small' }]))
        .message,
    ).toBe('題名は必須です')
  })

  it('url too_big / too_small はそれぞれ別の文言', () => {
    expect(
      extractFormError(issueError([{ code: 'too_big', path: ['url'], message: 'Too big' }]))
        .message,
    ).toBe('URL は 500 文字までです')
    expect(
      extractFormError(issueError([{ code: 'too_small', path: ['url'], message: 'Too small' }]))
        .message,
    ).toBe('URL は必須です')
  })

  it('channel too_big / takeaways too_big / areas too_big / note too_big', () => {
    expect(
      extractFormError(issueError([{ code: 'too_big', path: ['channel'], message: 'Too big' }]))
        .message,
    ).toBe('チャンネル名は 200 文字までです')
    expect(
      extractFormError(issueError([{ code: 'too_big', path: ['takeaways'], message: 'Too big' }]))
        .message,
    ).toBe('学びは 4000 文字までです')
    expect(
      extractFormError(issueError([{ code: 'too_big', path: ['areas'], message: 'Too big' }]))
        .message,
    ).toBe('市区町村の入力が長すぎます')
    expect(
      extractFormError(issueError([{ code: 'too_big', path: ['note'], message: 'Too big' }]))
        .message,
    ).toBe('メモが長すぎます')
  })

  it('watchedBy の invalid_type / invalid_value はどちらも同じ文言', () => {
    expect(
      extractFormError(
        issueError([{ code: 'invalid_type', path: ['watchedBy'], message: 'Invalid' }]),
      ).message,
    ).toBe('観た人の指定が不正です')
    expect(
      extractFormError(
        issueError([{ code: 'invalid_value', path: ['watchedBy'], message: 'Invalid' }]),
      ).message,
    ).toBe('観た人の指定が不正です')
  })

  it('未知のフィールドは既定のメッセージ（path は返す）', () => {
    expect(
      extractFormError(issueError([{ code: 'too_big', path: ['unknown'], message: 'x' }])),
    ).toEqual({
      message: '保存できませんでした',
      path: 'unknown',
    })
  })

  it('既知のフィールドでも未知の code は既定のメッセージ', () => {
    expect(
      extractFormError(issueError([{ code: 'custom', path: ['title'], message: 'oops' }])),
    ).toEqual({ message: '保存できませんでした', path: 'title' })
  })

  it('path が空配列・無い・数値始まりなら path は null', () => {
    expect(
      extractFormError(issueError([{ code: 'too_big', path: [], message: 'x' }])).path,
    ).toBeNull()
    expect(extractFormError(issueError([{ code: 'too_big', message: 'x' }])).path).toBeNull()
    expect(
      extractFormError(issueError([{ code: 'too_big', path: [0], message: 'x' }])).path,
    ).toBeNull()
  })

  it('issue の message が文字列でなくても既定のメッセージにフォールバックする', () => {
    expect(extractFormError(issueError([{ code: 'too_big', path: ['title'] }])).message).toBe(
      '題名は 300 文字までです',
    )
  })

  it('code が無ければ既知のフィールドでも既定のメッセージ', () => {
    expect(extractFormError(issueError([{ path: ['title'], message: 'x' }])).message).toBe(
      '保存できませんでした',
    )
  })

  it('issues が空配列なら issue 無しとして扱う', () => {
    expect(extractFormError(issueError([]))).toEqual({
      message: '保存できませんでした',
      path: null,
    })
  })

  it('JSON だが配列でなければ issues 配列としては読めない扱いになる', () => {
    const error = new Error(JSON.stringify({ not: 'an array' }))
    expect(extractFormError(error)).toEqual({ message: '保存できませんでした', path: null })
  })
})

describe('extractErrorMessage', () => {
  it('extractFormError の message だけを返す', () => {
    expect(
      extractErrorMessage(issueError([{ code: 'too_big', path: ['tags'], message: 'x' }])),
    ).toBe('タグは 1〜30 文字、最大 10 個です')
  })
})
