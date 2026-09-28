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
 * The binding-dependent part of Cloudflare Access authentication.
 * The decision logic itself is in src/lib/access.ts; this file only wires env and the JWKS fetch.
 */

let cachedKeySet: JWTVerifyGetKey | null = null
let cachedKeySetIssuer: string | null = null

/** Creates the JWKS only once per team domain (cached on the jose side). */
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
 * Authenticates the request.
 *
 * Production: verifies the Cf-Access-Jwt-Assertion attached by Cloudflare Access.
 * Local: requests do not pass through Access, so DEV_IDENTITY_EMAIL substitutes for it.
 *   Only when ENVIRONMENT is development / test (set explicitly in .dev.vars).
 *   The default in wrangler.jsonc is production, so a missing setting automatically falls to
 *   the deny side.
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

  // Check the configuration before building the JWKS URL. Calling new URL() with an empty
  // issuer throws synchronously and results in 500 instead of 403.
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

/** Returns the authenticated user. On failure throws a 403 Response. */
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
