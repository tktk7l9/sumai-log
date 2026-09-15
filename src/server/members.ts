import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import { findMember, parseMembers, type Member } from '../lib/members'
import { securityHeadersInit } from '../lib/securityHeaders'
import { authenticateRequest } from './auth'

/** secret MEMBERS を読む。未設定なら空（表示はメールのローカル部・gray になる） */
export function allMembers(): Member[] {
  // MEMBERS は .dev.vars がある時だけ cf-typegen の生成型に載る（無いローカルでは
  // 型上存在しない）ため any 経由でなくここだけ緩める。値自体は wrangler secret で
  // 常に文字列 | undefined。
  return parseMembers((env as unknown as { MEMBERS?: string }).MEMBERS)
}

/**
 * 操作者のメール。グローバルミドルウェア（src/start.ts）がここに来る前に
 * 認証を強制しているため、失敗側には理論上入らない。呼び出しごとに JWT を
 * 再検証しているのは無駄だが（Phase 2 での改善候補: ミドルウェアの context を
 * 消費して二重検証をやめる）、行を 'unknown' で書き込むよりは安全側に倒す。
 */
export async function currentActorEmail(): Promise<string> {
  const result = await authenticateRequest(getRequest())
  if (!result.ok) {
    throw new Response('ログインが必要です。', {
      status: 403,
      headers: securityHeadersInit({ 'content-type': 'text/plain; charset=utf-8' }),
    })
  }
  return result.identity.email
}

export const getCurrentMember = createServerFn().handler(async () => {
  const members = allMembers()
  const email = await currentActorEmail()
  return { me: findMember(members, email), members }
})
