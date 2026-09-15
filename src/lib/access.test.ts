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
/** 正規の鍵セットには含まれない鍵。署名不正のケースを作るのに使う。 */
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
  it('前後の空白を落とし小文字にする', () => {
    expect(normalizeEmail('  Owner@Example.COM ')).toBe('owner@example.com')
  })
})

describe('parseAllowlist', () => {
  it('未設定なら空配列', () => {
    expect(parseAllowlist(undefined)).toEqual([])
    expect(parseAllowlist(null)).toEqual([])
    expect(parseAllowlist('')).toEqual([])
  })

  it('カンマ・改行の混在を分割し、正規化して重複を除く', () => {
    expect(parseAllowlist('A@x.com, b@x.com\n a@x.com \n\n')).toEqual(['a@x.com', 'b@x.com'])
  })
})

describe('isEmailAllowed', () => {
  it('allowlist が空なら誰も許可しない', () => {
    expect(isEmailAllowed('owner@example.com', [])).toBe(false)
  })

  it('大文字小文字の違いは無視する', () => {
    expect(isEmailAllowed('OWNER@example.com', ALLOWLIST)).toBe(true)
  })

  it('一覧に無いメールは拒否する', () => {
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

  it('未設定は本番扱いで拒否する', () => {
    expect(devIdentityAllowed(undefined)).toBe(false)
    expect(devIdentityAllowed(null)).toBe(false)
  })
})

describe('extractAccessToken', () => {
  it('ヘッダが無ければ null', () => {
    expect(extractAccessToken(new Headers())).toBeNull()
  })

  it('空文字は null 扱い', () => {
    expect(extractAccessToken(new Headers({ [ACCESS_JWT_HEADER]: '   ' }))).toBeNull()
  })

  it('値があればそのまま返す', () => {
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

  it('issuer 未設定なら misconfigured', async () => {
    const result = await authenticateAccessJwt({ ...base, keySet, issuer: '', token: 'x' })
    expect(result).toEqual({ ok: false, reason: 'misconfigured' })
  })

  it('audience 未設定なら misconfigured', async () => {
    const result = await authenticateAccessJwt({ ...base, keySet, audience: '', token: 'x' })
    expect(result).toEqual({ ok: false, reason: 'misconfigured' })
  })

  it('JWT が無ければ missing_token', async () => {
    const result = await authenticateAccessJwt({ ...base, keySet, token: null })
    expect(result).toEqual({ ok: false, reason: 'missing_token' })
  })

  it('署名が正規の鍵でなければ invalid_token', async () => {
    const token = await mintToken({ email: 'owner@example.com', key: foreignKey })
    const result = await authenticateAccessJwt({ ...base, keySet, token })
    expect(result).toEqual({ ok: false, reason: 'invalid_token' })
  })

  it('audience が違えば invalid_token', async () => {
    const token = await mintToken({ email: 'owner@example.com', audience: 'other-aud' })
    const result = await authenticateAccessJwt({ ...base, keySet, token })
    expect(result).toEqual({ ok: false, reason: 'invalid_token' })
  })

  it('issuer が違えば invalid_token', async () => {
    const token = await mintToken({
      email: 'owner@example.com',
      issuer: 'https://evil.example.com',
    })
    const result = await authenticateAccessJwt({ ...base, keySet, token })
    expect(result).toEqual({ ok: false, reason: 'invalid_token' })
  })

  it('期限切れは invalid_token', async () => {
    const token = await mintToken({ email: 'owner@example.com', expiresIn: '-1h' })
    const result = await authenticateAccessJwt({ ...base, keySet, token })
    expect(result).toEqual({ ok: false, reason: 'invalid_token' })
  })

  it('email が無ければ missing_email', async () => {
    const token = await mintToken({})
    const result = await authenticateAccessJwt({ ...base, keySet, token })
    expect(result).toEqual({ ok: false, reason: 'missing_email' })
  })

  it('email が文字列でなければ missing_email', async () => {
    const token = await mintToken({ email: 12345 })
    const result = await authenticateAccessJwt({ ...base, keySet, token })
    expect(result).toEqual({ ok: false, reason: 'missing_email' })
  })

  it('email が空文字なら missing_email', async () => {
    const token = await mintToken({ email: '   ' })
    const result = await authenticateAccessJwt({ ...base, keySet, token })
    expect(result).toEqual({ ok: false, reason: 'missing_email' })
  })

  it('署名は正しくても allowlist 外なら not_allowed', async () => {
    const token = await mintToken({ email: 'stranger@example.com' })
    const result = await authenticateAccessJwt({ ...base, keySet, token })
    expect(result).toEqual({ ok: false, reason: 'not_allowed' })
  })

  it('正規の JWT かつ allowlist 内なら認証成功', async () => {
    const token = await mintToken({ email: 'Owner@Example.com' })
    const result = await authenticateAccessJwt({ ...base, keySet, token })
    expect(result).toEqual({ ok: true, identity: { email: 'owner@example.com', source: 'access' } })
  })
})

describe('resolveDevIdentity', () => {
  it('本番では代替 ID を絶対に使わせない', () => {
    const result = resolveDevIdentity({
      environment: 'production',
      devEmail: 'owner@example.com',
      allowlist: ALLOWLIST,
    })
    expect(result).toEqual({ ok: false, reason: 'missing_token' })
  })

  it('代替メール未設定なら missing_email', () => {
    expect(
      resolveDevIdentity({ environment: 'development', devEmail: undefined, allowlist: ALLOWLIST }),
    ).toEqual({ ok: false, reason: 'missing_email' })
    expect(
      resolveDevIdentity({ environment: 'development', devEmail: '  ', allowlist: ALLOWLIST }),
    ).toEqual({ ok: false, reason: 'missing_email' })
  })

  it('代替メールが allowlist 外なら not_allowed', () => {
    expect(
      resolveDevIdentity({
        environment: 'development',
        devEmail: 'stranger@example.com',
        allowlist: ALLOWLIST,
      }),
    ).toEqual({ ok: false, reason: 'not_allowed' })
  })

  it('開発環境かつ allowlist 内なら dev として認証成功', () => {
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
  it('内部事情を漏らさない文言を返す', () => {
    expect(describeFailure('not_allowed')).toBe('このアカウントには利用権限がありません。')
    expect(describeFailure('misconfigured')).toBe(
      'アクセス制御が未設定です。管理者に連絡してください。',
    )
    expect(describeFailure('missing_token')).toBe('ログインが必要です。')
    expect(describeFailure('invalid_token')).toBe('ログインが必要です。')
    expect(describeFailure('missing_email')).toBe('ログインが必要です。')
  })
})
