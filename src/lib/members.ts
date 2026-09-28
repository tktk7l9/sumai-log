/**
 * Display name and color of each member. Cloudflare Access does the authentication; this only
 * reads the secret `MEMBERS` ("email:displayName:color,..."). Nothing is stored in the DB.
 */
export type Member = { email: string; displayName: string; color: string }

export const MEMBER_COLORS = [
  'teal',
  'pink',
  'blue',
  'orange',
  'grape',
  'lime',
  'cyan',
  'indigo',
  'red',
  'yellow',
  'violet',
  'green',
  'gray',
  'clay',
] as const

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function localPart(email: string): string {
  return email.slice(0, email.indexOf('@'))
}

export function parseMembers(raw: string | null | undefined): Member[] {
  if (!raw) return []
  const seen = new Set<string>()
  const members: Member[] = []
  for (const entry of raw.split(',')) {
    const [rawEmail = '', rawName = '', rawColor = ''] = entry.split(':').map((s) => s.trim())
    const email = rawEmail.toLowerCase()
    if (!EMAIL.test(email) || seen.has(email)) continue
    seen.add(email)
    const color = (MEMBER_COLORS as readonly string[]).includes(rawColor) ? rawColor : 'gray'
    members.push({ email, displayName: rawName || localPart(email), color })
  }
  return members
}

export function findMember(members: readonly Member[], email: string): Member {
  const key = email.trim().toLowerCase()
  return (
    members.find((m) => m.email === key) ?? {
      email: key,
      displayName: localPart(key),
      color: 'gray',
    }
  )
}
