/**
 * Zod without eval in the browser.
 *
 * The first object schema zod builds probes `new Function('')`, to decide whether to compile
 * faster parsers. In the browser that probe is an eval, which the script policy (no
 * 'unsafe-eval', src/lib/scriptNonce.ts) reports as a violation on every page, even though zod
 * swallows the error. A `z.config()` call in one of our modules comes too late: the bundler
 * runs the shared chunks before the entry, and the one with src/server/zod.ts builds a schema
 * as soon as it loads.
 *
 * Zod keeps its settings in `globalThis.__zod_globalConfig` and adopts an object that is
 * already there, so this script, emitted by `ScriptOnce` in the <head> of src/routes/__root.tsx,
 * switches it to jitless before any module script runs. Parsing gives the same results without
 * JIT. The Workers runtime never compiled (zod skips the Cloudflare user agent).
 */
export const ZOD_JITLESS_SCRIPT =
  'globalThis.__zod_globalConfig=Object.assign(globalThis.__zod_globalConfig||{},{jitless:true})'
