/**
 * Decides which route an inbound mail came through (design 2026-09-19 §3-3).
 *
 * Trust model: authorization uses only the **envelope sender** (passed by Cloudflare Email
 * Routing from the SMTP `MAIL FROM`; `ForwardableEmailMessage.from` / `InboundMessage.from`).
 * Both the `From:` header and the `X-Forwarded-For` header are part of the mail body (the
 * `ParsedMail` parsed by postal-mime), and anyone who knows the forwarding address can write
 * them = an attacker can spoof them.
 *
 * That does not mean the envelope sender cannot be spoofed. Email Routing
 * **rejects mail that fails authentication according to the sending domain's DMARC policy**.
 * So the strength of the protection depends on the sending domain's settings:
 *   - `google.com` is `p=reject`, so Routing drops mail that impersonates
 *     `forwarding-noreply@google.com` = **the system route is protected**.
 *   - `gmail.com` is `p=none`, so mail whose envelope is spoofed as `owner@gmail.com`
 *     is not rejected even when SPF fails and **can pass Routing**.
 * The envelope sender is a stronger check than the headers, but not a complete one. The worst
 * case is one fake vendor news row being stored (the body is rendered as text, so links cannot
 * be clicked).
 *
 * Mitigation: make the forwarding address unguessable (secret `MAIL_INBOX_ADDRESS`,
 * e.g. `news-xxxxxxxx@sumai-log.app`), which raises the precondition for spoofing to
 * "the attacker knows that address".
 * follow-up: verify the `Authentication-Results` / ARC (`d=google.com`) that Cloudflare adds
 * and authenticate auto-forwarding strictly (after checking the headers on real mail).
 *
 * Gmail auto-forwarding rewrites the envelope sender (plus-addressing):
 *   when owner@example.com auto-forwards through a filter to the forwarding address, the
 *   envelope becomes `owner+caf_=news-xxxxxxxx=sumai-log.app@gmail.com` (the `From:` header
 *   stays the vendor's). `normalizeEnvelopeAddress` drops the `+tag` to restore
 *   `owner@example.com` before comparing with the allowlist.
 * For a manual forward (the "Forward" feature) the envelope sender is the member's own address
 * (the `From:` header is the same), and the original mail is inside the forwarded block of the
 * body.
 *
 * The headers (`From:` and `X-Forwarded-For`) are not used for authorization. They are used
 * only for the *cosmetic decision* of "auto-forward or manual forward" (whether `From:` is in
 * the allowlist tells a mail from a vendor apart from one the member wrote). `forwardedFor`
 * stays in `ParsedMail` for information.
 */

import type { ParsedMail } from './parse'

/** Sender Gmail uses for the forwarding address confirmation (From header; can be spoofed) */
export const GMAIL_FORWARDING_NOTICE = 'forwarding-noreply@google.com'

export type RouteResult =
  | { kind: 'auto'; forwardedBy: string }
  | { kind: 'manual'; forwardedBy: string }
  | { kind: 'system' }
  | { kind: 'rejected'; reason: string }

/**
 * Splits an address into local part and domain at the **first `@`**. null when there is no `@`.
 * Keeps the splitting in one place (if `normalizeEnvelopeAddress` and `classifyRoute` counted
 * differently, an address like `x@evil.example@google.com` would make "the domain used for
 * normalization" and "the domain used for the trust decision" diverge).
 */
function splitAddress(addr: string): { local: string; domain: string } | null {
  const at = addr.indexOf('@')
  if (at === -1) return null
  return { local: addr.slice(0, at), domain: addr.slice(at + 1) }
}

/**
 * Normalizes the envelope sender: lowercase, trim whitespace, strip `<>`, and
 * remove the `+tag` of the local part (undoes Gmail plus-addressing / the auto-forward rewrite).
 * Empty input (after trimming) gives `''`.
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
  // Take the domain at the "first `@`", same as normalizeEnvelopeAddress. A broken envelope
  // with no `@`, or with another `@` in the domain part (`x@evil.example@google.com`), is not
  // trusted, because the decision would change with which part is taken as the domain.
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

  // From here on the mail is authorized (the envelope is in the allowlist). The From header is
  // used only for the cosmetic decision between "auto-forward (the vendor's mail itself)" and
  // "manual forward (written / forwarded by the member)".
  return allowlist.includes(mail.from)
    ? { kind: 'manual', forwardedBy: envelope }
    : { kind: 'auto', forwardedBy: envelope }
}
