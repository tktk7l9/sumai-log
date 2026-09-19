/**
 * 受信メールがどの経路で来たかを決める（設計 2026-09-19 §3-3）。
 *
 * 信頼モデル: 認可は **エンベロープ送信者**（Cloudflare Email Routing が SMTP の
 * `MAIL FROM` から渡す。`ForwardableEmailMessage.from` / `InboundMessage.from`）だけで行う。
 * `From:` ヘッダも `X-Forwarded-For` ヘッダもメール本文の一部（postal-mime が解析した
 * `ParsedMail`）であり、転送先アドレスを知っていれば誰でも書ける＝攻撃者が偽装できる。
 *
 * ただし「エンベロープ送信者なら偽装できない」わけではない。Email Routing は
 * **送信ドメインの DMARC ポリシーに従って認証失敗メールを拒否する**。つまり
 * 保護の強さは送信ドメイン側の設定次第で:
 *   - `google.com` は `p=reject` なので、`forwarding-noreply@google.com` を騙る
 *     メールは Routing が弾く＝**system 経路は保護される**。
 *   - `gmail.com` は `p=none` なので、エンベロープを `owner@gmail.com` に偽装した
 *     メールは SPF に失敗しても拒否されず **Routing を通り得る**。
 * エンベロープ送信者はヘッダより強い判定だが、完全ではない。最悪ケースは偽の
 * 「お知らせ」が 1 行入ること（本文はテキストとして描画するのでリンクは押せない）。
 *
 * 緩和策: 転送先アドレスを推測できないもの（secret `MAIL_INBOX_ADDRESS`。
 * 例 `news-xxxxxxxx@sumai-log.app`）にして、偽装の前提条件を「攻撃者がその
 * アドレスを知っていること」まで引き上げる。
 * follow-up: Cloudflare が付ける `Authentication-Results` / ARC（`d=google.com`）を
 * 検証して自動転送を厳密に認証する（実メールでヘッダを確認してから）。
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
 * アドレスを **最初の `@`** でローカル部とドメインに分ける。`@` が無ければ null。
 * 分け方を 1 か所に集める（`normalizeEnvelopeAddress` と `classifyRoute` が別々の
 * 数え方をすると、`x@evil.example@google.com` のようなアドレスで「正規化に使った
 * ドメイン」と「信頼判定に使うドメイン」がずれる）。
 */
function splitAddress(addr: string): { local: string; domain: string } | null {
  const at = addr.indexOf('@')
  if (at === -1) return null
  return { local: addr.slice(0, at), domain: addr.slice(at + 1) }
}

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
  const parts = splitAddress(lower)
  if (!parts) return lower
  const plus = parts.local.indexOf('+')
  const cleanLocal = plus === -1 ? parts.local : parts.local.slice(0, plus)
  return `${cleanLocal}@${parts.domain}`
}

export function classifyRoute(
  mail: Pick<ParsedMail, 'from' | 'forwardedFor'>,
  allowlist: readonly string[],
  envelopeFrom: string,
): RouteResult {
  const envelope = normalizeEnvelopeAddress(envelopeFrom)
  // ドメインは normalizeEnvelopeAddress と同じ「最初の `@`」で取る。`@` が無い／
  // ドメイン側にもう一つ `@` がある（`x@evil.example@google.com`）ような壊れた
  // エンベロープは、どこをドメインと見るかで判定が変わってしまうので信頼しない。
  const parts = splitAddress(envelope)
  const envelopeDomain = parts && !parts.domain.includes('@') ? parts.domain : null

  if (mail.from === GMAIL_FORWARDING_NOTICE) {
    if (envelopeDomain === 'google.com' || envelopeDomain?.endsWith('.google.com')) {
      return { kind: 'system' }
    }
    return { kind: 'rejected', reason: 'envelope sender not trusted' }
  }

  if (envelopeDomain === null || !allowlist.includes(envelope)) {
    return { kind: 'rejected', reason: 'envelope sender not allowed' }
  }

  // ここから先は認可済み（envelope が許可リストに入っている）。From ヘッダは
  // 「自動転送（業者のメールそのもの）」か「手動転送（本人が書いた／転送した）」かという
  // 見た目の判定にだけ使う。
  return allowlist.includes(mail.from)
    ? { kind: 'manual', forwardedBy: envelope }
    : { kind: 'auto', forwardedBy: envelope }
}
