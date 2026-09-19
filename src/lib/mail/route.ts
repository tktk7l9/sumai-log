/**
 * 受信メールがどの経路で来たかを決める（設計 2026-09-19 §3-3）。差出人だけでは偽装できるので、
 * Gmail の自動転送が付ける X-Forwarded-For か、二人自身からの手動転送だけを受理する。
 */

import type { ParsedMail } from './parse'

/** Gmail が「転送先アドレスの確認」を送ってくる差出人 */
export const GMAIL_FORWARDING_NOTICE = 'forwarding-noreply@google.com'

export type RouteResult =
  | { kind: 'auto'; forwardedBy: string }
  | { kind: 'manual'; forwardedBy: string }
  | { kind: 'system' }
  | { kind: 'rejected'; reason: string }

export function classifyRoute(
  mail: Pick<ParsedMail, 'from' | 'forwardedFor'>,
  allowlist: readonly string[],
): RouteResult {
  if (mail.from === GMAIL_FORWARDING_NOTICE) return { kind: 'system' }
  const auto = mail.forwardedFor.find((a) => allowlist.includes(a))
  if (auto) return { kind: 'auto', forwardedBy: auto }
  if (allowlist.includes(mail.from)) return { kind: 'manual', forwardedBy: mail.from }
  return { kind: 'rejected', reason: 'not forwarded by owner' }
}
