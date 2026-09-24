import { waitUntil } from 'cloudflare:workers'

import { getDb } from '../db/client'
import { shouldRecordSeen } from '../lib/usage'
import { writeLastSeen } from './repository'

/**
 * 利用者の「最後に使った日時」を settings（`lastSeen:<メール>`）に残す。
 *
 * 認証ミドルウェア（src/start.ts）が全リクエストで呼ぶ。応答を待たせないよう waitUntil に
 * 逃がし、同じ人は SEEN_INTERVAL_MS に 1 回しか書かない（isolate ごとのメモリで間引く。
 * isolate が入れ替わると初回扱いでもう一度書くだけで、害はない）。
 * ここで何が起きても本体のリクエストは失敗させない。
 */
const lastWritten = new Map<string, number>()

export function recordSeen(email: string, now: number = Date.now()): boolean {
  const key = email.trim().toLowerCase()
  if (key === '' || !shouldRecordSeen(lastWritten.get(key), now)) return false
  lastWritten.set(key, now)
  const write = writeLastSeen(getDb(), key, new Date(now).toISOString()).catch(() => {
    // 書けなかったら次のリクエストでやり直す
    lastWritten.delete(key)
  })
  try {
    waitUntil(write)
  } catch {
    // リクエストの文脈外（テストなど）では waitUntil が使えない。投げっぱなしでよい
  }
  return true
}
