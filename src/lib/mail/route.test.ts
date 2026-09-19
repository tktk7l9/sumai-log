import { describe, expect, it } from 'vitest'

import { GMAIL_FORWARDING_NOTICE, classifyRoute, normalizeEnvelopeAddress } from './route'

const allow = ['owner@example.com', 'partner@example.com']

describe('classifyRoute', () => {
  it('Gmail 自動転送: エンベロープが owner+caf_=... で業者の From → auto（forwardedBy は正規化後）', () => {
    expect(
      classifyRoute(
        { from: 'news@vendor.example', forwardedFor: [] },
        allow,
        'owner+caf_=news=sumai.example@example.com',
      ),
    ).toEqual({ kind: 'auto', forwardedBy: 'owner@example.com' })
  })

  it('手動転送: エンベロープも From も本人のアドレス → manual', () => {
    expect(
      classifyRoute(
        { from: 'partner@example.com', forwardedFor: [] },
        allow,
        'partner@example.com',
      ),
    ).toEqual({ kind: 'manual', forwardedBy: 'partner@example.com' })
  })

  it('X-Forwarded-For を偽装し From も許可アドレスでも、エンベロープが不正なら rejected', () => {
    expect(
      classifyRoute(
        { from: 'owner@example.com', forwardedFor: ['owner@example.com'] },
        allow,
        'attacker@evil.example',
      ),
    ).toEqual({ kind: 'rejected', reason: 'envelope sender not allowed' })
  })

  it('Gmail の転送先確認: エンベロープが google.com なら system', () => {
    expect(
      classifyRoute(
        { from: GMAIL_FORWARDING_NOTICE, forwardedFor: [] },
        allow,
        'forwarding-noreply@google.com',
      ),
    ).toEqual({ kind: 'system' })
  })

  it('From は転送先確認メールを装っていても、エンベロープが google.com 以外なら rejected', () => {
    expect(
      classifyRoute(
        { from: GMAIL_FORWARDING_NOTICE, forwardedFor: [] },
        allow,
        'attacker@evil.example',
      ),
    ).toEqual({ kind: 'rejected', reason: 'envelope sender not trusted' })
  })

  it('google.com のサブドメイン（例: bounces.google.com）も system として扱う', () => {
    expect(
      classifyRoute(
        { from: GMAIL_FORWARDING_NOTICE, forwardedFor: [] },
        allow,
        'forwarding-noreply@bounces.google.com',
      ),
    ).toEqual({ kind: 'system' })
  })

  it('エンベロープが許可リストに無ければ From が何であっても rejected（not allowed）', () => {
    expect(
      classifyRoute(
        { from: 'news@vendor.example', forwardedFor: [] },
        allow,
        'stranger@example.org',
      ),
    ).toEqual({ kind: 'rejected', reason: 'envelope sender not allowed' })
  })
})

describe('normalizeEnvelopeAddress', () => {
  it('小文字化する', () => {
    expect(normalizeEnvelopeAddress('Owner@Example.COM')).toBe('owner@example.com')
  })

  it('前後の空白を除去する', () => {
    expect(normalizeEnvelopeAddress('  owner@example.com  ')).toBe('owner@example.com')
  })

  it('<> で囲まれていれば外す', () => {
    expect(normalizeEnvelopeAddress('<owner@example.com>')).toBe('owner@example.com')
  })

  it('ローカル部の +タグ を除去する（Gmail 自動転送の caf_ 形式）', () => {
    expect(normalizeEnvelopeAddress('owner+caf_=news=sumai-log.app@gmail.com')).toBe(
      'owner@gmail.com',
    )
  })

  it('空入力は空文字', () => {
    expect(normalizeEnvelopeAddress('')).toBe('')
    expect(normalizeEnvelopeAddress('   ')).toBe('')
  })

  it('@ を含まない不正な値は小文字化だけして返す（防御的フォールバック）', () => {
    expect(normalizeEnvelopeAddress('Not-An-Email')).toBe('not-an-email')
  })
})
