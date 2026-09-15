import path from 'node:path'

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

/**
 * サーバー層のテスト。実際の Workers ランタイムと D1 の上で走らせる。
 *
 * 純粋関数は vitest.config.ts（素の Node）で見ているので、こちらは
 * 「本当に SQL が意図どおり動くか」だけを対象にする。
 */
export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(path.join(__dirname, 'drizzle/migrations'))
      return {
        wrangler: { configPath: './wrangler.jsonc' },
        // wrangler.jsonc の main は TanStack のパッケージ内エントリでテストからは解決できない
        main: './test/worker-stub.ts',
        miniflare: {
          // 本番のマイグレーションをそのまま適用してからテストする
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }
    }),
  ],
  test: {
    include: ['src/server/**/*.worker-test.ts'],
    setupFiles: ['./test/apply-migrations.ts'],
  },
})
