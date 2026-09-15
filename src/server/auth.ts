import { env } from 'cloudflare:workers'
import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose'

import {
  authenticateAccessJwt,
  describeFailure,
  devIdentityAllowed,
  extractAccessToken,
  parseAllowlist,
  resolveDevIdentity,
  type AuthResult,
  type Identity,
} from '../lib/access'
import { securityHeadersInit } from '../lib/securityHeaders'

/**
 * Cloudflare Access 認証のバインディング依存部分。
 * 判定ロジック本体は src/lib/access.ts にあり、ここは env と JWKS 取得の接続のみ。
 */

let cachedKeySet: JWTVerifyGetKey | null = null
let cachedKeySetIssuer: string | null = null

/** チームドメインごとに JWKS を 1 度だけ作る（jose 側でキャッシュされる）。 */
function getKeySet(issuer: string): JWTVerifyGetKey {
  if (!cachedKeySet || cachedKeySetIssuer !== issuer) {
    cachedKeySet = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`))
    cachedKeySetIssuer = issuer
  }
  return cachedKeySet
}

function readConfig() {
  const teamDomain = (env.ACCESS_TEAM_DOMAIN ?? '').trim().replace(/\/$/, '')
  return {
    issuer: teamDomain,
    audience: (env.ACCESS_POLICY_AUD ?? '').trim(),
    allowlist: parseAllowlist(env.ACCESS_ALLOWED_EMAILS),
    environment: env.ENVIRONMENT,
    devEmail: env.DEV_IDENTITY_EMAIL,
  }
}

/**
 * リクエストの認証を行う。
 *
 * 本番: Cloudflare Access が付与する Cf-Access-Jwt-Assertion を検証する。
 * ローカル: Access を通らないため DEV_IDENTITY_EMAIL で代替する。
 *   ただし ENVIRONMENT が development / test のときに限る（.dev.vars で明示的に指定する）。
 *   wrangler.jsonc の既定は production なので、設定漏れは自動的に拒否側に倒れる。
 */
export async function authenticateRequest(request: Request): Promise<AuthResult> {
  const config = readConfig()
  const token = extractAccessToken(request.headers)

  if (token === null && devIdentityAllowed(config.environment)) {
    return resolveDevIdentity({
      environment: config.environment,
      devEmail: config.devEmail,
      allowlist: config.allowlist,
    })
  }

  // JWKS の URL 組み立て前に設定を確かめる。issuer が空のまま new URL() を
  // 呼ぶと同期的に throw し、403 ではなく 500 になってしまう。
  if (!config.issuer || !config.audience) {
    return { ok: false, reason: 'misconfigured' }
  }

  return authenticateAccessJwt({
    token,
    keySet: getKeySet(config.issuer),
    issuer: config.issuer,
    audience: config.audience,
    allowlist: config.allowlist,
  })
}

/** 認証済み利用者を返す。失敗したら 403 の Response を throw する。 */
export async function requireUser(request: Request): Promise<Identity> {
  const result = await authenticateRequest(request)
  if (!result.ok) {
    throw new Response(describeFailure(result.reason), {
      status: 403,
      headers: securityHeadersInit({ 'content-type': 'text/plain; charset=utf-8' }),
    })
  }
  return result.identity
}
