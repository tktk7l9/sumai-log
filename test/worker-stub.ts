/**
 * Empty Worker for the server-layer tests.
 *
 * main in wrangler.jsonc points to an entry inside the TanStack Start package, which the
 * test runner cannot resolve. The tests need only bindings such as D1 and not the app
 * itself, so the entry is swapped for this file.
 */
export default {
  fetch(): Response {
    return new Response('test stub', { status: 404 })
  },
}
