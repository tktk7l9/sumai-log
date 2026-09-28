import { waitUntil } from 'cloudflare:workers'

import { getDb } from '../db/client'
import { shouldRecordSeen } from '../lib/usage'
import { writeLastSeen } from './repository'

/**
 * Stores the user's "最後に使った日時" (last used at) in settings (`lastSeen:<email>`).
 *
 * The authentication middleware (src/start.ts) calls this on every request. The write is
 * handed to waitUntil so the response does not wait, and the same person is written only once
 * per SEEN_INTERVAL_MS (throttled with per-isolate memory. When the isolate is replaced it is
 * treated as the first time and written once more, which does no harm).
 * Whatever happens here must not fail the main request.
 */
const lastWritten = new Map<string, number>()

export function recordSeen(email: string, now: number = Date.now()): boolean {
  const key = email.trim().toLowerCase()
  if (key === '' || !shouldRecordSeen(lastWritten.get(key), now)) return false
  lastWritten.set(key, now)
  const write = writeLastSeen(getDb(), key, new Date(now).toISOString()).catch(() => {
    // If the write failed, retry on the next request
    lastWritten.delete(key)
  })
  try {
    waitUntil(write)
  } catch {
    // Outside a request context (tests, etc.) waitUntil is not available. Leaving the promise
    // unawaited is fine
  }
  return true
}
