import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import { findMember, parseMembers, type Member } from '../lib/members'
import { authenticateRequest } from './auth'

/** secret MEMBERS を読む。未設定なら空（表示はメールのローカル部・gray になる） */
export function allMembers(): Member[] {
  return parseMembers((env as unknown as { MEMBERS?: string }).MEMBERS)
}

/** 操作者のメール。ミドルウェアで認証済みだが、取れなければ 'unknown' */
export async function currentActorEmail(): Promise<string> {
  try {
    const result = await authenticateRequest(getRequest())
    return result.ok ? result.identity.email : 'unknown'
  } catch {
    return 'unknown'
  }
}

export const getCurrentMember = createServerFn().handler(async () => {
  const members = allMembers()
  const email = await currentActorEmail()
  return { me: findMember(members, email), members }
})
