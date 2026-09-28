import { describe, expect, it } from 'vitest'

import { MEMBER_COLORS, findMember, parseMembers } from './members'

describe('parseMembers', () => {
  it('reads comma-separated email:displayName:color (email is lowercased and trimmed)', () => {
    expect(parseMembers(' Owner@Example.com : 甲 : teal , partner@example.com:乙:pink')).toEqual([
      { email: 'owner@example.com', displayName: '甲', color: 'teal' },
      { email: 'partner@example.com', displayName: '乙', color: 'pink' },
    ])
  })

  it('unknown color gives gray, missing display name gives the local part of the email', () => {
    expect(parseMembers('owner@example.com::hotpink')).toEqual([
      { email: 'owner@example.com', displayName: 'owner', color: 'gray' },
    ])
  })

  it('ignores empty and invalid entries, and the first entry wins for the same email', () => {
    expect(parseMembers('')).toEqual([])
    expect(parseMembers(undefined)).toEqual([])
    expect(
      parseMembers(',,not-an-email:x:teal,owner@example.com:甲:teal,owner@example.com:丙:pink'),
    ).toEqual([{ email: 'owner@example.com', displayName: '甲', color: 'teal' }])
  })
})

describe('findMember', () => {
  const members = parseMembers('owner@example.com:甲:teal')
  it('returns the member when registered', () => {
    expect(findMember(members, 'OWNER@example.com')).toEqual({
      email: 'owner@example.com',
      displayName: '甲',
      color: 'teal',
    })
  })
  it('returns a placeholder member with the email local part and gray when not registered', () => {
    expect(findMember(members, 'someone@example.com')).toEqual({
      email: 'someone@example.com',
      displayName: 'someone',
      color: 'gray',
    })
  })
  it('the color options are Mantine color names', () => {
    expect(MEMBER_COLORS).toContain('teal')
  })
})
