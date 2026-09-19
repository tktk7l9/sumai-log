/**
 * 受信メールがどの経路で来たかを決める（設計 2026-09-19 §3-3）。
 *
 * 信頼モデル: 認可は **エンベロープ送信者**（Cloudflare Email Routing が SMTP の
 * `MAIL FROM` から渡す。`ForwardableEmailMessage.from` / `InboundMessage.from`）だけで行う。
 * `From:` ヘッダも `X-Forwarded-For` ヘッダもメール本文の一部（postal-mime が解析した
 * `ParsedMail`）であり、`news@sumai-log.app` を知っていれば誰でも書ける＝攻撃者が
 * 偽装できる。Routing を経由した時点でエンベロープ送信者は SMTP レベルで検証済みなので、
 * ここだけを許可リストと突き合わせる。
 *
 * Gmail の自動転送はエンベロープ送信者を書き換える（plus-addressing）:
 *   owner@example.com が news@sumai-log.app 宛のフィルタで自動転送すると、エンベロープは
 *   `owner+caf_=news=sumai-log.app@gmail.com` になる（`From:` ヘッダは業者のまま）。
 *   `normalizeEnvelopeAddress` で `+タグ` を落として `owner@example.com` に戻してから
 *   許可リストと比較する。
 * 手動転送（「転送」機能）はエンベロープ送信者が本人のアドレスそのもの（`From:` ヘッダも
 * 同じ）で、元メールは本文の転送ブロックの中に入っている。
 *
 * ヘッダ（`From:` と `X-Forwarded-For`）は認可には使わない。使うのは「自動転送か手動転送か」
 * という *見た目の判定*（`From:` が許可リストに入っているかどうかで、元メールが業者からの
 * ものか本人が書いたものかを見分ける）だけ。`forwardedFor` は情報用に `ParsedMail` に残す。
 */

import type { ParsedMail } from './parse'

/** Gmail が「転送先アドレスの確認」を送ってくる差出人（From ヘッダ。偽装され得る） */
export const GMAIL_FORWARDING_NOTICE = 'forwarding-noreply@google.com'

export type RouteResult =
  | { kind: 'auto'; forwardedBy: string }
  | { kind: 'manual'; forwardedBy: string }
  | { kind: 'system' }
  | { kind: 'rejected'; reason: string }

/**
 * エンベロープ送信者を正規化する: 小文字化・前後空白除去・`<>` を外す・
 * ローカル部の `+タグ` を除去する（Gmail の plus-addressing / 自動転送の書き換えを戻す）。
 * 空入力（前後空白除去後）は `''`。
 */
export function normalizeEnvelopeAddress(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const unwrapped =
    trimmed.startsWith('<') && trimmed.endsWith('>') ? trimmed.slice(1, -1) : trimmed
  const lower = unwrapped.toLowerCase()
  const at = lower.indexOf('@')
  if (at === -1) return lower
  const local = lower.slice(0, at)
  const domain = lower.slice(at + 1)
  const plus = local.indexOf('+')
  const cleanLocal = plus === -1 ? local : local.slice(0, plus)
  return `${cleanLocal}@${domain}`
}

export function classifyRoute(
  mail: Pick<ParsedMail, 'from' | 'forwardedFor'>,
  allowlist: readonly string[],
  envelopeFrom: string,
): RouteResult {
  const envelope = normalizeEnvelopeAddress(envelopeFrom)
  const envelopeDomain = envelope.slice(envelope.lastIndexOf('@') + 1)

  if (mail.from === GMAIL_FORWARDING_NOTICE) {
    if (envelopeDomain === 'google.com' || envelopeDomain.endsWith('.google.com')) {
      return { kind: 'system' }
    }
    return { kind: 'rejected', reason: 'envelope sender not trusted' }
  }

  if (!allowlist.includes(envelope)) {
    return { kind: 'rejected', reason: 'envelope sender not allowed' }
  }

  // ここから先は認可済み（envelope が許可リストに入っている）。From ヘッダは
  // 「自動転送（業者のメールそのもの）」か「手動転送（本人が書いた／転送した）」かという
  // 見た目の判定にだけ使う。
  return allowlist.includes(mail.from)
    ? { kind: 'manual', forwardedBy: envelope }
    : { kind: 'auto', forwardedBy: envelope }
}
