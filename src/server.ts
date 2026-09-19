/**
 * Worker のエントリ。wrangler.jsonc の `main` はここを指す。
 *
 * `fetch` は TanStack Start の既定ハンドラをそのまま使う（`@tanstack/react-start/server-entry`
 * の既定エクスポートが内部で組み立てているのと同じもの: `createServerEntry({ fetch:
 * createStartHandler(defaultStreamHandler) })`。以前は wrangler.jsonc の `main` から
 * そのパッケージのエントリを直接指していたが、Cron（`scheduled`）を足すには自前の
 * エントリファイルが要る。
 *
 * `scheduled` は design.md §1 のとおり毎朝 6 時（JST。wrangler.jsonc の
 * triggers.crons = "0 21 * * *"）に業者のお知らせを取得する。認証を通らないが
 * 外部入力は受けない（env の D1 だけ）。
 */
import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'
import { drizzle } from 'drizzle-orm/d1'

import * as schema from './db/schema'
import { parseAllowlist } from './lib/access'
import { handleInboundMail } from './server/mailHandler'
import { fetchAllVendorNews } from './server/newsFetcher'
import { cleanupInboundMails } from './server/repository/mails'

// グローバルの fetch を上書きしないよう startFetch と名付ける（このモジュール内で
// うっかり fetch(...) と書いたら SSR ハンドラを呼んでしまう、を避ける）。
const startFetch = createStartHandler(defaultStreamHandler)
const entry = createServerEntry({ fetch: startFetch })

/**
 * `entry.fetch` の型は `(request, opts?) => Promise<Response>`（TanStack Start 側の
 * `RequestHandler<Register>`）で、Workers の `ExportedHandlerFetchHandler<Env>`
 * （`(request, env, ctx) => ...`）とは第 2 引数の型が違う。`strictFunctionTypes` の下では
 * この 2 つは構造的に互換とは扱われない（第 2 引数の型が無関係なため）ため、実行時の
 * 挙動（env/ctx は使わず `cloudflare:workers` の env でバインディングを読む）はそのままに、
 * 型だけ Workers 側の形に合わせるアダプタを挟む。
 */
const workerFetch: ExportedHandlerFetchHandler<Env> = (request) => entry.fetch(request)

/**
 * `ctx.waitUntil` の中で呼ぶ。1 社の失敗は fetchAllVendorNews 自身が飲み込むが、
 * DB 接続そのものが失敗するような想定外のケースでも `scheduled` の外へは
 * 例外を投げない（投げても誰も拾わないうえ、ログの1行が増えるだけで良い）。
 */
async function runScheduledNewsFetch(env: Env): Promise<void> {
  try {
    const db = drizzle(env.DB, { schema })
    const results = await fetchAllVendorNews(db)
    const added = results.reduce((sum, r) => sum + r.added, 0)
    const errors = results.filter((r) => r.error !== null).length
    console.log(
      `news: scheduled fetch done vendors=${results.length} added=${added} errors=${errors}`,
    )
  } catch (e) {
    console.log(`news: scheduled fetch failed error=${e instanceof Error ? e.message : String(e)}`)
  }
}

/** 受信ログの掃除（設計 2026-09-19 §4）: 拒否・システム行は 30 日で消す。取込・未割当は残す */
const INBOUND_RETENTION_DAYS = 30
async function runInboundCleanup(env: Env): Promise<void> {
  try {
    const db = drizzle(env.DB, { schema })
    const cutoff = new Date(Date.now() - INBOUND_RETENTION_DAYS * 86400000).toISOString()
    const removed = await cleanupInboundMails(db, cutoff)
    console.log(`mail: cleanup removed=${removed}`)
  } catch (e) {
    console.log(`mail: cleanup failed error=${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * 転送先アドレス（secret MAIL_INBOX_ADDRESS）に届いたメール（Email Routing → この Worker）。
 * 設計 2026-09-19 §3。
 * 例外は捕まえてログ 1 行にする（投げると Routing 側で再送・バウンスになる）。
 * 本文・アドレス全体はログに出さない。
 */
async function onEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  const db = drizzle(env.DB, { schema })
  try {
    const r = await handleInboundMail(message, db, parseAllowlist(env.ACCESS_ALLOWED_EMAILS))
    // system（Gmail の転送先確認）の件名には確認コードが入るのでログには出さない
    const subject = r.status === 'system' ? '' : ` subject=${r.subject.slice(0, 40)}`
    console.log(`mail: ${r.status} domain=${r.fromDomain ?? '-'}${subject}`)
  } catch (e) {
    console.log(`mail: failed error=${e instanceof Error ? e.message : String(e)}`)
  }
}

export default {
  fetch: workerFetch,
  scheduled: async (_controller: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runScheduledNewsFetch(env).then(() => runInboundCleanup(env)))
  },
  email: onEmail,
} satisfies ExportedHandler<Env>
