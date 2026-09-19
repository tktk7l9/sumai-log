import { describe, expect, it } from 'vitest'

import { GMAIL_FORWARDING_NOTICE, classifyRoute } from './route'

const allow = ['owner@example.com', 'partner@example.com']

describe('classifyRoute', () => {
  it('X-Forwarded-For に許可アドレスがあれば auto（誰が転送したかを持つ）', () => {
    expect(
      classifyRoute(
        { from: 'news@vendor.example', forwardedFor: ['owner@example.com', 'news@x'] },
        allow,
      ),
    ).toEqual({ kind: 'auto', forwardedBy: 'owner@example.com' })
  })
  it('From が許可アドレスなら manual', () => {
    expect(classifyRoute({ from: 'partner@example.com', forwardedFor: [] }, allow)).toEqual({
      kind: 'manual',
      forwardedBy: 'partner@example.com',
    })
  })
  it('Gmail の転送先確認は system（許可リストに無くても）', () => {
    expect(classifyRoute({ from: GMAIL_FORWARDING_NOTICE, forwardedFor: [] }, allow)).toEqual({
      kind: 'system',
    })
  })
  it('どれでもなければ rejected', () => {
    expect(classifyRoute({ from: 'news@vendor.example', forwardedFor: [] }, allow)).toEqual({
      kind: 'rejected',
      reason: 'not forwarded by owner',
    })
    expect(
      classifyRoute({ from: 'x@y.com', forwardedFor: ['stranger@example.org'] }, allow),
    ).toEqual({ kind: 'rejected', reason: 'not forwarded by owner' })
  })
  it('auto の判定は system より優先しない（From が確認メールなら system）', () => {
    expect(
      classifyRoute({ from: GMAIL_FORWARDING_NOTICE, forwardedFor: ['owner@example.com'] }, allow),
    ).toEqual({ kind: 'system' })
  })
})
