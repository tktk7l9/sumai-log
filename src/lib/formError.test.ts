import { describe, expect, it } from 'vitest'

import { extractErrorMessage, extractFormError } from './formError'

function issueError(issues: unknown[]): Error {
  return new Error(JSON.stringify(issues))
}

describe('extractFormError', () => {
  it('gives the default message and no path for a value that is not an Error', () => {
    expect(extractFormError('boom')).toEqual({ message: '保存できませんでした', path: null })
    expect(extractFormError(undefined)).toEqual({ message: '保存できませんでした', path: null })
  })

  it('uses a plain Error that cannot be read as an issues array as is when it is Japanese', () => {
    expect(extractFormError(new Error('ネットワークに問題があります'))).toEqual({
      message: 'ネットワークに問題があります',
      path: null,
    })
  })

  it('uses the default message for a plain Error that cannot be read as an issues array when it is English', () => {
    expect(extractFormError(new Error('Network error'))).toEqual({
      message: '保存できませんでした',
      path: null,
    })
  })

  it('uses the default message for a plain Error that cannot be read as an issues array when message is empty', () => {
    expect(extractFormError(new Error())).toEqual({ message: '保存できませんでした', path: null })
  })

  it('uses the message of an issue the server explicitly threw in Japanese as is', () => {
    const error = issueError([
      { code: 'custom', path: ['url'], message: 'YouTube の URL を入れてください' },
    ])
    expect(extractFormError(error)).toEqual({
      message: 'YouTube の URL を入れてください',
      path: 'url',
    })
  })

  it('rephrases tags too_big (more than 10)', () => {
    const error = issueError([{ code: 'too_big', path: ['tags'], message: 'Too big' }])
    expect(extractFormError(error)).toEqual({
      message: 'タグは 1〜30 文字、最大 10 個です',
      path: 'tags',
    })
  })

  it('also rephrases tags too_big (1 tag over 30 characters, path is [tags, index]) by the leading field', () => {
    const error = issueError([{ code: 'too_big', path: ['tags', 0], message: 'Too big' }])
    expect(extractFormError(error)).toEqual({
      message: 'タグは 1〜30 文字、最大 10 個です',
      path: 'tags',
    })
  })

  it('rephrases too_big / too_small of names (the tag list on the settings screen) with the 100-item limit wording', () => {
    expect(
      extractFormError(issueError([{ code: 'too_big', path: ['names', 3], message: 'Too big' }])),
    ).toEqual({ message: 'タグは 1〜30 文字、最大 100 個です', path: 'names' })
    expect(
      extractFormError(
        issueError([{ code: 'too_small', path: ['names', 0], message: 'Too small' }]),
      ),
    ).toEqual({ message: 'タグは 1〜30 文字で入力してください', path: 'names' })
  })

  it('rephrases tags too_small with the same wording', () => {
    const error = issueError([{ code: 'too_small', path: ['tags'], message: 'Too small' }])
    expect(extractFormError(error).message).toBe('タグは 1〜30 文字、最大 10 個です')
  })

  it('has separate wording for title too_big / too_small', () => {
    expect(
      extractFormError(issueError([{ code: 'too_big', path: ['title'], message: 'Too big' }]))
        .message,
    ).toBe('題名は 300 文字までです')
    expect(
      extractFormError(issueError([{ code: 'too_small', path: ['title'], message: 'Too small' }]))
        .message,
    ).toBe('題名は必須です')
  })

  it('has separate wording for url too_big / too_small', () => {
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

  it('has the same wording for both invalid_type / invalid_value of watchedBy', () => {
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

  it('gives the default message for an unknown field (path is still returned)', () => {
    expect(
      extractFormError(issueError([{ code: 'too_big', path: ['unknown'], message: 'x' }])),
    ).toEqual({
      message: '保存できませんでした',
      path: 'unknown',
    })
  })

  it('gives the default message for an unknown code even on a known field', () => {
    expect(
      extractFormError(issueError([{ code: 'custom', path: ['title'], message: 'oops' }])),
    ).toEqual({ message: '保存できませんでした', path: 'title' })
  })

  it('gives a null path when path is an empty array, missing or starts with a number', () => {
    expect(
      extractFormError(issueError([{ code: 'too_big', path: [], message: 'x' }])).path,
    ).toBeNull()
    expect(extractFormError(issueError([{ code: 'too_big', message: 'x' }])).path).toBeNull()
    expect(
      extractFormError(issueError([{ code: 'too_big', path: [0], message: 'x' }])).path,
    ).toBeNull()
  })

  it('falls back to the default message even when the issue message is not a string', () => {
    expect(extractFormError(issueError([{ code: 'too_big', path: ['title'] }])).message).toBe(
      '題名は 300 文字までです',
    )
  })

  it('gives the default message even on a known field when there is no code', () => {
    expect(extractFormError(issueError([{ path: ['title'], message: 'x' }])).message).toBe(
      '保存できませんでした',
    )
  })

  it('treats an empty issues array as having no issue', () => {
    expect(extractFormError(issueError([]))).toEqual({
      message: '保存できませんでした',
      path: null,
    })
  })

  it('treats JSON that is not an array as unreadable as an issues array', () => {
    const error = new Error(JSON.stringify({ not: 'an array' }))
    expect(extractFormError(error)).toEqual({ message: '保存できませんでした', path: null })
  })
})

describe('extractErrorMessage', () => {
  it('returns only the message of extractFormError', () => {
    expect(
      extractErrorMessage(issueError([{ code: 'too_big', path: ['tags'], message: 'x' }])),
    ).toBe('タグは 1〜30 文字、最大 10 個です')
  })
})
