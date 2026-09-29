import { configDefaults, defineConfig } from 'vitest/config'

/**
 * Kept separate from vite.config.ts, because the tests should run on plain Node
 * without the Cloudflare plugin (they target pure functions only).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // UI tests need jsdom and run under vitest.ui.config.ts
    exclude: [...configDefaults.exclude, 'src/**/*.ui.test.tsx'],
    coverage: {
      provider: 'v8',
      // Only src/lib, which has no side effects, is subject to the 100% gate.
      include: ['src/lib/**/*.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
})
