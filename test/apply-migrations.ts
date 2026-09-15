import { applyD1Migrations, env, type D1Migration } from 'cloudflare:test'

/**
 * TEST_MIGRATIONS はテスト設定（vitest.workers.config.ts）でだけ渡すバインディング。
 * 本番の Env には存在しないので、本番側の型に混ぜずにここで受け取る。
 */
const testEnv = env as unknown as { TEST_MIGRATIONS: D1Migration[] }

// 各テストファイルのストレージは分離されるので、その都度スキーマを作る
await applyD1Migrations(env.DB, testEnv.TEST_MIGRATIONS)
