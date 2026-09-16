import { describe, expect, it } from 'vitest'

import { resolveSourceInput, sourceInput } from './sources.schema'

/**
 * saveSource/resolveSource は createServerFn でラップされているため、TanStack Start の
 * サーバーランタイム（AsyncLocalStorage の Start context）が無い素の vitest workers
 * テストから直接呼ぶと「No Start context found」で落ちる（validator に届く前の話）。
 * 実質的な検証は validator である sourceInput/resolveSourceInput 自体を見れば足りるので、
 * ここでは safeParse を直接確認する（src/server/videos.worker-test.ts と同じパターン）。
 *
 * `./sources` からではなく `./sources.schema` から import しているのは、sources.ts が
 * （saveSource の中で使う）currentActorEmail 経由で `@tanstack/react-start/server` の
 * getRequest を静的 import しており、それが TanStack Start の Vite プラグイン無しの
 * この素の vitest workers テストからは解決できない virtual specifier を踏んで落ちるため
 * （詳細は sources.schema.ts のコメント）。
 */
const base = {
  url: 'https://www.youtube.com/@example-house',
  name: 'テストチャンネル',
  genre: 'knowledge' as const,
  description: null,
  handle: '@example-house',
  channelId: null,
  avatarUrl: null,
  vendorId: null,
  affiliation: null,
  sortOrder: 0,
}

describe('sourceInput', () => {
  it('YouTube チャンネルの URL なら kind が youtube になる', () => {
    const result = sourceInput.safeParse(base)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.kind).toBe('youtube')
  })

  it('YouTube チャンネルの形でない URL なら kind が site になる', () => {
    const result = sourceInput.safeParse({ ...base, url: 'https://example.com/blog' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.kind).toBe('site')
  })

  it('URL が http(s) で始まらなければ拒否する', () => {
    const result = sourceInput.safeParse({ ...base, url: 'ftp://example.com' })
    expect(result.success).toBe(false)
  })

  it('URL が空なら拒否する', () => {
    const result = sourceInput.safeParse({ ...base, url: '' })
    expect(result.success).toBe(false)
  })

  it('名前が空なら拒否する', () => {
    const result = sourceInput.safeParse({ ...base, name: '' })
    expect(result.success).toBe(false)
  })

  it('未知のジャンルは拒否する', () => {
    const result = sourceInput.safeParse({ ...base, genre: 'unknown' })
    expect(result.success).toBe(false)
  })

  it('未知の affiliation は拒否する', () => {
    const result = sourceInput.safeParse({ ...base, affiliation: 'unknown' })
    expect(result.success).toBe(false)
  })

  it('affiliation は null を許可する', () => {
    const result = sourceInput.safeParse({ ...base, affiliation: null })
    expect(result.success).toBe(true)
  })

  it('既知の affiliation（構造塾マップ含む）を許可する', () => {
    for (const affiliation of ['iedukuri100', 'miratsugu', 'kouzou-cram']) {
      expect(sourceInput.safeParse({ ...base, affiliation }).success).toBe(true)
    }
  })

  it('description が 200 字を超えたら拒否する', () => {
    const result = sourceInput.safeParse({ ...base, description: 'あ'.repeat(201) })
    expect(result.success).toBe(false)
  })

  it('description は空文字を null に正規化する', () => {
    const result = sourceInput.safeParse({ ...base, description: '' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.description).toBeNull()
  })

  it('avatarUrl が許可ホスト外なら null に落とす（保存を拒否せず黙って捨てる）', () => {
    const result = sourceInput.safeParse({ ...base, avatarUrl: 'https://evil.example/a.jpg' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.avatarUrl).toBeNull()
  })

  it('avatarUrl が許可ホストなら残る', () => {
    const url = 'https://yt3.googleusercontent.com/fake=s900'
    const result = sourceInput.safeParse({ ...base, avatarUrl: url })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.avatarUrl).toBe(url)
  })

  it('id を指定できる（更新用）', () => {
    const id = '11111111-1111-1111-1111-111111111111'
    const result = sourceInput.safeParse({ ...base, id })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.id).toBe(id)
  })

  it('vendorId の形が不正なら拒否する', () => {
    const result = sourceInput.safeParse({ ...base, vendorId: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('sortOrder が整数でなければ拒否する', () => {
    const result = sourceInput.safeParse({ ...base, sortOrder: 1.5 })
    expect(result.success).toBe(false)
  })
})

describe('resolveSourceInput', () => {
  it('URL を受け付ける', () => {
    const result = resolveSourceInput.safeParse({ url: 'https://www.youtube.com/@example-house' })
    expect(result.success).toBe(true)
  })

  it('URL が空なら拒否する', () => {
    const result = resolveSourceInput.safeParse({ url: '' })
    expect(result.success).toBe(false)
  })
})
