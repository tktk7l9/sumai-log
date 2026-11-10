/**
 * Whether an inbound mail was addressed to the forwarding address (secret MAIL_INBOX_ADDRESS).
 *
 * The Email Routing rule for that address is what sends mail to the Worker. This check keeps a
 * second rule, or a catch-all that also points at the Worker, from turning another (perhaps
 * guessable) address into an inbox (security audit 2026-11-10). `to` is the envelope
 * recipient (`message.to`); both sides are compared trimmed and lowercased.
 *
 * When the secret is not set there is nothing to compare with and every recipient is
 * accepted, as before (the settings page shows 「未設定」 (Not set) in that case).
 */
export function isInboxRecipient(to: string, inboxAddress: string | null | undefined): boolean {
  const inbox = inboxAddress?.trim().toLowerCase()
  if (!inbox) return true
  return to.trim().toLowerCase() === inbox
}
