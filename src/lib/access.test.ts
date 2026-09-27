import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  ACCESS_JWT_HEADER,
  authenticateAccessJwt,
  describeFailure,
  devIdentityAllowed,
  extractAccessToken,
  isEmailAllowed,
  normalizeEmail,
  parseAllowlist,
  resolveDevIdentity,
} from './access'

const ISSUER = 'https://example.cloudflareaccess.com'
const AUDIENCE = 'aud-tag-1234567890'
const ALLOWLIST = ['owner@example.com']

let signingKey: CryptoKey
let keySet: JWTVerifyGetKey
/** A key not included in the legitimate key set. Used to build the invalid-signature case. */
let foreignKey: CryptoKey

beforeAll(async () => {
  const real = await generateKeyPair('RS256', { extractable: true })
  const foreign = await generateKeyPair('RS256', { extractable: true })

  signingKey = real.privateKey
  foreignKey = foreign.privateKey

  const jwk = await exportJWK(real.publicKey)
  keySet = createLocalJWKSet({ keys: [{ ...jwk, kid: 'real', alg: 'RS256' }] })
})

type TokenOptions = {
  email?: unknown
  issuer?: string
  audience?: string
  key?: CryptoKey
  expiresIn?: string
}

async function mintToken(options: TokenOptions = {}): Promise<string> {
  const payload: Record<string, unknown> = {}
  if (options.email !== undefined) payload.email = options.email

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'real' })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '1h')
    .sign(options.key ?? signingKey)
}

describe('normalizeEmail', () => {
  it('trims surrounding whitespace and lowercases', () => {
    expect(normalizeEmail('  Owner@Example.COM ')).toBe('owner@example.com')
  })
})

describe('parseAllowlist', () => {
  it('returns an empty array when not set', () => {
    expect(parseAllowlist(undefined)).toEqual([])
    expect(parseAllowlist(null)).toEqual([])
    expect(parseAllowlist('')).toEqual([])
  })

  it('splits a mix of commas and newlines, normalizes, and removes duplicates', () => {
    expect(parseAllowlist('A@x.com, b@x.com\n a@x.com \n\n')).toEqual(['a@x.com', 'b@x.com'])
  })
})

describe('isEmailAllowed', () => {
  it('allows nobody when the allowlist is empty', () => {
    expect(isEmailAllowed('owner@example.com', [])).toBe(false)
  })

  it('ignores differences in letter case', () => {
    expect(isEmailAllowed('OWNER@example.com', ALLOWLIST)).toBe(true)
  })

  it('rejects an e-mail that is not in the list', () => {
    expect(isEmailAllowed('someone@example.com', ALLOWLIST)).toBe(false)
  })
})

describe('devIdentityAllowed', () => {
  it.each([
    ['development', true],
    ['test', true],
    ['production', false],
    ['staging', false],
  ])('ENVIRONMENT=%s → %s', (environment, expected) => {
    expect(devIdentityAllowed(environment)).toBe(expected)
  })

  it('treats not set as production and rejects', () => {
    expect(devIdentityAllowed(undefined)).toBe(false)
    expect(devIdentityAllowed(null)).toBe(false)
  })
})

describe('extractAccessToken', () => {
  it('returns null when there is no header', () => {
    expect(extractAccessToken(new Headers())).toBeNull()
  })

  it('treats an empty string as null', () => {
    expect(extractAccessToken(new Headers({ [ACCESS_JWT_HEADER]: '   ' }))).toBeNull()
  })

  it('returns the value as is when present', () => {
    expect(extractAccessToken(new Headers({ [ACCESS_JWT_HEADER]: 'abc' }))).toBe('abc')
  })
})

