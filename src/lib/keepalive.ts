export type FetchLike<R> = (input: RequestInfo | URL, init?: RequestInit) => R

/**
 * Wraps a fetch so that its requests carry `keepalive: true`.
 *
 * Deferred deletes (deferredDelete.ts) are sent from `pagehide` when the tab is reloaded or
 * closed inside the undo window. A plain request started there may be cancelled while the page
 * unloads (Safari on iPhone in particular), and the deleted item would then come back on the
 * next visit. A keepalive request is allowed to outlive the page.
 */
export function withKeepalive<R>(fetchImpl: FetchLike<R>): FetchLike<R> {
  return (input, init) => fetchImpl(input, { ...init, keepalive: true })
}
