import { defineConfig } from 'vitest/config'

/**
 * vite.config.ts とは別に持つ。テストは Cloudflare プラグインを噛ませず
 * 素の Node で走らせたいため（純粋関数のみを対象にしている）。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      // 副作用を持たない src/lib のみを 100% ゲートの対象にする。
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
