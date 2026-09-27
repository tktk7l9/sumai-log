import { describe, expect, it } from 'vitest'

import { eventInput } from './events.schema'

/**
 * saveEvent is wrapped in createServerFn, so calling it directly from a plain vitest
 * workers test without the TanStack Start server runtime (the Start context of
 * AsyncLocalStorage) fails with "No Start context found" (before it even reaches the
 * validator). Looking at eventInput itself, which is the validator, is enough for the
 * actual validation, so this file checks eventInput.safeParse directly
 * (the same pattern as src/server/tags.worker-test.ts).
 *
 * The import comes from `./events.schema` instead of `./events` because events.ts
 * statically imports getRequest of `@tanstack/react-start/server` through
 * currentActorEmail (used inside saveEvent), which hits a virtual specifier
 * (`#tanstack-router-entry`) that cannot be resolved from this plain vitest workers test
 * without the TanStack Start Vite plugin, and crashes
 * (details in the comment of events.schema.ts).
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
  it('passes with null startTime/endTime when all day, and startsAt is the date only', () => {
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

  it('turns startsAt/endsAt into ISO strings with +09:00 when a time is given', () => {
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

  it('rejects a missing startTime when not all day (開始時刻を入れてください)', () => {
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

  it('rejects an end time before the start time (終了時刻は開始より後にしてください)', () => {
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
