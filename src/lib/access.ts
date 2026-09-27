import { jwtVerify, type JWTVerifyGetKey } from 'jose'

/**
 * Authentication logic for Cloudflare Access (the pure part).
 *
 * It does not depend on bindings or the network, so by swapping the key set it can be
 * tested including signature verification. env and fetching the JWKS are handled by
 * src/server/auth.ts.
 *
 * Design principle: when in doubt, always fall to "reject" (fail closed).
 */

export const ACCESS_JWT_HEADER = 'cf-access-jwt-assertion'

export type Identity = {
  email: string
  /** access = the real one via Cloudflare Access / dev = the fallback for local development */
  source: 'access' | 'dev'
}

export type AuthFailureReason =
  'missing_token' | 'invalid_token' | 'missing_email' | 'not_allowed' | 'misconfigured'

export type AuthResult = { ok: true; identity: Identity } | { ok: false; reason: AuthFailureReason }

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Normalizes the comma- or newline-separated list of allowed e-mails.
 * When there are only empty strings it becomes an empty array = "allow nobody".
 */
export function parseAllowlist(raw: string | undefined | null): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  for (const part of raw.split(/[,\n]/)) {
    const email = normalizeEmail(part)
    if (email) seen.add(email)
  }
  return [...seen]
}

/** When the allowlist is empty, reject everyone (empty does not mean allow everyone). */
export function isEmailAllowed(email: string, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) return false
  return allowlist.includes(normalizeEmail(email))
}

/**
 * Whether the fallback ID for local development may be used.
 * Never enabled in production. When ENVIRONMENT is not set or unknown, it is also treated
 * as production and rejected.
 */
export function devIdentityAllowed(environment: string | undefined | null): boolean {
  return environment === 'development' || environment === 'test'
}

/** Takes the Access JWT out of the request headers. */
export function extractAccessToken(headers: Headers): string | null {
  const token = headers.get(ACCESS_JWT_HEADER)
  return token && token.trim() !== '' ? token : null
}

export type AuthenticateOptions = {
  token: string | null
  /** jose key set resolver (createRemoteJWKSet in production, createLocalJWKSet in tests) */
  keySet: JWTVerifyGetKey
  /** https://<team>.cloudflareaccess.com */
  issuer: string
  /** AUD tag of the Access application */
  audience: string
  allowlist: readonly string[]
}

/**
 * Verifies the Access JWT and judges whether the user is allowed.
 * jose verifies the signature, issuer, audience and expiry.
 */
export async function authenticateAccessJwt({
  token,
  keySet,
  issuer,
  audience,
  allowlist,
}: AuthenticateOptions): Promise<AuthResult> {
  if (!issuer || !audience) return { ok: false, reason: 'misconfigured' }
  if (!token) return { ok: false, reason: 'missing_token' }

  let payload: Record<string, unknown>
  try {
    const verified = await jwtVerify(token, keySet, { issuer, audience })
    payload = verified.payload as Record<string, unknown>
  } catch {
    return { ok: false, reason: 'invalid_token' }
  }

  const rawEmail = payload.email
  if (typeof rawEmail !== 'string' || rawEmail.trim() === '') {
    return { ok: false, reason: 'missing_email' }
  }

  const email = normalizeEmail(rawEmail)
  if (!isEmailAllowed(email, allowlist)) {
    return { ok: false, reason: 'not_allowed' }
  }

  return { ok: true, identity: { email, source: 'access' } }
}

/**
 * Resolves the fallback ID for local development.
 * Always fails in production, or when the fallback e-mail is not in the allowlist.
 */
export function resolveDevIdentity({
  environment,
  devEmail,
  allowlist,
}: {
  environment: string | undefined | null
  devEmail: string | undefined | null
  allowlist: readonly string[]
}): AuthResult {
  if (!devIdentityAllowed(environment)) return { ok: false, reason: 'missing_token' }
  if (!devEmail || devEmail.trim() === '') return { ok: false, reason: 'missing_email' }

  const email = normalizeEmail(devEmail)
  if (!isEmailAllowed(email, allowlist)) return { ok: false, reason: 'not_allowed' }

  return { ok: true, identity: { email, source: 'dev' } }
}

/** Turns the failure reason into wording for the user. Does not leak internals. */
export function describeFailure(reason: AuthFailureReason): string {
  switch (reason) {
    case 'not_allowed':
      return 'このアカウントには利用権限がありません。'
    case 'misconfigured':
      return 'アクセス制御が未設定です。管理者に連絡してください。'
    default:
      return 'ログインが必要です。'
  }
}
