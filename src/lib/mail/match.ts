/**
 * Mail import (design 2026-09-19 §3-5): matching the sender domain against vendors. Pure
 * functions only. A vendor's `news_email_domain` is stored comma-separated and lowercase
 * (normalizeDomains).
 */

const ADDRESS_IN_BRACKETS = /<([^<>]+)>/

/** Extracts the address part from 'Name <x@y.com>' / 'x@y.com' and lowercases it */
function extractAddress(raw: string): string {
  const m = ADDRESS_IN_BRACKETS.exec(raw)
  return (m ? m[1] : raw).trim().toLowerCase()
}

/** The right side of the '@' in an address. null when absent */
export function domainOf(address: string): string | null {
  const addr = extractAddress(address)
  const at = addr.lastIndexOf('@')
  if (at < 0) return null
  const domain = addr.slice(at + 1)
  return domain.length > 0 ? domain : null
}

/** Normalises form input to comma-separated, lowercase, no duplicates. null when empty */
export function normalizeDomains(input: string | null | undefined): string | null {
  if (!input) return null
  const seen = new Set<string>()
  for (const part of input.split(/[,\n]/)) {
    const raw = part.trim().toLowerCase()
    if (!raw) continue
    const at = raw.lastIndexOf('@')
    const domain = at >= 0 ? raw.slice(at + 1) : raw
    if (domain) seen.add(domain)
  }
  return seen.size > 0 ? [...seen].join(',') : null
}

export function splitDomains(stored: string | null | undefined): string[] {
  if (!stored) return []
  return stored.split(',').filter((d) => d.length > 0)
}

/** Exact match or a subdomain ('mail.example.com' matches 'example.com') */
export function domainMatches(domain: string, registered: string): boolean {
  return domain === registered || domain.endsWith(`.${registered}`)
}

/** The first vendor whose registered domain the sender domain matches. null when none */
export function matchVendorByDomain<T extends { newsEmailDomain: string | null }>(
  fromAddress: string,
  vendors: readonly T[],
): T | null {
  const domain = domainOf(fromAddress)
  if (!domain) return null
  for (const v of vendors) {
    if (splitDomains(v.newsEmailDomain).some((r) => domainMatches(domain, r))) return v
  }
  return null
}
