import path from 'node:path'

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

/**
 * Server-layer tests. They run on the real Workers runtime and D1.
 *
 * Pure functions are covered by vitest.config.ts (plain Node), so this one targets
 * only "does the SQL really work as intended".
 */
export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(path.join(__dirname, 'drizzle/migrations'))
      return {
        wrangler: { configPath: './wrangler.jsonc' },
        // main in wrangler.jsonc is an entry inside the TanStack package and cannot be
        // resolved from the tests
        main: './test/worker-stub.ts',
        miniflare: {
          // Apply the production migrations as they are, then test
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
