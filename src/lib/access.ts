import { jwtVerify, type JWTVerifyGetKey } from 'jose'

/**
 * Cloudflare Access の認証ロジック（純粋部分）。
 *
 * バインディングやネットワークに依存しないため、鍵セットを差し替えれば
 * 署名検証まで含めてテストできる。env や JWKS 取得は src/server/auth.ts が担当する。
 *
 * 設計上の原則: 迷ったら必ず「拒否」に倒す（fail closed）。
 */

export const ACCESS_JWT_HEADER = 'cf-access-jwt-assertion'

export type Identity = {
  email: string
  /** access = Cloudflare Access 経由の本物 / dev = ローカル開発の代替 */
  source: 'access' | 'dev'
}

export type AuthFailureReason =
  'missing_token' | 'invalid_token' | 'missing_email' | 'not_allowed' | 'misconfigured'

export type AuthResult = { ok: true; identity: Identity } | { ok: false; reason: AuthFailureReason }

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * カンマ・改行区切りの許可メール一覧を正規化する。
 * 空文字しか無い場合は空配列＝「誰も許可しない」になる。
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

/** allowlist が空のときは全員拒否する（空＝全員許可、にしない）。 */
export function isEmailAllowed(email: string, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) return false
  return allowlist.includes(normalizeEmail(email))
}

/**
 * ローカル開発用の代替 ID を使ってよいか。
 * 本番では絶対に有効化させない。ENVIRONMENT が未設定・不明な場合も本番扱いで拒否する。
 */
export function devIdentityAllowed(environment: string | undefined | null): boolean {
  return environment === 'development' || environment === 'test'
}

/** リクエストヘッダから Access の JWT を取り出す。 */
export function extractAccessToken(headers: Headers): string | null {
  const token = headers.get(ACCESS_JWT_HEADER)
  return token && token.trim() !== '' ? token : null
}

export type AuthenticateOptions = {
  token: string | null
  /** jose の鍵セット解決関数（本番は createRemoteJWKSet、テストは createLocalJWKSet） */
  keySet: JWTVerifyGetKey
  /** https://<team>.cloudflareaccess.com */
  issuer: string
  /** Access アプリケーションの AUD タグ */
  audience: string
  allowlist: readonly string[]
}

/**
 * Access の JWT を検証し、許可された利用者かどうかを判定する。
 * 署名・issuer・audience・有効期限は jose が検証する。
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
 * ローカル開発用の代替 ID を解決する。
 * 本番環境、または代替メールが allowlist に無い場合は必ず失敗する。
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

/** 失敗理由を利用者向けの文言に落とす。内部事情は漏らさない。 */
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
