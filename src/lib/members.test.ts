import { describe, expect, it } from 'vitest'

import { MEMBER_COLORS, findMember, parseMembers } from './members'

describe('parseMembers', () => {
  it('email:表示名:色 をカンマ区切りで読む（メールは小文字化・空白除去）', () => {
    expect(parseMembers(' Owner@Example.com : 甲 : teal , partner@example.com:乙:pink')).toEqual([
      { email: 'owner@example.com', displayName: '甲', color: 'teal' },
      { email: 'partner@example.com', displayName: '乙', color: 'pink' },
    ])
  })

  it('色が未知なら gray、表示名が無ければメールのローカル部', () => {
    expect(parseMembers('owner@example.com::hotpink')).toEqual([
      { email: 'owner@example.com', displayName: 'owner', color: 'gray' },
    ])
  })

  it('空・不正な項目は無視し、同じメールは先勝ち', () => {
    expect(parseMembers('')).toEqual([])
    expect(parseMembers(undefined)).toEqual([])
    expect(
      parseMembers(',,not-an-email:x:teal,owner@example.com:甲:teal,owner@example.com:丙:pink'),
    ).toEqual([{ email: 'owner@example.com', displayName: '甲', color: 'teal' }])
  })
})

describe('findMember', () => {
  const members = parseMembers('owner@example.com:甲:teal')
  it('登録済みならその人', () => {
    expect(findMember(members, 'OWNER@example.com')).toEqual({
      email: 'owner@example.com',
      displayName: '甲',
      color: 'teal',
    })
  })
  it('未登録ならメールのローカル部と gray で仮の人を返す', () => {
    expect(findMember(members, 'someone@example.com')).toEqual({
      email: 'someone@example.com',
      displayName: 'someone',
      color: 'gray',
    })
  })
  it('色の候補は Mantine の色名', () => {
    expect(MEMBER_COLORS).toContain('teal')
  })
})
