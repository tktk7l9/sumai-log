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
import { fetchAllVendorNews } from './server/newsFetcher'

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

export default {
  fetch: workerFetch,
  scheduled: async (_controller: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runScheduledNewsFetch(env))
  },
} satisfies ExportedHandler<Env>
