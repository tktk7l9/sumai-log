import { describe, expect, it } from 'vitest'

import { GMAIL_FORWARDING_NOTICE, classifyRoute, normalizeEnvelopeAddress } from './route'

const allow = ['owner@example.com', 'partner@example.com']

describe('classifyRoute', () => {
  it('Gmail auto-forward: envelope is owner+caf_=... with a vendor From -> auto (forwardedBy is normalized)', () => {
    expect(
      classifyRoute(
        { from: 'news@vendor.example', forwardedFor: [] },
        allow,
        'owner+caf_=news=sumai.example@example.com',
      ),
    ).toEqual({ kind: 'auto', forwardedBy: 'owner@example.com' })
  })

  it('manual forward: both the envelope and From are the member address -> manual', () => {
    expect(
      classifyRoute(
        { from: 'partner@example.com', forwardedFor: [] },
        allow,
        'partner@example.com',
      ),
    ).toEqual({ kind: 'manual', forwardedBy: 'partner@example.com' })
  })

  it('rejected when the envelope is invalid, even with a spoofed X-Forwarded-For and an allowed From', () => {
    expect(
      classifyRoute(
        { from: 'owner@example.com', forwardedFor: ['owner@example.com'] },
        allow,
        'attacker@evil.example',
      ),
    ).toEqual({ kind: 'rejected', reason: 'envelope sender not allowed' })
  })

  it('Gmail forwarding address confirmation: system when the envelope is google.com', () => {
    expect(
      classifyRoute(
        { from: GMAIL_FORWARDING_NOTICE, forwardedFor: [] },
        allow,
        'forwarding-noreply@google.com',
      ),
    ).toEqual({ kind: 'system' })
  })

  it('rejected when the envelope is not google.com, even if From poses as the forwarding confirmation mail', () => {
    expect(
      classifyRoute(
        { from: GMAIL_FORWARDING_NOTICE, forwardedFor: [] },
        allow,
        'attacker@evil.example',
      ),
    ).toEqual({ kind: 'rejected', reason: 'envelope sender not trusted' })
  })

  it('treats subdomains of google.com (e.g. bounces.google.com) as system too', () => {
    expect(
      classifyRoute(
        { from: GMAIL_FORWARDING_NOTICE, forwardedFor: [] },
        allow,
        'forwarding-noreply@bounces.google.com',
      ),
    ).toEqual({ kind: 'system' })
  })

  it('does not treat an envelope with `@` in the domain part as system (x@evil.example@google.com)', () => {
    // Splitting at the first `@` gives the domain `evil.example@google.com`. An implementation
    // that splits at the last `@` would see `google.com`, and the attacker's body would be stored
    // as a system row (shown expanded as a confirmation code). Do not trust a shape that cannot
    // be decided either way.
    expect(
      classifyRoute(
        { from: GMAIL_FORWARDING_NOTICE, forwardedFor: [] },
        allow,
        'x@evil.example@google.com',
      ),
    ).toEqual({ kind: 'rejected', reason: 'envelope sender not trusted' })
  })

  it('an envelope without `@` is rejected (not allowed)', () => {
    expect(
      classifyRoute({ from: 'news@vendor.example', forwardedFor: [] }, allow, 'no-at'),
    ).toEqual({ kind: 'rejected', reason: 'envelope sender not allowed' })
  })

  it('rejected (not allowed) whatever From is when the envelope is not in the allowlist', () => {
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
  it('lowercases', () => {
    expect(normalizeEnvelopeAddress('Owner@Example.COM')).toBe('owner@example.com')
  })

  it('trims leading and trailing whitespace', () => {
    expect(normalizeEnvelopeAddress('  owner@example.com  ')).toBe('owner@example.com')
  })

  it('strips surrounding <>', () => {
    expect(normalizeEnvelopeAddress('<owner@example.com>')).toBe('owner@example.com')
  })

  it('removes the +tag of the local part (the caf_ form of Gmail auto-forward)', () => {
    expect(normalizeEnvelopeAddress('owner+caf_=news=sumai-log.app@gmail.com')).toBe(
      'owner@gmail.com',
    )
  })

  it('empty input gives an empty string', () => {
    expect(normalizeEnvelopeAddress('')).toBe('')
    expect(normalizeEnvelopeAddress('   ')).toBe('')
  })

  it('an invalid value without @ is only lowercased and returned (defensive fallback)', () => {
    expect(normalizeEnvelopeAddress('Not-An-Email')).toBe('not-an-email')
  })
})
