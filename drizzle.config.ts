import { defineConfig } from 'drizzle-kit'

/**
 * Config used only for generating migrations.
 * The generated SQL is applied to D1 with `wrangler d1 migrations apply`
 * (out points to the same place as migrations_dir in wrangler.jsonc).
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
})
