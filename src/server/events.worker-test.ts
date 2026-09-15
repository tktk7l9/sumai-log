import { describe, expect, it } from 'vitest'

import { eventInput } from './events.schema'

/**
 * saveEvent は createServerFn でラップされているため、TanStack Start の
 * サーバーランタイム（AsyncLocalStorage の Start context）が無い素の
 * vitest workers テストから直接呼ぶと「No Start context found」で落ちる
 * （validator に届く前の話）。実質的な検証は validator である eventInput
 * 自体を見れば足りるので、ここでは eventInput.safeParse を直接確認する
 * （src/server/tags.worker-test.ts と同じパターン）。
 *
 * `./events` からではなく `./events.schema` から import しているのは、
 * events.ts が（saveEvent の中で使う）currentActorEmail 経由で
 * `@tanstack/react-start/server` の getRequest を静的 import しており、それが
 * TanStack Start の Vite プラグイン無しのこの素の vitest workers テストからは
 * 解決できない virtual specifier（`#tanstack-router-entry`）を踏んで落ちるため
 * （詳細は events.schema.ts のコメント）。
 */
const base = {
  title: '見学会',
  kind: 'visit' as const,
  date: '2030-01-05',
  placeId: null,
  vendorId: null,
  propertyId: null,
  note: null,
}

describe('eventInput', () => {
  it('終日なら startTime/endTime が null でも通り、startsAt は日付のみ', () => {
    const result = eventInput.safeParse({
      ...base,
      allDay: true,
      startTime: null,
      endTime: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.startsAt).toBe('2030-01-05')
      expect(result.data.endsAt).toBeNull()
    }
  })

  it('時刻ありなら startsAt/endsAt が +09:00 付きの ISO 文字列になる', () => {
    const result = eventInput.safeParse({
      ...base,
      allDay: false,
      startTime: '10:00',
      endTime: '11:30',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.startsAt).toBe('2030-01-05T10:00:00+09:00')
      expect(result.data.endsAt).toBe('2030-01-05T11:30:00+09:00')
    }
  })

  it('終日でないのに startTime が無ければ拒否する（開始時刻を入れてください）', () => {
    const result = eventInput.safeParse({
      ...base,
      allDay: false,
      startTime: null,
      endTime: null,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('開始時刻を入れてください')
      expect(result.error.issues[0]?.path).toEqual(['startTime'])
    }
  })

  it('終了時刻が開始時刻より前なら拒否する（終了時刻は開始より後にしてください）', () => {
    const result = eventInput.safeParse({
      ...base,
      allDay: false,
      startTime: '11:00',
      endTime: '10:00',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('終了時刻は開始より後にしてください')
      expect(result.error.issues[0]?.path).toEqual(['endTime'])
    }
  })
})
