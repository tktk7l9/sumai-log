/**
 * The Worker entry. `main` in wrangler.jsonc points here.
 *
 * `fetch` uses the default TanStack Start handler as is (the same thing the default export of
 * `@tanstack/react-start/server-entry` builds internally: `createServerEntry({ fetch:
 * createStartHandler(defaultStreamHandler) })`. Previously `main` in wrangler.jsonc pointed
 * directly at the entry of that package, but adding Cron (`scheduled`) requires an entry file
 * of our own.
 *
 * `scheduled` fetches the vendor news every morning at 6 (JST. triggers.crons =
 * "0 21 * * *" in wrangler.jsonc) as design.md §1 says. It does not pass through
 * authentication, but it accepts no external input (only the D1 of env).
 */
import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'
import { drizzle } from 'drizzle-orm/d1'

import * as schema from './db/schema'
import { parseAllowlist } from './lib/access'
import { handleInboundMail } from './server/mailHandler'
import { fetchAllVendorNews } from './server/newsFetcher'
import { cleanupInboundMails } from './server/repository/mails'

// Named startFetch so as not to shadow the global fetch (this avoids calling the SSR handler
// by carelessly writing fetch(...) inside this module).
const startFetch = createStartHandler(defaultStreamHandler)
const entry = createServerEntry({ fetch: startFetch })

/**
 * The type of `entry.fetch` is `(request, opts?) => Promise<Response>` (`RequestHandler<Register>`
 * on the TanStack Start side), and the type of its 2nd argument differs from the Workers
 * `ExportedHandlerFetchHandler<Env>` (`(request, env, ctx) => ...`). Under `strictFunctionTypes`
 * these 2 are not treated as structurally compatible (the types of the 2nd argument are
 * unrelated), so an adapter is inserted that matches only the type to the Workers shape while
 * keeping the runtime behaviour (env/ctx are not used; bindings are read from the env of
 * `cloudflare:workers`) as is.
 */
const workerFetch: ExportedHandlerFetchHandler<Env> = (request) => entry.fetch(request)

/**
 * Called inside `ctx.waitUntil`. fetchAllVendorNews itself swallows the failure of 1 vendor,
 * but even in an unexpected case such as the DB connection itself failing, no exception is
 * thrown out of `scheduled` (nobody would catch it, and 1 more log line is enough).
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

/**
 * Cleanup of the inbound log (design 2026-09-19 §4): rejected and system rows are deleted after
 * 30 days. Imported and unassigned rows are kept
 */
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
 * Mail delivered to the forwarding address (secret MAIL_INBOX_ADDRESS) (Email Routing -> this
 * Worker). Design 2026-09-19 §3.
 * Exceptions are caught and turned into 1 log line (throwing causes a resend or bounce on the
 * Routing side).
 * The body and full addresses are never written to the log.
 */
async function onEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  const db = drizzle(env.DB, { schema })
  try {
    // Mail authorisation accepts, in addition to the login allowlist, the forwarding Gmail
    // addresses (secret MAIL_ALLOWED_SENDERS, comma separated). The address that can log in and
    // the address that receives newsletters may differ
    const allowlist = parseAllowlist(
      [env.ACCESS_ALLOWED_EMAILS, env.MAIL_ALLOWED_SENDERS].filter(Boolean).join(','),
    )
    const r = await handleInboundMail(message, db, allowlist)
    // The subject of system mail (Gmail forwarding address confirmation) contains the
    // confirmation code, so it is not written to the log
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
