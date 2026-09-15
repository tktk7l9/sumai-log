/**
 * サーバー層テスト用の空の Worker。
 *
 * wrangler.jsonc の main は TanStack Start のパッケージ内エントリを指しており、
 * テストランナーからは解決できない。テストで必要なのは D1 などのバインディングだけで
 * アプリ本体は要らないため、ここを入口に差し替える。
 */
export default {
  fetch(): Response {
    return new Response('test stub', { status: 404 })
  },
}
