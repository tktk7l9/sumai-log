import { defineConfig } from 'drizzle-kit'

/**
 * マイグレーション生成専用の設定。
 * 生成された SQL は `wrangler d1 migrations apply` で D1 に適用する
 * （wrangler.jsonc の migrations_dir と同じ場所を out に指定している）。
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
})
