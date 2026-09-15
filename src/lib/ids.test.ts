import { describe, expect, it } from 'vitest'

import { isIdLike } from './ids'

describe('isIdLike', () => {
  it('crypto.randomUUID() の出力（v4）を受け付ける', () => {
    expect(isIdLike(crypto.randomUUID())).toBe(true)
  })

  it('v4 でない（バージョン/バリアントニブルを満たさない）小文字の UUID 形も受け付ける', () => {
    expect(isIdLike('00000000-0000-0000-0000-000000000000')).toBe(true)
  })

  it('大文字は拒否する', () => {
    expect(isIdLike('7D885050-CC49-E8BA-A2A6-79C4F1CC4C92')).toBe(false)
  })

  it('長さが違う・ハイフンが無いものは拒否する', () => {
    expect(isIdLike('7d885050-cc49-e8ba-a2a6-79c4f1cc4c9')).toBe(false)
    expect(isIdLike('7d885050cc49e8baa2a679c4f1cc4c92')).toBe(false)
  })

  it('空文字は拒否する', () => {
    expect(isIdLike('')).toBe(false)
  })
})