describe('authenticateAccessJwt', () => {
  const base = {
    keySet: undefined as unknown as JWTVerifyGetKey,
    issuer: ISSUER,
    audience: AUDIENCE,
    allowlist: ALLOWLIST,
  }

  it('returns misconfigured when issuer is not set', async () => {
    const result = await authenticateAccessJwt({ ...base, keySet, issuer: '', token: 'x' })
    expect(result).toEqual({ ok: false, reason: 'misconfigured' })
  })

  it('returns misconfigured when audience is not set', async () => {
    const result = await authenticateAccessJwt({ ...base, keySet, audience: '', token: 'x' })
    expect(result).toEqual({ ok: false, reason: 'misconfigured' })
  })

  it('returns missing_token when there is no JWT', async () => {
    const result = await authenticateAccessJwt({ ...base, keySet, token: null })
    expect(result).toEqual({ ok: false, reason: 'missing_token' })
  })

  it('returns invalid_token when the signature is not from a legitimate key', async () => {
    const token = await mintToken({ email: 'owner@example.com', key: foreignKey })
    const result = await authenticateAccessJwt({ ...base, keySet, token })
    expect(result).toEqual({ ok: false, reason: 'invalid_token' })
  })

  it('returns invalid_token when audience differs', async () => {
    const token = await mintToken({ email: 'owner@example.com', audience: 'other-aud' })
    const result = await authenticateAccessJwt({ ...base, keySet, token })
    expect(result).toEqual({ ok: false, reason: 'invalid_token' })
  })

  it('returns invalid_token when issuer differs', async () => {
    const token = await mintToken({
      email: 'owner@example.com',
      issuer: 'https://evil.example.com',
    })
    const result = await authenticateAccessJwt({ ...base, keySet, token })
    expect(result).toEqual({ ok: false, reason: 'invalid_token' })
  })

  it('returns invalid_token when expired', async () => {
    const token = await mintToken({ email: 'owner@example.com', expiresIn: '-1h' })
    const result = await authenticateAccessJwt({ ...base, keySet, token })
    expect(result).toEqual({ ok: false, reason: 'invalid_token' })
  })

  it('returns missing_email when there is no email', async () => {
    const token = await mintToken({})
    const result = await authenticateAccessJwt({ ...base, keySet, token })
    expect(result).toEqual({ ok: false, reason: 'missing_email' })
  })

  it('returns missing_email when email is not a string', async () => {
    const token = await mintToken({ email: 12345 })
    const result = await authenticateAccessJwt({ ...base, keySet, token })
    expect(result).toEqual({ ok: false, reason: 'missing_email' })
  })

  it('returns missing_email when email is an empty string', async () => {
    const token = await mintToken({ email: '   ' })
    const result = await authenticateAccessJwt({ ...base, keySet, token })
    expect(result).toEqual({ ok: false, reason: 'missing_email' })
  })

  it('returns not_allowed when outside the allowlist even with a valid signature', async () => {
    const token = await mintToken({ email: 'stranger@example.com' })
    const result = await authenticateAccessJwt({ ...base, keySet, token })
    expect(result).toEqual({ ok: false, reason: 'not_allowed' })
  })

  it('authenticates with a legitimate JWT inside the allowlist', async () => {
    const token = await mintToken({ email: 'Owner@Example.com' })
    const result = await authenticateAccessJwt({ ...base, keySet, token })
    expect(result).toEqual({ ok: true, identity: { email: 'owner@example.com', source: 'access' } })
  })
})

describe('resolveDevIdentity', () => {
  it('never allows the fallback ID in production', () => {
    const result = resolveDevIdentity({
      environment: 'production',
      devEmail: 'owner@example.com',
      allowlist: ALLOWLIST,
    })
    expect(result).toEqual({ ok: false, reason: 'missing_token' })
  })

  it('returns missing_email when the fallback e-mail is not set', () => {
    expect(
      resolveDevIdentity({ environment: 'development', devEmail: undefined, allowlist: ALLOWLIST }),
    ).toEqual({ ok: false, reason: 'missing_email' })
    expect(
      resolveDevIdentity({ environment: 'development', devEmail: '  ', allowlist: ALLOWLIST }),
    ).toEqual({ ok: false, reason: 'missing_email' })
  })

  it('returns not_allowed when the fallback e-mail is outside the allowlist', () => {
    expect(
      resolveDevIdentity({
        environment: 'development',
        devEmail: 'stranger@example.com',
        allowlist: ALLOWLIST,
      }),
    ).toEqual({ ok: false, reason: 'not_allowed' })
  })

  it('authenticates as dev in development and inside the allowlist', () => {
    expect(
      resolveDevIdentity({
        environment: 'development',
        devEmail: 'Owner@Example.com',
        allowlist: ALLOWLIST,
      }),
    ).toEqual({ ok: true, identity: { email: 'owner@example.com', source: 'dev' } })
  })
})

describe('describeFailure', () => {
  it('returns wording that does not leak internals', () => {
    expect(describeFailure('not_allowed')).toBe('このアカウントには利用権限がありません。')
    expect(describeFailure('misconfigured')).toBe(
      'アクセス制御が未設定です。管理者に連絡してください。',
    )
    expect(describeFailure('missing_token')).toBe('ログインが必要です。')
    expect(describeFailure('invalid_token')).toBe('ログインが必要です。')
    expect(describeFailure('missing_email')).toBe('ログインが必要です。')
  })
})
