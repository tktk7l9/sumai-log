# sumai-log Phase 1（土台・認証・候補・場所・地図）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 二人だけがログインでき、戸建て業者／マンション物件の候補と「場所」を登録し、行った場所を地図で見られる状態を本番（Cloudflare Workers）に出す。

**Architecture:** `kousan-admin`（`../kousan-admin`）を雛形に、認証・セキュリティヘッダ・CSRF・D1/Drizzle・vitest 二系統を流用し、アプリ固有部分を削ぎ落として作り直す。純粋関数は `src/lib/`（100% カバレッジ）、副作用は `src/server/`、DB は `src/db/`、UI は `src/components/` と `src/routes/`。スマホ優先のシェル（下タブ＋FAB＋全画面 Drawer）を Mantine AppShell で組む。

**Tech Stack:** TanStack Start + React 19 + Mantine v9 + Drizzle ORM (D1) + Leaflet 1.9 + Cloudflare Workers / D1 / R2 / Access + vitest 4（node と workers pool）+ Prettier + Keyway

**Spec:** `docs/superpowers/specs/2026-09-15-sumai-log-design.md`

## Global Constraints

- 雛形は `/Users/saitoutakuya/src/github.com/tktk7l9/kousan-admin`（以下 `kousan-admin/`）。「コピー」と書いたファイルは中身をそのまま持ってくる
- **PII をコード・テスト・seed・コメントに書かない**（メール・氏名・住所・座標・地番）。テストは `owner@example.com` `partner@example.com` `甲` `乙` `テスト市` など架空値。`npm run check:pii` をコミット前に通す
- リポジトリは **public**。二人のメールと `MEMBERS` は Worker の secret と `.dev.vars` にしか置かない
- `src/lib/` は純粋関数のみ（`cloudflare:workers`・fetch・`Date.now()` を持ち込まない）。`test:coverage` の 100% ゲート対象
- 日付は ISO-8601 の TEXT（日付のみは `YYYY-MM-DD`）、金額は円の整数、面積は小数、id は `text` で `crypto.randomUUID()`（仕様の「text id」の意図どおり。nanoid の依存は足さない）
- Prettier: `semi: false` `singleQuote: true` `printWidth: 100` `trailingComma: 'all'`
- UI の文言は日本語。`robots: noindex, nofollow, noarchive`
- `.gitignore` は `.dev.vars*` `!.dev.vars.example` `.env` `.env.*` `!.env*.example` を含む
- 写真の `accept` は `image/*` のみ（Phase 2 で使う。`image/heic` を書かない）
- 完了基準は各タスク末尾のコマンドに加え、最終的に `npm run format:check` `typecheck` `test:coverage` `test:server` `build` `check:pii` がすべて green
- Node はローカル 22.14 / CI 24。パッケージマネージャは npm（`package-lock.json` をコミット）
- コミットメッセージ末尾に `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`

---

### Task 1: リポジトリの土台（kousan-admin の複製と削ぎ落とし）

**Files:**
- Create: `package.json` `wrangler.jsonc` `.gitignore` `.dev.vars.example` `README.md` `AGENTS.md` `src/routes/__root.tsx` `src/routes/index.tsx` `src/styles.css` `src/theme.ts` `src/db/schema.ts` `src/components/AppLayout.tsx` `src/components/PageShell.tsx` `public/manifest.json`
- Copy from `kousan-admin/`: `.prettierrc` `tsconfig.json` `tsr.config.json` `postcss.config.cjs` `vite.config.ts` `vitest.config.ts` `vitest.workers.config.ts` `drizzle.config.ts` `.github/workflows/ci.yml` `.github/dependabot.yml` `.githooks/pre-commit` `test/worker-stub.ts` `test/apply-migrations.ts` `test/env.d.ts` `src/router.tsx` `src/start.ts` `src/server/auth.ts` `src/db/client.ts` `src/lib/access.ts` `src/lib/access.test.ts` `src/lib/csrf.ts` `src/lib/csrf.test.ts` `src/lib/securityHeaders.ts` `src/lib/securityHeaders.test.ts` `src/lib/nav.ts` `src/lib/nav.test.ts` `src/lib/dates.ts` `src/lib/dates.test.ts` `src/lib/holidays.ts` `src/lib/holidays.test.ts` `src/components/ErrorStates.tsx` `src/components/ColorSchemeToggle.tsx` `public/favicon.ico` `public/favicon.svg` `public/logo192.png` `public/logo512.png` `public/robots.txt`
- Copy and edit: `scripts/check-pii.mjs`（照合元を `.dev.vars` に変更）

**Interfaces:**
- Produces: `requireUser(request): Promise<Identity>`（`src/server/auth.ts`・そのまま）／`getDb()`（`src/db/client.ts`）／`PageShell({ title, description?, children })`／`AppLayout` はこのタスクでは仮（Task 5 で置換）

- [ ] **Step 1: 作業ディレクトリと雛形ファイルのコピー**

```bash
cd /Users/saitoutakuya/src/github.com/tktk7l9/sumai-log
K=/Users/saitoutakuya/src/github.com/tktk7l9/kousan-admin
mkdir -p .github/workflows .githooks test src/lib src/server src/db src/components src/routes public scripts drizzle
for f in .prettierrc tsconfig.json tsr.config.json postcss.config.cjs vite.config.ts vitest.config.ts vitest.workers.config.ts drizzle.config.ts .github/workflows/ci.yml .github/dependabot.yml .githooks/pre-commit test/worker-stub.ts test/apply-migrations.ts test/env.d.ts src/router.tsx src/start.ts src/server/auth.ts src/db/client.ts src/lib/access.ts src/lib/access.test.ts src/lib/csrf.ts src/lib/csrf.test.ts src/lib/securityHeaders.ts src/lib/securityHeaders.test.ts src/lib/nav.ts src/lib/nav.test.ts src/lib/dates.ts src/lib/dates.test.ts src/lib/holidays.ts src/lib/holidays.test.ts src/components/ErrorStates.tsx src/components/ColorSchemeToggle.tsx public/favicon.ico public/favicon.svg public/logo192.png public/logo512.png public/robots.txt scripts/check-pii.mjs; do cp "$K/$f" "$f"; done
chmod +x .githooks/pre-commit
```

- [ ] **Step 2: `package.json` を書く**（kousan-admin から不要な scripts を外し名前を変える。バージョンは kousan-admin の `package.json` と同じ値を使う）

```json
{
  "name": "sumai-log",
  "private": true,
  "type": "module",
  "imports": { "#/*": "./src/*" },
  "scripts": {
    "prepare": "git config core.hooksPath .githooks || true",
    "dev": "vite dev --port 3000",
    "generate-routes": "tsr generate",
    "build": "vite build",
    "preview": "npm run build && vite preview",
    "test": "vitest run && vitest run --config vitest.workers.config.ts",
    "test:coverage": "vitest run --coverage",
    "test:server": "vitest run --config vitest.workers.config.ts",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "check:pii": "node scripts/check-pii.mjs",
    "deploy": "npm run build && wrangler deploy",
    "cf-typegen": "wrangler types",
    "db:generate": "drizzle-kit generate",
    "db:migrate:local": "wrangler d1 migrations apply sumai-log --local",
    "db:migrate:remote": "wrangler d1 migrations apply sumai-log --remote",
    "db:export": "wrangler d1 export sumai-log --remote --output backups/sumai-log-$(date +%Y%m%d).sql"
  },
  "dependencies": {
    "@cloudflare/vite-plugin": "^1.54.5",
    "@mantine/core": "^9.6.0",
    "@mantine/dates": "^9.6.0",
    "@mantine/form": "^9.6.0",
    "@mantine/hooks": "^9.6.0",
    "@mantine/notifications": "^9.6.0",
    "@tanstack/react-router": "latest",
    "@tanstack/react-router-ssr-query": "latest",
    "@tanstack/react-start": "latest",
    "@tanstack/router-plugin": "^1.168.36",
    "dayjs": "^1.11.21",
    "drizzle-orm": "^0.45.2",
    "jose": "^6.2.12",
    "leaflet": "^1.9.4",
    "lucide-react": "^1.43.0",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.22.0",
    "@tanstack/devtools-vite": "latest",
    "@tanstack/router-cli": "^1.167.34",
    "@types/leaflet": "^1.9.21",
    "@types/node": "^26.5.0",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.0.1",
    "@vitest/coverage-v8": "^4.1.10",
    "drizzle-kit": "^0.31.10",
    "postcss": "^8.5.28",
    "postcss-preset-mantine": "^1.18.0",
    "postcss-simple-vars": "^7.0.1",
    "prettier": "^3.9.6",
    "typescript": "^7.0.2",
    "vite": "^8.0.0",
    "vitest": "^4.1.5",
    "wrangler": "^4.131.0"
  }
}
```

`kousan-admin/package.json` の `overrides`（undici / sharp / @esbuild-kit）は kousan-admin 固有の監査対応なので持ち込まない。`npm install` 後に `npm audit --audit-level=low` が落ちたらその時点で必要な override だけ足す。

- [ ] **Step 3: `wrangler.jsonc`**（database_id は Task 10 で本物に置き換える。それまでの値はローカル miniflare にしか使われない）

```jsonc
/**
 * sumai-log — Cloudflare Workers 設定
 * https://developers.cloudflare.com/workers/wrangler/configuration/
 */
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "sumai-log",
  "compatibility_date": "2026-09-15",
  "compatibility_flags": ["nodejs_compat"],
  "main": "@tanstack/react-start/server-entry",
  "observability": { "enabled": true },
  "upload_source_maps": true,

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "sumai-log",
      // Task 10 で `wrangler d1 create sumai-log` の出力に置き換える
      "database_id": "00000000-0000-0000-0000-000000000000",
      "migrations_dir": "drizzle/migrations",
    },
  ],

  /** 写真（Phase 2）。公開バケットにしない。配信は認証後に Worker 経由 */
  "r2_buckets": [{ "binding": "PHOTOS", "bucket_name": "sumai-log-photos" }],

  /**
   * 既定を production にして、設定漏れは必ず「拒否」側に倒す。
   * ACCESS_TEAM_DOMAIN / ACCESS_POLICY_AUD は非秘密（Task 10 で埋める）。
   * ACCESS_ALLOWED_EMAILS と MEMBERS は secret（`wrangler secret put`）。ここに書かない。
   */
  "vars": {
    "ENVIRONMENT": "production",
    "ACCESS_TEAM_DOMAIN": "",
    "ACCESS_POLICY_AUD": "",
  },
}
```

- [ ] **Step 4: `.gitignore` と `.dev.vars.example`**

```gitignore
node_modules
.DS_Store
dist
dist-ssr
*.local
.tanstack
.wrangler
.output
__unconfig*
coverage
/backups/

# 秘密・個人情報（Keyway が書き出す .env.* も含めて塞ぐ）
.dev.vars*
!.dev.vars.example
.env
.env.*
!.env*.example

# 実データ（見学先・写真・動画メモ）はコミットしない
seed.local.json
seed.local/

# サブエージェント駆動の作業ファイル
.superpowers/
```

```dotenv
# ローカル開発用。`.dev.vars` にコピーして使う（gitignore 済み）。
# Keyway を使う場合: keyway pull -e development -f .dev.vars -y
#
# ローカルには Cloudflare Access が無いため、ENVIRONMENT=development のときだけ
# DEV_IDENTITY_EMAIL を認証済み利用者として扱う。本番では必ず無効。

ENVIRONMENT=development
DEV_IDENTITY_EMAIL=owner@example.com
ACCESS_ALLOWED_EMAILS=owner@example.com,partner@example.com
# email:表示名:Mantineの色名 をカンマ区切り
MEMBERS=owner@example.com:甲:teal,partner@example.com:乙:pink

# 本番でのみ使う値（ローカルでは空でよい）
ACCESS_TEAM_DOMAIN=
ACCESS_POLICY_AUD=
```

- [ ] **Step 5: `scripts/check-pii.mjs` の照合元を `.dev.vars` にする**

コピーした `scripts/check-pii.mjs` の `seed.local.json` を読む部分（`const seedPath` から `const secrets = [...]` まで）を次に置き換える。以降の「追跡ファイルを走査して secrets を探す」部分はそのまま使う。

```js
const devVarsPath = resolve(root, '.dev.vars')

if (!existsSync(devVarsPath)) {
  console.log('.dev.vars が無いので照合できません（実データを持つ環境で実行してください）。')
  process.exit(0)
}

/**
 * 照合する語は .dev.vars から取り出す。二人のメールと表示名がそこにしか無いので、
 * 禁止語の一覧を別に作ってコミットする必要がない。
 *   ACCESS_ALLOWED_EMAILS=a@x,b@y   → a@x, b@y
 *   MEMBERS=a@x:名前:色,b@y:名前:色   → a@x, 名前, b@y, 名前
 */
function unquote(v) {
  return v.length >= 2 && v[0] === v[v.length - 1] && (v[0] === '"' || v[0] === "'")
    ? v.slice(1, -1)
    : v
}
const vars = Object.fromEntries(
  readFileSync(devVarsPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), unquote(l.slice(i + 1).trim())]
    }),
)
const MIN_LENGTH = 2
const secrets = new Set()
for (const email of (vars.ACCESS_ALLOWED_EMAILS ?? '').split(',')) {
  const v = email.trim().toLowerCase()
  if (v.length >= MIN_LENGTH && !v.endsWith('@example.com')) secrets.add(v)
}
for (const entry of (vars.MEMBERS ?? '').split(',')) {
  const [email, name] = entry.split(':').map((s) => s.trim())
  if (email && email.length >= MIN_LENGTH && !email.endsWith('@example.com')) secrets.add(email.toLowerCase())
  if (name && name.length >= MIN_LENGTH && !['甲', '乙'].includes(name)) secrets.add(name)
}
if (vars.DEV_IDENTITY_EMAIL && !vars.DEV_IDENTITY_EMAIL.endsWith('@example.com')) {
  secrets.add(vars.DEV_IDENTITY_EMAIL.trim().toLowerCase())
}
const secretList = [...secrets]
```

残りの走査部分で `secrets` を参照している箇所は `secretList` に読み替える（`SECRET_KEYS` `collectSecrets` `COMPANY_NAME` `IGNORABLE` `allowed` は削除）。`.dev.vars` 自体と `.dev.vars.example` は走査対象から除外されていること（`git ls-files` で追跡ファイルだけを見るので `.dev.vars` は元々入らない）。

- [ ] **Step 6: `src/db/schema.ts`（最小）・`src/theme.ts`・`src/styles.css`・`src/routes/__root.tsx`・`src/routes/index.tsx`・`src/components/PageShell.tsx`・`src/components/AppLayout.tsx`（仮）・`public/manifest.json`**

`src/db/schema.ts`（Task 2 で本体を足す。空だと drizzle-kit が落ちるので settings だけ先に置く）:

```ts
import { sql } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const timestamps = {
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
}

/** key-value の設定。`homeAreas` = 建築予定地の市区町村（JSON 配列） */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamps.updatedAt,
})
```

`src/theme.ts`（kousan-admin の大きめサイズを踏まえつつ色を変える。色の最終調整は Phase 3）:

```ts
import { createTheme } from '@mantine/core'

export const theme = createTheme({
  primaryColor: 'clay',
  colors: {
    // 暖色の中立パレット（テラコッタ寄り）。Phase 3 の frontend-design で磨く
    clay: [
      '#fbf3ef', '#f3e2da', '#e8c6b8', '#dca894', '#d28f74',
      '#cc7f5f', '#ca7654', '#b36445', '#a0583c', '#8c4a32',
    ],
  },
  defaultRadius: 'lg',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", "Yu Gothic", Meiryo, "Segoe UI", sans-serif',
  fontSizes: { xs: '0.8125rem', sm: '0.9375rem', md: '1.0625rem', lg: '1.1875rem', xl: '1.375rem' },
  lineHeights: { xs: '1.5', sm: '1.6', md: '1.7', lg: '1.7', xl: '1.6' },
  headings: {
    fontWeight: '700',
    sizes: {
      h1: { fontSize: '1.625rem', lineHeight: '1.4' },
      h2: { fontSize: '1.375rem', lineHeight: '1.45' },
      h3: { fontSize: '1.125rem', lineHeight: '1.5' },
    },
  },
  components: {
    TextInput: { defaultProps: { size: 'md' } },
    NumberInput: { defaultProps: { size: 'md' } },
    Textarea: { defaultProps: { size: 'md' } },
    Select: { defaultProps: { size: 'md' } },
    TagsInput: { defaultProps: { size: 'md' } },
    Button: { defaultProps: { size: 'md' } },
  },
})
```

`src/styles.css`:

```css
:root {
  color-scheme: light dark;
}

.breakable {
  overflow-wrap: anywhere;
}

/* 下タブ（AppShell.Footer）はホームインジケータの分だけ底上げする */
.tabbar {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

/* Leaflet の地図。高さは親が決める */
.places-map {
  width: 100%;
  height: 100%;
}
```

`src/routes/__root.tsx`（kousan-admin の同名ファイルをもとに、title と viewport を変える）:

```tsx
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { Notifications } from '@mantine/notifications'
import 'dayjs/locale/ja'

import { AppLayout } from '../components/AppLayout'
import { RouteErrorState, RouteNotFoundState } from '../components/ErrorStates'
import { theme } from '../theme'

import mantineCoreCss from '@mantine/core/styles.css?url'
import mantineDatesCss from '@mantine/dates/styles.css?url'
import mantineNotificationsCss from '@mantine/notifications/styles.css?url'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { name: 'robots', content: 'noindex, nofollow, noarchive' },
      { name: 'theme-color', content: '#ca7654' },
      { title: '住まいログ' },
    ],
    links: [
      { rel: 'stylesheet', href: mantineCoreCss },
      { rel: 'stylesheet', href: mantineDatesCss },
      { rel: 'stylesheet', href: mantineNotificationsCss },
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'apple-touch-icon', href: '/logo192.png' },
      { rel: 'manifest', href: '/manifest.json' },
    ],
  }),
  shellComponent: RootDocument,
  errorComponent: ({ error }) => <RouteErrorState error={error} />,
  notFoundComponent: RouteNotFoundState,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
        <HeadContent />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="auto">
          <DatesProvider settings={{ locale: 'ja', firstDayOfWeek: 0 }}>
            <Notifications position="top-center" />
            <AppLayout>{children}</AppLayout>
          </DatesProvider>
        </MantineProvider>
        <Scripts />
      </body>
    </html>
  )
}
```

`src/components/ErrorStates.tsx` のコピーで「ダッシュボードへ」を「ホームへ」に直す。

`src/components/PageShell.tsx`（kousan-admin と同じだが `Container size="sm"`）:

```tsx
import { Container, Stack, Text, Title } from '@mantine/core'

export function PageShell({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: React.ReactNode
  /** 見出しの右に置く操作（デスクトップ用。スマホは FAB を使う） */
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <Container size="sm" px={0}>
      <Stack gap="lg">
        <Stack gap={4}>
          <Title order={1}>{title}</Title>
          {description ? (
            <Text c="dimmed" size="sm">
              {description}
            </Text>
          ) : null}
          {actions}
        </Stack>
        {children}
      </Stack>
    </Container>
  )
}
```

`src/components/AppLayout.tsx`（Task 5 で置換する仮実装。子をそのまま出す）:

```tsx
import { AppShell } from '@mantine/core'

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell padding="md">
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  )
}
```

`src/routes/index.tsx`（仮のホーム。Phase 3 でフィードにする）:

```tsx
import { Text } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'

import { PageShell } from '../components/PageShell'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <PageShell title="住まいログ" description="二人の家探しの記録">
      <Text c="dimmed">まだ何もありません。「候補」から業者や物件を登録してください。</Text>
    </PageShell>
  )
}
```

`public/manifest.json`:

```json
{
  "short_name": "住まいログ",
  "name": "住まいログ",
  "icons": [
    { "src": "favicon.svg", "type": "image/svg+xml", "sizes": "any" },
    { "src": "logo192.png", "type": "image/png", "sizes": "192x192" },
    { "src": "logo512.png", "type": "image/png", "sizes": "512x512" }
  ],
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#ca7654",
  "background_color": "#fbf3ef"
}
```

- [ ] **Step 7: `README.md` と `AGENTS.md`**

`AGENTS.md`（kousan-admin の構成を踏襲。約束はこの 5 つ）:

```markdown
# sumai-log — エージェント向け指示

夫婦二人だけが使う住まい検討の記録アプリ。**リポジトリは public**、データは D1 / R2 にしか無い。

## 絶対に守ること

1. **PII をコミットしない。** 二人のメール・表示名・見学先の実データ・住所・座標を
   コード／テスト／seed／コメント／ドキュメントに書かない。テストは `owner@example.com` `甲` `乙`
   `テスト市` などの架空値。コミット前に `npm run check:pii`（照合元は gitignore 済みの `.dev.vars`）。
2. **R2 バケットを公開設定にしない。** 配信は必ず認証後に Worker 経由でストリームする。
3. **認証を迂回できる経路を足さない。** 判定は `src/lib/access.ts` に集約し、
   `src/start.ts` のグローバルミドルウェアで全リクエストに適用する。fail closed。
4. **秘密は `.dev.vars`（ローカル）と `wrangler secret`（本番）だけ。** `wrangler.jsonc` の `vars` に
   メールを書かない。Keyway は `keyway pull -e development -f .dev.vars -y`（`keyway run` は wrangler に効かない）。
5. **`src/lib/` は純粋関数のみ。** カバレッジ 100% ゲートの対象。

## 設計の約束

- 副作用は `src/server/`、DB は `src/db/`、UI は `src/components/` と `src/routes/`
- 日付は TEXT の ISO-8601、金額は円の整数、面積は小数、id は text（`crypto.randomUUID()`）
- スマホ優先。下タブ＋FAB＋全画面 Drawer。デスクトップは左ナビ
- 地図に出せない場所は「出せない理由」を画面に書く（空の枠を出さない）

## スキーマを変えたら

```bash
npm run db:generate
npm run db:migrate:local
npm run cf-typegen   # バインディングや vars を増やしたとき
```

## 完了の基準

`npm run format:check` `typecheck` `test:coverage` `test:server` `build` `check:pii` がすべて green。
認証に触れたら拒否側（JWT なし／署名不正／allowlist 外／本番での dev 経路）で 403 を確認する。

## 参照

仕様: `docs/superpowers/specs/2026-09-15-sumai-log-design.md`
```

`README.md` は「何のアプリか（1段落）／技術構成の表／セットアップ（`npm install` → `.dev.vars` → `npm run db:migrate:local` → `npm run dev`）／本番（Task 10 の手順）」を kousan-admin の README の構成で書く。実名・メールは書かない。

- [ ] **Step 8: インストール・生成物・検証**

```bash
cd /Users/saitoutakuya/src/github.com/tktk7l9/sumai-log
cp .dev.vars.example .dev.vars
npm install
npm run cf-typegen
npm run generate-routes
npm run db:generate -- --name init_settings
npm run db:migrate:local
npm run format
npm run typecheck
npm run test:coverage
npm run test:server
npm run build
npm run check:pii
git check-ignore -q .dev.vars .env.production && echo ignored
```

Expected: すべて成功。`test:coverage` は lib の既存テストで 100%。`test:server` は対象ファイル無しで 0 件成功（vitest は `passWithNoTests` が無いと失敗するので、`vitest.workers.config.ts` の `test` に `passWithNoTests: true` を足す）。

- [ ] **Step 9: 動作確認（dev サーバー）**

```bash
npm run dev &
sleep 8
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/          # 200（.dev.vars の dev 経路）
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/  # 403（Origin なしの変更系）
kill %1
```

- [ ] **Step 10: コミットと GitHub リポジトリ（public）**

```bash
git add -A
git commit -m "chore: kousan-admin を雛形に土台を作成（認証・CI・vitest 二系統・Mantine）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
gh repo create tktk7l9/sumai-log --public --source=. --remote=origin --push \
  --description "夫婦で共有する住まい検討ノート（TanStack Start on Cloudflare Workers）"
```

CI が green になることを `gh run watch` で確認する。

---

### Task 2: スキーマ（全テーブル）とマイグレーション

Phase 2/3 のテーブル（events / visits / photos / videos / comments / tags）もここで一度に作る。実データの取り込み（Task 11）が予定・見学記録・動画まで含むため、マイグレーションを分けない。

**Files:**
- Create: `src/lib/status.ts` `src/lib/status.test.ts`
- Modify: `src/db/schema.ts`（Task 1 の settings に追記）
- Create: `src/server/schema.worker-test.ts`
- Generate: `drizzle/migrations/0001_*.sql`（`npm run db:generate -- --name init_tables`）

**Interfaces:**
- Produces: Drizzle テーブル `settings` `vendors` `properties` `places` `events` `visits` `photos` `videos` `comments` `tags` `geocodeCache`、定数 `VENDOR_KINDS` `PLACE_KINDS` `EVENT_KINDS` `ATTENDEES` `GEOCODE_SOURCES` `COMMENT_TARGETS`、型 `Vendor` `Property` `Place` `Event` `Visit` `Photo` `Video` `Comment` `Tag`（`$inferSelect`）と `NewVendor` 等（`$inferInsert`）
- Produces: `CANDIDATE_STATUSES` `CandidateStatus` `STATUS_LABEL` `STATUS_COLOR` `statusRank(status)`（`src/lib/status.ts`）

- [ ] **Step 1: `src/lib/status.test.ts` を書く**

```ts
import { describe, expect, it } from 'vitest'

import { CANDIDATE_STATUSES, STATUS_COLOR, STATUS_LABEL, statusRank } from './status'

describe('status', () => {
  it('5 つの状態に日本語ラベルと色がある', () => {
    expect(CANDIDATE_STATUSES).toEqual([
      'shortlisted',
      'consulting',
      'visited',
      'interested',
      'dropped',
    ])
    for (const s of CANDIDATE_STATUSES) {
      expect(STATUS_LABEL[s]).toMatch(/^[^\s]+$/)
      expect(STATUS_COLOR[s]).toMatch(/^[a-z]+$/)
    }
  })

  it('本命が先・見送りが最後に並ぶ', () => {
    expect(statusRank('shortlisted')).toBeLessThan(statusRank('interested'))
    expect(statusRank('interested')).toBeLessThan(statusRank('dropped'))
  })
})
```

- [ ] **Step 2: 失敗を確認** — `npx vitest run src/lib/status.test.ts` → FAIL（module not found）

- [ ] **Step 3: `src/lib/status.ts`**

```ts
/** 候補（業者・マンション物件）の状態。並びは一覧の表示順でもある */
export const CANDIDATE_STATUSES = [
  'shortlisted',
  'consulting',
  'visited',
  'interested',
  'dropped',
] as const

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number]

export const STATUS_LABEL: Record<CandidateStatus, string> = {
  shortlisted: '本命',
  consulting: '相談中',
  visited: '見学済',
  interested: '気になる',
  dropped: '見送り',
}

export const STATUS_COLOR: Record<CandidateStatus, string> = {
  shortlisted: 'clay',
  consulting: 'orange',
  visited: 'teal',
  interested: 'blue',
  dropped: 'gray',
}

export function statusRank(status: CandidateStatus): number {
  return CANDIDATE_STATUSES.indexOf(status)
}
```

- [ ] **Step 4: テストが通ることを確認** — `npx vitest run src/lib/status.test.ts` → PASS

- [ ] **Step 5: `src/db/schema.ts` を全テーブルに拡張**

```ts
import { sql } from 'drizzle-orm'
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { CANDIDATE_STATUSES } from '../lib/status'

/**
 * 方針: 日付は TEXT の ISO-8601（日付のみ 'YYYY-MM-DD'）、金額は円の整数、
 * 面積は小数。id は text（crypto.randomUUID()）。作成者はメール。
 */
export const timestamps = {
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
}

const id = () => text('id').primaryKey()
const createdBy = () => text('created_by').notNull()
const jsonList = (name: string) =>
  text(name, { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`)

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamps.updatedAt,
})

export const VENDOR_KINDS = ['hm', 'koumuten', 'sekkei', 'developer'] as const
export const VENDOR_KIND_LABEL: Record<(typeof VENDOR_KINDS)[number], string> = {
  hm: 'ハウスメーカー',
  koumuten: '工務店',
  sekkei: '設計事務所',
  developer: 'デベロッパー',
}

/** 戸建ての業者 */
export const vendors = sqliteTable(
  'vendors',
  {
    id: id(),
    name: text('name').notNull(),
    kind: text('kind', { enum: VENDOR_KINDS }).notNull().default('koumuten'),
    hq: text('hq'),
    /** 施工エリア（市区町村名の配列）。設定の homeAreas と照合する */
    serviceAreas: jsonList('service_areas'),
    uaValue: real('ua_value'),
    cValuePublished: integer('c_value_published', { mode: 'boolean' }).notNull().default(false),
    seismicGrade: integer('seismic_grade'),
    longTermCertified: integer('long_term_certified', { mode: 'boolean' }).notNull().default(false),
    /** 坪単価の目安（万円） */
    pricePerTsuboMin: integer('price_per_tsubo_min'),
    pricePerTsuboMax: integer('price_per_tsubo_max'),
    structure: text('structure'),
    features: text('features'),
    status: text('status', { enum: CANDIDATE_STATUSES }).notNull().default('interested'),
    sourceUrl: text('source_url'),
    websiteUrl: text('website_url'),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index('vendors_status_idx').on(t.status)],
)

/** マンション物件 */
export const properties = sqliteTable(
  'properties',
  {
    id: id(),
    name: text('name').notNull(),
    address: text('address'),
    station: text('station'),
    walkMinutes: integer('walk_minutes'),
    /** 価格（円） */
    price: integer('price'),
    areaSqm: real('area_sqm'),
    layout: text('layout'),
    builtYear: integer('built_year'),
    completionDate: text('completion_date'),
    /** 月額（円） */
    managementFee: integer('management_fee'),
    repairReserve: integer('repair_reserve'),
    listingUrl: text('listing_url'),
    note: text('note'),
    status: text('status', { enum: CANDIDATE_STATUSES }).notNull().default('interested'),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index('properties_status_idx').on(t.status)],
)

export const PLACE_KINDS = ['showroom', 'model_house', 'open_house', 'gallery', 'site', 'other'] as const
export const PLACE_KIND_LABEL: Record<(typeof PLACE_KINDS)[number], string> = {
  showroom: '住宅展示場',
  model_house: 'モデルハウス',
  open_house: '完成見学会',
  gallery: 'マンションギャラリー',
  site: '物件現地',
  other: 'その他',
}
export const GEOCODE_SOURCES = ['gsi', 'manual'] as const

/** 場所。地図の単位。業者か物件のどちらかに紐づく（どちらも無くてもよい） */
export const places = sqliteTable(
  'places',
  {
    id: id(),
    name: text('name').notNull(),
    kind: text('kind', { enum: PLACE_KINDS }).notNull().default('other'),
    address: text('address'),
    lat: real('lat'),
    lng: real('lng'),
    /** 手貼りした座標の元の表記。変換後の値と突き合わせるために残す */
    coordsText: text('coords_text'),
    geocodeSource: text('geocode_source', { enum: GEOCODE_SOURCES }),
    vendorId: text('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    propertyId: text('property_id').references(() => properties.id, { onDelete: 'set null' }),
    note: text('note'),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index('places_vendor_idx').on(t.vendorId), index('places_property_idx').on(t.propertyId)],
)

export const EVENT_KINDS = ['visit', 'meeting', 'viewing', 'other'] as const
export const EVENT_KIND_LABEL: Record<(typeof EVENT_KINDS)[number], string> = {
  visit: '見学',
  meeting: '打合せ',
  viewing: '内覧',
  other: 'その他',
}

/** 予定。終日なら startsAt は 'YYYY-MM-DD'、それ以外は ISO-8601（+09:00） */
export const events = sqliteTable(
  'events',
  {
    id: id(),
    title: text('title').notNull(),
    kind: text('kind', { enum: EVENT_KINDS }).notNull().default('visit'),
    startsAt: text('starts_at').notNull(),
    endsAt: text('ends_at'),
    allDay: integer('all_day', { mode: 'boolean' }).notNull().default(false),
    placeId: text('place_id').references(() => places.id, { onDelete: 'set null' }),
    vendorId: text('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    propertyId: text('property_id').references(() => properties.id, { onDelete: 'set null' }),
    note: text('note'),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index('events_starts_idx').on(t.startsAt)],
)

export const ATTENDEES = ['both', 'husband', 'wife'] as const
export const ATTENDEES_LABEL: Record<(typeof ATTENDEES)[number], string> = {
  both: '二人',
  husband: '夫',
  wife: '妻',
}

/** 見学記録 */
export const visits = sqliteTable(
  'visits',
  {
    id: id(),
    eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
    placeId: text('place_id').references(() => places.id, { onDelete: 'set null' }),
    vendorId: text('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    propertyId: text('property_id').references(() => properties.id, { onDelete: 'set null' }),
    visitedOn: text('visited_on').notNull(),
    attendees: text('attendees', { enum: ATTENDEES }).notNull().default('both'),
    good: text('good'),
    concerns: text('concerns'),
    qa: text('qa'),
    nextActions: text('next_actions'),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index('visits_visited_idx').on(t.visitedOn), index('visits_event_idx').on(t.eventId)],
)

/** 写真。R2 のキーは photos/{visitId}/{photoId}-display.jpg / -thumb.jpg */
export const photos = sqliteTable(
  'photos',
  {
    id: id(),
    visitId: text('visit_id')
      .notNull()
      .references(() => visits.id, { onDelete: 'cascade' }),
    displayKey: text('display_key').notNull(),
    thumbKey: text('thumb_key').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    caption: text('caption'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index('photos_visit_idx').on(t.visitId)],
)

/** YouTube メモ */
export const videos = sqliteTable(
  'videos',
  {
    id: id(),
    url: text('url').notNull(),
    videoId: text('video_id').notNull(),
    title: text('title').notNull(),
    channel: text('channel'),
    thumbnailUrl: text('thumbnail_url'),
    watchedOn: text('watched_on'),
    watchedBy: text('watched_by', { enum: ATTENDEES }).notNull().default('both'),
    tags: jsonList('tags'),
    takeaways: text('takeaways'),
    vendorId: text('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index('videos_watched_idx').on(t.watchedOn)],
)

export const COMMENT_TARGETS = ['vendor', 'property', 'place', 'visit', 'video'] as const

/** どの記録にも二人が一言足せる。targetId は外部キーではない（消すときは server 側で掃除する） */
export const comments = sqliteTable(
  'comments',
  {
    id: id(),
    targetType: text('target_type', { enum: COMMENT_TARGETS }).notNull(),
    targetId: text('target_id').notNull(),
    body: text('body').notNull(),
    createdBy: createdBy(),
    ...timestamps,
  },
  (t) => [index('comments_target_idx').on(t.targetType, t.targetId)],
)

export const tags = sqliteTable('tags', {
  id: id(),
  name: text('name').notNull().unique(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
})

export const DEFAULT_TAGS = [
  '断熱',
  '気密',
  '耐震',
  '間取り',
  '資金',
  'ローン',
  '土地',
  'マンション',
  '管理',
  '設備',
  '外構',
] as const

/** 国土地理院 住所検索 API の結果。同じ文字列を二度引かない */
export const geocodeCache = sqliteTable('geocode_cache', {
  query: text('query').primaryKey(),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  title: text('title'),
  fetchedAt: text('fetched_at')
    .notNull()
    .default(sql`(datetime('now'))`),
})

export type Vendor = typeof vendors.$inferSelect
export type NewVendor = typeof vendors.$inferInsert
export type Property = typeof properties.$inferSelect
export type NewProperty = typeof properties.$inferInsert
export type Place = typeof places.$inferSelect
export type NewPlace = typeof places.$inferInsert
export type Event = typeof events.$inferSelect
export type NewEvent = typeof events.$inferInsert
export type Visit = typeof visits.$inferSelect
export type NewVisit = typeof visits.$inferInsert
export type Photo = typeof photos.$inferSelect
export type NewPhoto = typeof photos.$inferInsert
export type Video = typeof videos.$inferSelect
export type NewVideo = typeof videos.$inferInsert
export type Comment = typeof comments.$inferSelect
export type Tag = typeof tags.$inferSelect
```

- [ ] **Step 6: マイグレーション生成と適用**

```bash
npm run db:generate -- --name init_tables
npm run db:migrate:local
ls drizzle/migrations
```

Expected: `0000_init_settings.sql` と `0001_init_tables.sql`（名前は drizzle-kit が付ける。CREATE TABLE が 11 本）。

- [ ] **Step 7: `src/server/schema.worker-test.ts`（実 D1 でスキーマが動くことの煙テスト）**

```ts
import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import * as schema from '../db/schema'
import { places, vendors } from '../db/schema'

const db = drizzle(env.DB, { schema })

describe('schema', () => {
  it('業者を登録し、施工エリアが JSON 配列で往復する', async () => {
    const id = crypto.randomUUID()
    await db.insert(vendors).values({
      id,
      name: '甲工務店',
      kind: 'koumuten',
      serviceAreas: ['テスト市', '架空町'],
      createdBy: 'owner@example.com',
    })
    const [row] = await db.select().from(vendors).where(eq(vendors.id, id))
    expect(row.serviceAreas).toEqual(['テスト市', '架空町'])
    expect(row.status).toBe('interested')
  })

  it('業者を消すと場所の vendorId は null になる（場所は残る）', async () => {
    const vendorId = crypto.randomUUID()
    const placeId = crypto.randomUUID()
    await db.insert(vendors).values({ id: vendorId, name: '乙建設', createdBy: 'owner@example.com' })
    await db.insert(places).values({
      id: placeId,
      name: 'テスト展示場',
      kind: 'showroom',
      vendorId,
      createdBy: 'owner@example.com',
    })
    await db.delete(vendors).where(eq(vendors.id, vendorId))
    const [place] = await db.select().from(places).where(eq(places.id, placeId))
    expect(place).toBeDefined()
    expect(place.vendorId).toBeNull()
  })
})
```

`vitest.workers.config.ts` の `include` は `src/server/**/*.worker-test.ts` なので拾われる。D1 で外部キーの `ON DELETE SET NULL` を効かせるには `PRAGMA foreign_keys` が既定で ON（D1 は ON）。

- [ ] **Step 8: 検証とコミット**

```bash
npm run typecheck && npm run test:coverage && npm run test:server && npm run format:check
git add -A
git commit -m "feat(db): 全テーブルのスキーマとマイグレーション（vendors/properties/places/events/visits/photos/videos/comments/tags/geocode_cache）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: lib の純粋関数（members / serviceArea / coords / geocode）

**Files:**
- Create: `src/lib/members.ts` `src/lib/members.test.ts` `src/lib/serviceArea.ts` `src/lib/serviceArea.test.ts` `src/lib/coords.ts` `src/lib/coords.test.ts` `src/lib/geocode.ts` `src/lib/geocode.test.ts`

**Interfaces:**
- Produces:
  - `parseMembers(raw: string | null | undefined): Member[]`／`findMember(members: Member[], email: string): Member`／`type Member = { email: string; displayName: string; color: string }`／`MEMBER_COLORS`
  - `parseAreaList(raw: string): string[]`／`normalizeArea(s: string): string`／`areaCovers(serviceArea: string, homeArea: string): boolean`／`matchesHomeAreas(serviceAreas: readonly string[], homeAreas: readonly string[]): boolean`
  - `parseCoordinate(value): LatLng | null`／`formatLatLng(p): string`／`type LatLng = { lat: number; lng: number }`（kousan-admin `src/lib/maps.ts` から移植）
  - `normalizeAddress(s: string): string`／`buildGsiUrl(query: string): string`／`parseGsiResponse(json: unknown): { lat: number; lng: number; title: string | null } | null`

- [ ] **Step 1: `src/lib/members.test.ts`**

```ts
import { describe, expect, it } from 'vitest'

import { MEMBER_COLORS, findMember, parseMembers } from './members'

describe('parseMembers', () => {
  it('email:表示名:色 をカンマ区切りで読む（メールは小文字化・空白除去）', () => {
    expect(parseMembers(' Owner@Example.com : 甲 : teal , partner@example.com:乙:pink')).toEqual([
      { email: 'owner@example.com', displayName: '甲', color: 'teal' },
      { email: 'partner@example.com', displayName: '乙', color: 'pink' },
    ])
  })

  it('色が未知なら gray、表示名が無ければメールのローカル部', () => {
    expect(parseMembers('owner@example.com::hotpink')).toEqual([
      { email: 'owner@example.com', displayName: 'owner', color: 'gray' },
    ])
  })

  it('空・不正な項目は無視し、同じメールは先勝ち', () => {
    expect(parseMembers('')).toEqual([])
    expect(parseMembers(undefined)).toEqual([])
    expect(parseMembers(',,not-an-email:x:teal,owner@example.com:甲:teal,owner@example.com:丙:pink')).toEqual([
      { email: 'owner@example.com', displayName: '甲', color: 'teal' },
    ])
  })
})

describe('findMember', () => {
  const members = parseMembers('owner@example.com:甲:teal')
  it('登録済みならその人', () => {
    expect(findMember(members, 'OWNER@example.com')).toEqual({
      email: 'owner@example.com',
      displayName: '甲',
      color: 'teal',
    })
  })
  it('未登録ならメールのローカル部と gray で仮の人を返す', () => {
    expect(findMember(members, 'someone@example.com')).toEqual({
      email: 'someone@example.com',
      displayName: 'someone',
      color: 'gray',
    })
  })
  it('色の候補は Mantine の色名', () => {
    expect(MEMBER_COLORS).toContain('teal')
  })
})
```

- [ ] **Step 2: 失敗確認** — `npx vitest run src/lib/members.test.ts` → FAIL

- [ ] **Step 3: `src/lib/members.ts`**

```ts
/**
 * 利用者の表示名と色。認証は Cloudflare Access が行い、ここは
 * secret `MEMBERS`（"email:表示名:色,..."）を読むだけ。DB には持たない。
 */
export type Member = { email: string; displayName: string; color: string }

export const MEMBER_COLORS = [
  'teal',
  'pink',
  'blue',
  'orange',
  'grape',
  'lime',
  'cyan',
  'indigo',
  'red',
  'yellow',
  'violet',
  'green',
  'gray',
  'clay',
] as const

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function localPart(email: string): string {
  return email.slice(0, email.indexOf('@'))
}

export function parseMembers(raw: string | null | undefined): Member[] {
  if (!raw) return []
  const seen = new Set<string>()
  const members: Member[] = []
  for (const entry of raw.split(',')) {
    const [rawEmail = '', rawName = '', rawColor = ''] = entry.split(':').map((s) => s.trim())
    const email = rawEmail.toLowerCase()
    if (!EMAIL.test(email) || seen.has(email)) continue
    seen.add(email)
    const color = (MEMBER_COLORS as readonly string[]).includes(rawColor) ? rawColor : 'gray'
    members.push({ email, displayName: rawName || localPart(email), color })
  }
  return members
}

export function findMember(members: readonly Member[], email: string): Member {
  const key = email.trim().toLowerCase()
  return (
    members.find((m) => m.email === key) ?? { email: key, displayName: localPart(key), color: 'gray' }
  )
}
```

- [ ] **Step 4: 通過確認** — `npx vitest run src/lib/members.test.ts` → PASS

- [ ] **Step 5: `src/lib/serviceArea.test.ts`**

```ts
import { describe, expect, it } from 'vitest'

import { areaCovers, matchesHomeAreas, normalizeArea, parseAreaList } from './serviceArea'

describe('parseAreaList', () => {
  it('読点・カンマ・改行・空白で分け、重複と空を除く', () => {
    expect(parseAreaList('テスト市、架空町, 仮想区\n テスト市 ')).toEqual([
      'テスト市',
      '架空町',
      '仮想区',
    ])
  })
})

describe('normalizeArea', () => {
  it('全角英数と空白を正規化し、末尾の「全域」「エリア」を落とす', () => {
    expect(normalizeArea(' 仮想県 全域 ')).toBe('仮想県')
    expect(normalizeArea('テスト市エリア')).toBe('テスト市')
    expect(normalizeArea('ＡＢＣ市')).toBe('ABC市')
  })
})

describe('areaCovers', () => {
  it('同じ名前・県名が前置された名前・県だけの指定を「含む」とみなす', () => {
    expect(areaCovers('テスト市', 'テスト市')).toBe(true)
    expect(areaCovers('テスト市', '仮想県テスト市')).toBe(true)
    expect(areaCovers('仮想県', '仮想県テスト市')).toBe(true)
    expect(areaCovers('仮想県全域', '仮想県テスト市')).toBe(true)
  })
  it('全国は何でも含む。別の市は含まない', () => {
    expect(areaCovers('全国', 'テスト市')).toBe(true)
    expect(areaCovers('架空市', 'テスト市')).toBe(false)
    expect(areaCovers('', 'テスト市')).toBe(false)
  })
})

describe('matchesHomeAreas', () => {
  it('施工エリアのどれかが建築予定地のどれかを含めば true', () => {
    expect(matchesHomeAreas(['架空市', 'テスト市'], ['テスト市'])).toBe(true)
    expect(matchesHomeAreas(['架空市'], ['テスト市', '仮想区'])).toBe(false)
    expect(matchesHomeAreas([], ['テスト市'])).toBe(false)
    expect(matchesHomeAreas(['テスト市'], [])).toBe(false)
  })
})
```

- [ ] **Step 6: 失敗確認** — `npx vitest run src/lib/serviceArea.test.ts` → FAIL

- [ ] **Step 7: `src/lib/serviceArea.ts`**

```ts
/**
 * 施工エリアの判定。値は人が自由に書く（「テスト市」「神奈川県」「関東」「全国」）ので、
 * 厳密な住所コードではなく文字列の包含で「含みそうか」を見る。
 */

export function parseAreaList(raw: string): string[] {
  const seen = new Set<string>()
  for (const part of raw.split(/[,、\n\s]+/)) {
    const v = part.trim()
    if (v) seen.add(v)
  }
  return [...seen]
}

export function normalizeArea(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/(全域|エリア|一円)$/u, '')
}

export function areaCovers(serviceArea: string, homeArea: string): boolean {
  const s = normalizeArea(serviceArea)
  const h = normalizeArea(homeArea)
  if (!s || !h) return false
  if (s === '全国') return true
  return h === s || h.startsWith(s) || h.endsWith(s)
}

export function matchesHomeAreas(
  serviceAreas: readonly string[],
  homeAreas: readonly string[],
): boolean {
  return serviceAreas.some((s) => homeAreas.some((h) => areaCovers(s, h)))
}
```

- [ ] **Step 8: 通過確認** — PASS

- [ ] **Step 9: `src/lib/coords.ts` と `src/lib/coords.test.ts`**

`kousan-admin/src/lib/maps.ts` から `LatLng` `parseCoordinate` `formatLatLng`（とその private の `DMS` `DECIMAL` `inRange`）だけを `src/lib/coords.ts` に移す（Google Maps の URL 系は持ってこない）。テストは `kousan-admin/src/lib/maps.test.ts` の `parseCoordinate` / `formatLatLng` の describe をそのまま `coords.test.ts` に移す（`googleMapsSearchUrl` / `resolveMapLocation` の describe は捨てる）。テスト内の座標値は kousan-admin のものが実在地を指すなら `35.000000, 139.000000` のような丸い値に置き換える。

- [ ] **Step 10: 通過確認** — `npx vitest run src/lib/coords.test.ts` → PASS

- [ ] **Step 11: `src/lib/geocode.test.ts`**

```ts
import { describe, expect, it } from 'vitest'

import { buildGsiUrl, normalizeAddress, parseGsiResponse } from './geocode'

describe('normalizeAddress', () => {
  it('全角英数を半角に、空白を除き、丁目・番地の表記ゆれを揃える', () => {
    expect(normalizeAddress(' 仮想県 テスト市 １－２－３ ')).toBe('仮想県テスト市1-2-3')
    expect(normalizeAddress('仮想県テスト市1丁目2番3号')).toBe('仮想県テスト市1-2-3')
    expect(normalizeAddress('仮想県テスト市1丁目')).toBe('仮想県テスト市1丁目')
  })
})

describe('buildGsiUrl', () => {
  it('国土地理院の住所検索 API の URL を組み立てる', () => {
    expect(buildGsiUrl('仮想県テスト市')).toBe(
      'https://msearch.gsi.go.jp/address-search/AddressSearch?q=%E4%BB%AE%E6%83%B3%E7%9C%8C%E3%83%86%E3%82%B9%E3%83%88%E5%B8%82',
    )
  })
})

describe('parseGsiResponse', () => {
  it('先頭の Feature の座標（[lng, lat]）と title を返す', () => {
    const json = [
      { geometry: { type: 'Point', coordinates: [139.5, 35.5] }, properties: { title: '仮想県テスト市' } },
      { geometry: { type: 'Point', coordinates: [140, 36] }, properties: { title: '別の候補' } },
    ]
    expect(parseGsiResponse(json)).toEqual({ lat: 35.5, lng: 139.5, title: '仮想県テスト市' })
  })
  it('空配列・配列でない・座標が数値でない・範囲外は null', () => {
    expect(parseGsiResponse([])).toBeNull()
    expect(parseGsiResponse({})).toBeNull()
    expect(parseGsiResponse(null)).toBeNull()
    expect(parseGsiResponse([{ geometry: { coordinates: ['a', 'b'] } }])).toBeNull()
    expect(parseGsiResponse([{ geometry: { coordinates: [200, 35] } }])).toBeNull()
    expect(parseGsiResponse([{ geometry: { coordinates: [139.5, 35.5] } }])).toEqual({
      lat: 35.5,
      lng: 139.5,
      title: null,
    })
  })
})
```

- [ ] **Step 12: 失敗確認** — FAIL

- [ ] **Step 13: `src/lib/geocode.ts`**

```ts
/**
 * 国土地理院 住所検索 API（キー不要・同一 IP 10 秒 10 回・継続保証なし）の
 * URL 組み立てとレスポンス解析。呼び出し（fetch）は src/server/geocode.ts。
 */

export const GSI_ADDRESS_SEARCH = 'https://msearch.gsi.go.jp/address-search/AddressSearch'

export function normalizeAddress(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[－ー―‐]/g, '-')
    .replace(/(\d+)丁目(\d+)番(\d+)号?/u, '$1-$2-$3')
    .replace(/(\d+)丁目(\d+)番地?(?!\d)/u, '$1-$2')
}

export function buildGsiUrl(query: string): string {
  return `${GSI_ADDRESS_SEARCH}?q=${encodeURIComponent(query)}`
}

export type GeocodeHit = { lat: number; lng: number; title: string | null }

function inRange(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

export function parseGsiResponse(json: unknown): GeocodeHit | null {
  if (!Array.isArray(json) || json.length === 0) return null
  const first = json[0] as { geometry?: { coordinates?: unknown }; properties?: { title?: unknown } }
  const coords = first?.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return null
  const [lng, lat] = coords
  if (typeof lat !== 'number' || typeof lng !== 'number' || !inRange(lat, lng)) return null
  const title = typeof first.properties?.title === 'string' ? first.properties.title : null
  return { lat, lng, title }
}
```

- [ ] **Step 14: 通過とカバレッジ 100% の確認**

```bash
npm run test:coverage
```

Expected: `src/lib` の全ファイルが 100%（branches を含む）。足りない行があればテストを足す（閾値を下げない）。

- [ ] **Step 15: コミット**

```bash
git add src/lib
git commit -m "feat(lib): members / serviceArea / coords / geocode の純粋関数

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: server 層（利用者・設定・候補・場所・住所→座標）

**Files:**
- Create: `src/server/members.ts` `src/server/settings.ts` `src/server/repository.ts` `src/server/repository.worker-test.ts` `src/server/candidates.ts` `src/server/places.ts` `src/server/geocode.ts` `src/routes/api.geocode.tsx`
- Delete: `src/server/schema.worker-test.ts`（内容は repository.worker-test.ts に統合）

**Interfaces:**
- Consumes: `getDb()` `requireUser` `authenticateRequest`（Task 1）、`parseMembers` `findMember` `matchesHomeAreas` `parseAreaList` `parseCoordinate` `formatLatLng` `normalizeAddress` `buildGsiUrl` `parseGsiResponse`（Task 3）、テーブルと定数（Task 2）
- Produces（server function。すべて `createServerFn` で、UI は `useServerFn` / `loader` から呼ぶ）:
  - `getCurrentMember(): Promise<{ me: Member; members: Member[] }>`
  - `getHomeAreas(): Promise<string[]>`／`saveHomeAreas({ data: { areas: string } })`
  - `listCandidates(): Promise<{ vendors: VendorSummary[]; properties: Property[]; homeAreas: string[] }>` where `VendorSummary = Vendor & { coversHome: boolean; placeCount: number }`
  - `getVendor({ data: { id } })`: `{ vendor: Vendor; places: Place[]; coversHome: boolean }`／`saveVendor({ data: VendorInput })`: `{ id }`／`deleteVendor({ data: { id } })`
  - `getProperty` `saveProperty` `deleteProperty`（同じ形）
  - `getPlace({ data: { id } })`: `{ place: Place; vendor: Vendor | null; property: Property | null }`／`savePlace({ data: PlaceInput })`: `{ id }`／`deletePlace`／`listPlaces(): Promise<PlaceWithLinks[]>`（地図用。`PlaceWithLinks = Place & { vendorName: string | null; propertyName: string | null; visited: boolean }`。`visited` は visits に紐づく行があるか）
  - `GET /api/geocode?q=` → `200 { lat, lng, title, source: 'gsi' | 'cache' }` / `404 { error }` / `400 { error }`
  - repository（db を引数に取る純粋な DB 操作、worker テスト対象）: `upsertVendor(db, input, actorEmail)` `deleteVendorCascade(db, id)` `upsertProperty` `deletePropertyCascade` `upsertPlace` `deletePlaceCascade` `readSetting(db, key)` `writeSetting(db, key, value)` `getCachedGeocode(db, query)` `putCachedGeocode(db, hit)`

- [ ] **Step 1: `src/server/members.ts`**

```ts
import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import { findMember, parseMembers, type Member } from '../lib/members'
import { authenticateRequest } from './auth'

/** secret MEMBERS を読む。未設定なら空（表示はメールのローカル部・gray になる） */
export function allMembers(): Member[] {
  return parseMembers((env as unknown as { MEMBERS?: string }).MEMBERS)
}

/** 操作者のメール。ミドルウェアで認証済みだが、取れなければ 'unknown' */
export async function currentActorEmail(): Promise<string> {
  try {
    const result = await authenticateRequest(getRequest())
    return result.ok ? result.identity.email : 'unknown'
  } catch {
    return 'unknown'
  }
}

export const getCurrentMember = createServerFn().handler(async () => {
  const members = allMembers()
  const email = await currentActorEmail()
  return { me: findMember(members, email), members }
})
```

`MEMBERS` を `worker-configuration.d.ts` の Env に入れるため、`wrangler.jsonc` に secret の型だけ宣言する方法は無いので、`.dev.vars` に書いた上で `npm run cf-typegen` を実行する（wrangler は `.dev.vars` のキーも Env 型に含める）。それでも型に無い場合に備え、上のように `env as unknown as { MEMBERS?: string }` で読む。

- [ ] **Step 2: `src/server/repository.ts`（DB 操作。server function から呼ぶ）**

```ts
import { and, eq, sql } from 'drizzle-orm'

import type { Db } from '../db/client'
import {
  geocodeCache,
  places,
  properties,
  settings,
  vendors,
  visits,
  type NewPlace,
  type NewProperty,
  type NewVendor,
} from '../db/schema'
import type { GeocodeHit } from '../lib/geocode'

/** 実データを壊しうる操作を db 引数で受ける形にし、実 D1 でテストできるようにする */

export async function readSetting(db: Db, key: string): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1)
  return row?.value ?? null
}

export async function writeSetting(db: Db, key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: sql`(datetime('now'))` },
    })
}

export async function readHomeAreas(db: Db): Promise<string[]> {
  const raw = await readSetting(db, 'homeAreas')
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

type VendorInput = Omit<NewVendor, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & { id?: string }

/** id が無ければ作成、あれば更新。作成者は最初の保存時だけ記録する */
export async function upsertVendor(db: Db, input: VendorInput, actorEmail: string): Promise<string> {
  const { id, ...values } = input
  if (!id) {
    const newId = crypto.randomUUID()
    await db.insert(vendors).values({ ...values, id: newId, createdBy: actorEmail })
    return newId
  }
  await db
    .update(vendors)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(eq(vendors.id, id))
  return id
}

/** 業者を消す。場所・予定・見学・動画の vendorId は FK の SET NULL で外れる */
export async function deleteVendorCascade(db: Db, id: string): Promise<void> {
  await db.delete(vendors).where(eq(vendors.id, id))
}

type PropertyInput = Omit<NewProperty, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & {
  id?: string
}

export async function upsertProperty(
  db: Db,
  input: PropertyInput,
  actorEmail: string,
): Promise<string> {
  const { id, ...values } = input
  if (!id) {
    const newId = crypto.randomUUID()
    await db.insert(properties).values({ ...values, id: newId, createdBy: actorEmail })
    return newId
  }
  await db
    .update(properties)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(eq(properties.id, id))
  return id
}

export async function deletePropertyCascade(db: Db, id: string): Promise<void> {
  await db.delete(properties).where(eq(properties.id, id))
}

type PlaceInput = Omit<NewPlace, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & { id?: string }

export async function upsertPlace(db: Db, input: PlaceInput, actorEmail: string): Promise<string> {
  const { id, ...values } = input
  if (!id) {
    const newId = crypto.randomUUID()
    await db.insert(places).values({ ...values, id: newId, createdBy: actorEmail })
    return newId
  }
  await db
    .update(places)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(eq(places.id, id))
  return id
}

/** 場所を消す。見学記録が紐づいていたら消さない（記録の方が大事） */
export async function deletePlaceCascade(
  db: Db,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: 'has_visits' }> {
  const [used] = await db
    .select({ n: sql<number>`count(*)` })
    .from(visits)
    .where(eq(visits.placeId, id))
  if ((used?.n ?? 0) > 0) return { ok: false, reason: 'has_visits' }
  await db.delete(places).where(eq(places.id, id))
  return { ok: true }
}

export async function getCachedGeocode(db: Db, query: string): Promise<GeocodeHit | null> {
  const [row] = await db.select().from(geocodeCache).where(eq(geocodeCache.query, query)).limit(1)
  return row ? { lat: row.lat, lng: row.lng, title: row.title } : null
}

export async function putCachedGeocode(db: Db, query: string, hit: GeocodeHit): Promise<void> {
  await db
    .insert(geocodeCache)
    .values({ query, lat: hit.lat, lng: hit.lng, title: hit.title })
    .onConflictDoUpdate({
      target: geocodeCache.query,
      set: { lat: hit.lat, lng: hit.lng, title: hit.title, fetchedAt: sql`(datetime('now'))` },
    })
}

/** 地図用: 場所に業者名・物件名・見学済みかを付ける */
export async function listPlacesWithLinks(db: Db) {
  const rows = await db
    .select({
      place: places,
      vendorName: vendors.name,
      propertyName: properties.name,
      visitCount: sql<number>`(select count(*) from visits v where v.place_id = ${places.id})`,
    })
    .from(places)
    .leftJoin(vendors, eq(places.vendorId, vendors.id))
    .leftJoin(properties, eq(places.propertyId, properties.id))
    .orderBy(places.name)
  return rows.map((r) => ({
    ...r.place,
    vendorName: r.vendorName ?? null,
    propertyName: r.propertyName ?? null,
    visited: (r.visitCount ?? 0) > 0,
  }))
}

export type PlaceWithLinks = Awaited<ReturnType<typeof listPlacesWithLinks>>[number]

export async function countPlacesByVendor(db: Db): Promise<Map<string, number>> {
  const rows = await db
    .select({ vendorId: places.vendorId, n: sql<number>`count(*)` })
    .from(places)
    .where(and(sql`${places.vendorId} is not null`))
    .groupBy(places.vendorId)
  return new Map(rows.map((r) => [r.vendorId as string, r.n]))
}
```

- [ ] **Step 3: `src/server/repository.worker-test.ts`**（`schema.worker-test.ts` の 2 ケースもここへ移し、元ファイルは削除）

```ts
import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '../db/schema'
import { places, vendors, visits } from '../db/schema'
import {
  deletePlaceCascade,
  deleteVendorCascade,
  getCachedGeocode,
  listPlacesWithLinks,
  putCachedGeocode,
  readHomeAreas,
  upsertPlace,
  upsertVendor,
  writeSetting,
} from './repository'

const db = drizzle(env.DB, { schema })
const actor = 'owner@example.com'

async function reset() {
  for (const t of ['photos', 'visits', 'events', 'videos', 'comments', 'places', 'vendors', 'properties', 'settings', 'geocode_cache']) {
    await env.DB.exec(`DELETE FROM ${t}`)
  }
}
beforeEach(reset)

describe('settings', () => {
  it('homeAreas を JSON で往復し、壊れた値は空にする', async () => {
    expect(await readHomeAreas(db)).toEqual([])
    await writeSetting(db, 'homeAreas', JSON.stringify(['テスト市']))
    expect(await readHomeAreas(db)).toEqual(['テスト市'])
    await writeSetting(db, 'homeAreas', '{not json')
    expect(await readHomeAreas(db)).toEqual([])
  })
})

describe('vendors', () => {
  it('作成→更新→削除。施工エリアは JSON 配列で往復し、削除で場所の vendorId が外れる', async () => {
    const id = await upsertVendor(db, { name: '甲工務店', kind: 'koumuten', serviceAreas: ['テスト市'] }, actor)
    let [row] = await db.select().from(vendors).where(eq(vendors.id, id))
    expect(row.serviceAreas).toEqual(['テスト市'])
    expect(row.createdBy).toBe(actor)

    await upsertVendor(db, { id, name: '甲工務店', kind: 'hm', serviceAreas: [] }, 'partner@example.com')
    ;[row] = await db.select().from(vendors).where(eq(vendors.id, id))
    expect(row.kind).toBe('hm')
    expect(row.createdBy).toBe(actor)

    const placeId = await upsertPlace(db, { name: 'テスト展示場', kind: 'showroom', vendorId: id }, actor)
    await deleteVendorCascade(db, id)
    const [place] = await db.select().from(places).where(eq(places.id, placeId))
    expect(place.vendorId).toBeNull()
  })
})

describe('places', () => {
  it('見学記録がある場所は消せない', async () => {
    const placeId = await upsertPlace(db, { name: 'テスト会場', kind: 'open_house' }, actor)
    await db.insert(visits).values({ id: crypto.randomUUID(), placeId, visitedOn: '2030-01-01', createdBy: actor })
    expect(await deletePlaceCascade(db, placeId)).toEqual({ ok: false, reason: 'has_visits' })
    expect(await db.select().from(places).where(eq(places.id, placeId))).toHaveLength(1)
  })

  it('地図用の一覧に業者名と見学済みが付く', async () => {
    const vendorId = await upsertVendor(db, { name: '乙建設', kind: 'koumuten', serviceAreas: [] }, actor)
    const visitedId = await upsertPlace(db, { name: 'A', kind: 'model_house', vendorId, lat: 35, lng: 139 }, actor)
    await upsertPlace(db, { name: 'B', kind: 'showroom' }, actor)
    await db.insert(visits).values({ id: crypto.randomUUID(), placeId: visitedId, visitedOn: '2030-01-01', createdBy: actor })
    const rows = await listPlacesWithLinks(db)
    expect(rows.map((r) => [r.name, r.vendorName, r.visited])).toEqual([
      ['A', '乙建設', true],
      ['B', null, false],
    ])
  })
})

describe('geocode cache', () => {
  it('同じ文字列は上書きで 1 行', async () => {
    expect(await getCachedGeocode(db, 'テスト市')).toBeNull()
    await putCachedGeocode(db, 'テスト市', { lat: 35, lng: 139, title: 'テスト市' })
    await putCachedGeocode(db, 'テスト市', { lat: 36, lng: 140, title: null })
    expect(await getCachedGeocode(db, 'テスト市')).toEqual({ lat: 36, lng: 140, title: null })
  })
})
```

- [ ] **Step 4: 失敗確認** — `npm run test:server` → FAIL（repository が無い）。Step 2 を書いたら PASS になることを確認。

- [ ] **Step 5: `src/server/settings.ts`**

```ts
import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDb } from '../db/client'
import { parseAreaList } from '../lib/serviceArea'
import { allMembers, currentActorEmail } from './members'
import { readHomeAreas, writeSetting } from './repository'

export const getSettings = createServerFn().handler(async () => {
  const db = getDb()
  const [homeAreas, actorEmail] = await Promise.all([readHomeAreas(db), currentActorEmail()])
  return {
    homeAreas,
    actorEmail,
    members: allMembers(),
    environment: env.ENVIRONMENT ?? 'unknown',
    photosReady: Boolean((env as unknown as { PHOTOS?: unknown }).PHOTOS),
  }
})

export const saveHomeAreas = createServerFn({ method: 'POST' })
  .validator(z.object({ areas: z.string().max(500) }))
  .handler(async ({ data }) => {
    const areas = parseAreaList(data.areas)
    await writeSetting(getDb(), 'homeAreas', JSON.stringify(areas))
    return { ok: true as const, areas }
  })

export const getHomeAreas = createServerFn().handler(async () => readHomeAreas(getDb()))
```

- [ ] **Step 6: `src/server/candidates.ts`**

```ts
import { createServerFn } from '@tanstack/react-start'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '../db/client'
import { CANDIDATE_STATUSES, statusRank } from '../lib/status'
import { matchesHomeAreas } from '../lib/serviceArea'
import { VENDOR_KINDS, places, properties, vendors } from '../db/schema'
import { currentActorEmail } from './members'
import {
  countPlacesByVendor,
  deletePropertyCascade,
  deleteVendorCascade,
  readHomeAreas,
  upsertProperty,
  upsertVendor,
} from './repository'

const idInput = z.object({ id: z.string().uuid() })

const optionalText = z.string().trim().max(2000).transform((v) => (v === '' ? null : v)).nullable()
const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .refine((v) => v === null || /^https?:\/\//.test(v), 'URL は http(s):// で始めてください')
const optionalInt = z.number().int().nullable()

export const vendorInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, '名前は必須です').max(200),
  kind: z.enum(VENDOR_KINDS),
  hq: optionalText,
  serviceAreas: z.array(z.string().trim().min(1).max(50)).max(100),
  uaValue: z.number().min(0).max(5).nullable(),
  cValuePublished: z.boolean(),
  seismicGrade: z.number().int().min(1).max(3).nullable(),
  longTermCertified: z.boolean(),
  pricePerTsuboMin: optionalInt,
  pricePerTsuboMax: optionalInt,
  structure: optionalText,
  features: optionalText,
  status: z.enum(CANDIDATE_STATUSES),
  sourceUrl: optionalUrl,
  websiteUrl: optionalUrl,
})
export type VendorInput = z.infer<typeof vendorInput>

export const propertyInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, '名前は必須です').max(200),
  address: optionalText,
  station: optionalText,
  walkMinutes: optionalInt,
  price: optionalInt,
  areaSqm: z.number().min(0).nullable(),
  layout: optionalText,
  builtYear: optionalInt,
  completionDate: optionalText,
  managementFee: optionalInt,
  repairReserve: optionalInt,
  listingUrl: optionalUrl,
  note: optionalText,
  status: z.enum(CANDIDATE_STATUSES),
})
export type PropertyInput = z.infer<typeof propertyInput>

export const listCandidates = createServerFn().handler(async () => {
  const db = getDb()
  const [vendorRows, propertyRows, homeAreas, placeCounts] = await Promise.all([
    db.select().from(vendors).orderBy(asc(vendors.name)),
    db.select().from(properties).orderBy(asc(properties.name)),
    readHomeAreas(db),
    countPlacesByVendor(db),
  ])
  const byStatus = <T extends { status: (typeof CANDIDATE_STATUSES)[number] }>(a: T, b: T) =>
    statusRank(a.status) - statusRank(b.status)
  return {
    homeAreas,
    vendors: vendorRows
      .map((v) => ({
        ...v,
        coversHome: matchesHomeAreas(v.serviceAreas, homeAreas),
        placeCount: placeCounts.get(v.id) ?? 0,
      }))
      .sort(byStatus),
    properties: propertyRows.sort(byStatus),
  }
})

export const getVendor = createServerFn()
  .validator(idInput)
  .handler(async ({ data }) => {
    const db = getDb()
    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, data.id)).limit(1)
    if (!vendor) throw new Response('Not Found', { status: 404 })
    const [placeRows, homeAreas] = await Promise.all([
      db.select().from(places).where(eq(places.vendorId, data.id)).orderBy(asc(places.name)),
      readHomeAreas(db),
    ])
    return { vendor, places: placeRows, coversHome: matchesHomeAreas(vendor.serviceAreas, homeAreas) }
  })

export const saveVendor = createServerFn({ method: 'POST' })
  .validator(vendorInput)
  .handler(async ({ data }) => ({ id: await upsertVendor(getDb(), data, await currentActorEmail()) }))

export const deleteVendor = createServerFn({ method: 'POST' })
  .validator(idInput)
  .handler(async ({ data }) => {
    await deleteVendorCascade(getDb(), data.id)
    return { ok: true as const }
  })

export const getProperty = createServerFn()
  .validator(idInput)
  .handler(async ({ data }) => {
    const db = getDb()
    const [property] = await db.select().from(properties).where(eq(properties.id, data.id)).limit(1)
    if (!property) throw new Response('Not Found', { status: 404 })
    const placeRows = await db.select().from(places).where(eq(places.propertyId, data.id))
    return { property, places: placeRows }
  })

export const saveProperty = createServerFn({ method: 'POST' })
  .validator(propertyInput)
  .handler(async ({ data }) => ({ id: await upsertProperty(getDb(), data, await currentActorEmail()) }))

export const deleteProperty = createServerFn({ method: 'POST' })
  .validator(idInput)
  .handler(async ({ data }) => {
    await deletePropertyCascade(getDb(), data.id)
    return { ok: true as const }
  })
```

- [ ] **Step 7: `src/server/geocode.ts` と `src/routes/api.geocode.tsx`**

```ts
// src/server/geocode.ts
import type { Db } from '../db/client'
import { buildGsiUrl, normalizeAddress, parseGsiResponse, type GeocodeHit } from '../lib/geocode'
import { getCachedGeocode, putCachedGeocode } from './repository'

export type GeocodeResult = (GeocodeHit & { source: 'gsi' | 'cache' }) | null

/**
 * 住所→座標。キャッシュ→国土地理院の順。国土地理院は 5 秒で諦める。
 * 失敗は null（画面側は「座標を手貼りしてください」に落とす）。
 */
export async function geocodeAddress(
  db: Db,
  rawQuery: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GeocodeResult> {
  const query = normalizeAddress(rawQuery)
  if (!query) return null
  const cached = await getCachedGeocode(db, query)
  if (cached) return { ...cached, source: 'cache' }

  let hit: GeocodeHit | null = null
  try {
    const res = await fetchImpl(buildGsiUrl(query), {
      signal: AbortSignal.timeout(5000),
      headers: { accept: 'application/json' },
    })
    if (res.ok) hit = parseGsiResponse(await res.json())
  } catch {
    hit = null
  }
  if (!hit) return null
  await putCachedGeocode(db, query, hit)
  return { ...hit, source: 'gsi' }
}
```

```tsx
// src/routes/api.geocode.tsx
import { createFileRoute } from '@tanstack/react-router'

import { getDb } from '../db/client'
import { securityHeadersInit } from '../lib/securityHeaders'
import { geocodeAddress } from '../server/geocode'

/** 認証は src/start.ts のグローバルミドルウェアが適用済み */
export const Route = createFileRoute('/api/geocode')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams.get('q')?.trim() ?? ''
        const headers = securityHeadersInit({ 'content-type': 'application/json; charset=utf-8' })
        if (q.length === 0 || q.length > 200) {
          return new Response(JSON.stringify({ error: '住所を入力してください' }), { status: 400, headers })
        }
        const hit = await geocodeAddress(getDb(), q)
        if (!hit) {
          return new Response(JSON.stringify({ error: '住所から座標を引けませんでした' }), { status: 404, headers })
        }
        return new Response(JSON.stringify(hit), { status: 200, headers })
      },
    },
  },
})
```

worker テスト `src/server/geocode.worker-test.ts` を足す（`fetchImpl` を差し替えて GSI を呼ばない）:

```ts
import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '../db/schema'
import { geocodeAddress } from './geocode'

const db = drizzle(env.DB, { schema })
beforeEach(async () => {
  await env.DB.exec('DELETE FROM geocode_cache')
})

const fake = (body: unknown, ok = true) => async () =>
  new Response(JSON.stringify(body), { status: ok ? 200 : 500 })

describe('geocodeAddress', () => {
  it('1 回目は API、2 回目はキャッシュ', async () => {
    const hit = [{ geometry: { coordinates: [139.5, 35.5] }, properties: { title: 'テスト市' } }]
    expect(await geocodeAddress(db, ' 仮想県 テスト市 ', fake(hit))).toEqual({
      lat: 35.5, lng: 139.5, title: 'テスト市', source: 'gsi',
    })
    expect(await geocodeAddress(db, '仮想県テスト市', fake([]))).toEqual({
      lat: 35.5, lng: 139.5, title: 'テスト市', source: 'cache',
    })
  })
  it('API が空・失敗・例外なら null で、キャッシュに残さない', async () => {
    expect(await geocodeAddress(db, '架空市', fake([]))).toBeNull()
    expect(await geocodeAddress(db, '架空市', fake([], false))).toBeNull()
    expect(await geocodeAddress(db, '架空市', async () => { throw new Error('down') })).toBeNull()
    expect(await geocodeAddress(db, '', fake([]))).toBeNull()
  })
})
```

- [ ] **Step 8: `src/server/places.ts`**

```ts
import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '../db/client'
import { GEOCODE_SOURCES, PLACE_KINDS, places, properties, vendors } from '../db/schema'
import { parseCoordinate } from '../lib/coords'
import { currentActorEmail } from './members'
import { deletePlaceCascade, listPlacesWithLinks, upsertPlace } from './repository'

const idInput = z.object({ id: z.string().uuid() })
const optionalText = z.string().trim().max(2000).transform((v) => (v === '' ? null : v)).nullable()

export const placeInput = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, '名前は必須です').max(200),
    kind: z.enum(PLACE_KINDS),
    address: optionalText,
    /** 住所検索で得た座標（画面が /api/geocode を呼んで埋める） */
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
    /** 手貼りの座標。入っていれば lat/lng より優先し geocodeSource='manual' */
    coordsText: optionalText,
    geocodeSource: z.enum(GEOCODE_SOURCES).nullable(),
    vendorId: z.string().uuid().nullable(),
    propertyId: z.string().uuid().nullable(),
    note: optionalText,
  })
  .transform((v) => {
    if (v.coordsText) {
      const parsed = parseCoordinate(v.coordsText)
      if (parsed) return { ...v, lat: parsed.lat, lng: parsed.lng, geocodeSource: 'manual' as const }
    }
    return v
  })
export type PlaceInput = z.input<typeof placeInput>

export const listPlaces = createServerFn().handler(async () => listPlacesWithLinks(getDb()))

export const getPlace = createServerFn()
  .validator(idInput)
  .handler(async ({ data }) => {
    const db = getDb()
    const [place] = await db.select().from(places).where(eq(places.id, data.id)).limit(1)
    if (!place) throw new Response('Not Found', { status: 404 })
    const [vendor] = place.vendorId
      ? await db.select().from(vendors).where(eq(vendors.id, place.vendorId)).limit(1)
      : []
    const [property] = place.propertyId
      ? await db.select().from(properties).where(eq(properties.id, place.propertyId)).limit(1)
      : []
    return { place, vendor: vendor ?? null, property: property ?? null }
  })

export const savePlace = createServerFn({ method: 'POST' })
  .validator(placeInput)
  .handler(async ({ data }) => ({ id: await upsertPlace(getDb(), data, await currentActorEmail()) }))

export const deletePlace = createServerFn({ method: 'POST' })
  .validator(idInput)
  .handler(async ({ data }) => deletePlaceCascade(getDb(), data.id))

/** 候補フォームの選択肢 */
export const listLinkTargets = createServerFn().handler(async () => {
  const db = getDb()
  const [v, p] = await Promise.all([
    db.select({ id: vendors.id, name: vendors.name }).from(vendors).orderBy(vendors.name),
    db.select({ id: properties.id, name: properties.name }).from(properties).orderBy(properties.name),
  ])
  return { vendors: v, properties: p }
})
```

- [ ] **Step 9: 検証とコミット**

```bash
npm run cf-typegen && npm run typecheck && npm run test:coverage && npm run test:server && npm run format:check
npm run dev &
sleep 8
curl -s 'http://localhost:3000/api/geocode?q=' -w ' %{http_code}\n'      # 400
curl -s 'http://localhost:3000/api/geocode?q=%E6%9D%B1%E4%BA%AC%E9%A7%85' -w ' %{http_code}\n'   # 200 と lat/lng（国土地理院に実際に 1 回問い合わせる）
kill %1
git add -A
git commit -m "feat(server): 利用者・設定・候補・場所の server function と住所→座標プロキシ

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: モバイルシェル（下タブ・FAB・全画面 Drawer・作成者チップ）

**Files:**
- Modify: `src/components/AppLayout.tsx`（Task 1 の仮実装を置換）
- Create: `src/components/Fab.tsx` `src/components/FormDrawer.tsx` `src/components/MemberChip.tsx` `src/components/EmptyState.tsx` `src/lib/nav.test.ts`（既存に追記）
- Create（仮のルート。Task 6〜9 で中身を入れる）: `src/routes/calendar.tsx` `src/routes/records.tsx` `src/routes/candidates.tsx` `src/routes/map.tsx` `src/routes/settings.tsx`

**Interfaces:**
- Produces: `NAV_ITEMS`（`src/lib/nav.ts` に移す: `{ to, label, icon }` の配列。icon は lucide のコンポーネント名の文字列ではなくコンポーネントを `AppLayout` 側で対応付ける）、`Fab({ label, onClick, icon? })`、`FormDrawer({ opened, onClose, title, children })`、`MemberChip({ email, members })`、`EmptyState({ title, description, action? })`

- [ ] **Step 1: `src/lib/nav.ts` にタブ定義を足し、テストを追記**

```ts
// src/lib/nav.ts に追記
export const NAV_ITEMS = [
  { to: '/', label: 'ホーム', icon: 'home' },
  { to: '/calendar', label: '予定', icon: 'calendar' },
  { to: '/records', label: '記録', icon: 'notebook' },
  { to: '/candidates', label: '候補', icon: 'building' },
  { to: '/map', label: '地図', icon: 'map' },
] as const
export type NavIcon = (typeof NAV_ITEMS)[number]['icon']
```

```ts
// src/lib/nav.test.ts に追記
it('タブは 5 つで、設定はタブに含めない', () => {
  expect(NAV_ITEMS.map((i) => i.to)).toEqual(['/', '/calendar', '/records', '/candidates', '/map'])
})
it('候補の詳細ページでも「候補」タブが選択される', () => {
  expect(isNavItemActive('/candidates/vendors/abc', '/candidates')).toBe(true)
  expect(isNavItemActive('/places/abc', '/map')).toBe(false)
})
```

- [ ] **Step 2: `src/components/AppLayout.tsx`**

```tsx
import { AppShell, Group, NavLink, Stack, Text, UnstyledButton } from '@mantine/core'
import { Link, useLocation } from '@tanstack/react-router'
import { Building2, CalendarDays, House, Map, NotebookPen, Settings } from 'lucide-react'

import { NAV_ITEMS, isNavItemActive, type NavIcon } from '../lib/nav'
import { ColorSchemeToggle } from './ColorSchemeToggle'

const ICONS: Record<NavIcon, typeof House> = {
  home: House,
  calendar: CalendarDays,
  notebook: NotebookPen,
  building: Building2,
  map: Map,
}

/**
 * スマホ: 上に小さなヘッダ、下にタブバー。デスクトップ(sm 以上): 左ナビ。
 * 同じ NAV_ITEMS を両方で使う。追加操作は各ページの FAB が担う。
 */
export function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()

  return (
    <AppShell
      header={{ height: 52 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: true } }}
      footer={{ height: { base: 64, sm: 0 } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Text fw={700} size="lg" component={Link} to="/" c="inherit" td="none">
            住まいログ
          </Text>
          <Group gap="xs" wrap="nowrap">
            <ColorSchemeToggle />
            <NavLink
              component={Link}
              to="/settings"
              label="設定"
              leftSection={<Settings size={18} aria-hidden />}
              active={isNavItemActive(pathname, '/settings')}
              w="auto"
              px="xs"
            />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        {NAV_ITEMS.map(({ to, label, icon }) => {
          const Icon = ICONS[icon]
          return (
            <NavLink
              key={to}
              component={Link}
              to={to}
              label={label}
              leftSection={<Icon size={18} aria-hidden />}
              active={isNavItemActive(pathname, to)}
            />
          )
        })}
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>

      <AppShell.Footer hiddenFrom="sm" className="tabbar" withBorder>
        <Group grow gap={0} h={64} component="nav" aria-label="主要なページ">
          {NAV_ITEMS.map(({ to, label, icon }) => {
            const Icon = ICONS[icon]
            const active = isNavItemActive(pathname, to)
            return (
              <UnstyledButton
                key={to}
                component={Link}
                to={to}
                aria-current={active ? 'page' : undefined}
                h="100%"
              >
                <Stack align="center" justify="center" gap={2} h="100%">
                  <Icon size={22} aria-hidden strokeWidth={active ? 2.5 : 1.75} />
                  <Text size="xs" fw={active ? 700 : 500} c={active ? 'clay' : 'dimmed'}>
                    {label}
                  </Text>
                </Stack>
              </UnstyledButton>
            )
          })}
        </Group>
      </AppShell.Footer>
    </AppShell>
  )
}
```

- [ ] **Step 3: `Fab` / `FormDrawer` / `MemberChip` / `EmptyState`**

```tsx
// src/components/Fab.tsx
import { Affix, Button, rem } from '@mantine/core'
import { Plus } from 'lucide-react'

/** 右下の追加ボタン。下タブとホームインジケータの上に浮かせる */
export function Fab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Affix position={{ bottom: `calc(${rem(80)} + env(safe-area-inset-bottom, 0px))`, right: rem(16) }}>
      <Button
        size="lg"
        radius="xl"
        leftSection={<Plus size={20} aria-hidden />}
        onClick={onClick}
        style={{ boxShadow: 'var(--mantine-shadow-lg)' }}
      >
        {label}
      </Button>
    </Affix>
  )
}
```

```tsx
// src/components/FormDrawer.tsx
import { Drawer } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'

/** スマホでは下から全画面、デスクトップでは右から幅 480 の Drawer */
export function FormDrawer({
  opened,
  onClose,
  title,
  children,
}: {
  opened: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  const isMobile = useMediaQuery('(max-width: 48em)', true)
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={title}
      position={isMobile ? 'bottom' : 'right'}
      size={isMobile ? '100%' : 480}
      padding="md"
      styles={{ title: { fontWeight: 700, fontSize: 'var(--mantine-font-size-lg)' } }}
    >
      {children}
    </Drawer>
  )
}
```

```tsx
// src/components/MemberChip.tsx
import { Avatar, Group, Text } from '@mantine/core'

import { findMember, type Member } from '../lib/members'

export function MemberChip({ email, members }: { email: string; members: readonly Member[] }) {
  const m = findMember(members, email)
  return (
    <Group gap={6} wrap="nowrap">
      <Avatar size={22} radius="xl" color={m.color}>
        {m.displayName.slice(0, 1)}
      </Avatar>
      <Text size="xs" c="dimmed">
        {m.displayName}
      </Text>
    </Group>
  )
}
```

```tsx
// src/components/EmptyState.tsx
import { Card, Stack, Text } from '@mantine/core'

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <Card withBorder padding="lg" bg="var(--mantine-color-default-hover)">
      <Stack align="center" gap="xs" ta="center">
        <Text fw={600}>{title}</Text>
        {description ? (
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        ) : null}
        {action}
      </Stack>
    </Card>
  )
}
```

- [ ] **Step 4: 仮ルート 5 本**（各ファイルは同じ形。`/calendar` `/records` は Phase 2/3 まで「準備中」）

```tsx
// src/routes/calendar.tsx（records.tsx も同様に title を変える）
import { createFileRoute } from '@tanstack/react-router'

import { EmptyState } from '../components/EmptyState'
import { PageShell } from '../components/PageShell'

export const Route = createFileRoute('/calendar')({ component: Page })

function Page() {
  return (
    <PageShell title="予定">
      <EmptyState title="準備中" description="次の段階で予定を登録できるようになります。" />
    </PageShell>
  )
}
```

`candidates.tsx` `map.tsx` `settings.tsx` も同じ雛形で置き、Task 6〜9 で置換する。

- [ ] **Step 5: 実機相当の確認（Playwright MCP・390×844）**

`npm run dev` を起動し、Playwright MCP で `browser_resize` 390×844 → `http://localhost:3000/` を開き、`browser_snapshot` で (a) 下タブ 5 つが見える (b) ヘッダに「設定」がある (c) 各タブをクリックして遷移し `aria-current=page` が移る、を確認。1280 幅では左ナビが出て下タブが消えることも確認。スクリーンショットを `docs/superpowers/plans/screenshots/` に置かない（リポジトリに画像を増やさない。scratchpad に保存）。

- [ ] **Step 6: 検証とコミット**

```bash
npm run generate-routes && npm run typecheck && npm run test:coverage && npm run format:check && npm run build
git add -A
git commit -m "feat(ui): モバイルシェル（下タブ・FAB・全画面 Drawer・作成者チップ）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 候補ページ（戸建て業者／マンション物件）

**Files:**
- Modify: `src/routes/candidates.tsx`
- Create: `src/routes/candidates.vendors.$id.tsx` `src/routes/candidates.properties.$id.tsx` `src/components/candidates/VendorCard.tsx` `src/components/candidates/PropertyCard.tsx` `src/components/candidates/VendorForm.tsx` `src/components/candidates/PropertyForm.tsx` `src/components/candidates/StatusBadge.tsx` `src/lib/format.ts` `src/lib/format.test.ts`

**Interfaces:**
- Consumes: `listCandidates` `getVendor` `saveVendor` `deleteVendor` `getProperty` `saveProperty` `deleteProperty` `vendorInput` `propertyInput`（Task 4）、`Fab` `FormDrawer` `EmptyState` `PageShell`（Task 5）
- Produces: `formatYen(n: number | null): string`（`1,234万円` 表記。1 万円未満は `円`）、`formatSqm(n)`、`formatTsubo(min, max)`（`80〜100万円/坪`）、`StatusBadge({ status })`

- [ ] **Step 1: `src/lib/format.test.ts` → `format.ts`（TDD）**

```ts
// format.test.ts
import { describe, expect, it } from 'vitest'
import { formatSqm, formatTsubo, formatYen } from './format'

describe('formatYen', () => {
  it('万円単位に丸め、1万円未満は円、null は「—」', () => {
    expect(formatYen(52_800_000)).toBe('5,280万円')
    expect(formatYen(123_456_789)).toBe('12,346万円')
    expect(formatYen(9_999)).toBe('9,999円')
    expect(formatYen(null)).toBe('—')
  })
})
describe('formatSqm', () => {
  it('小数 2 桁と ㎡', () => {
    expect(formatSqm(70.5)).toBe('70.50㎡')
    expect(formatSqm(null)).toBe('—')
  })
})
describe('formatTsubo', () => {
  it('範囲・片側・無し', () => {
    expect(formatTsubo(80, 100)).toBe('80〜100万円/坪')
    expect(formatTsubo(80, null)).toBe('80万円/坪〜')
    expect(formatTsubo(null, 100)).toBe('〜100万円/坪')
    expect(formatTsubo(null, null)).toBe('—')
  })
})
```

```ts
// format.ts
export function formatYen(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  if (Math.abs(value) < 10_000) return `${value.toLocaleString('ja-JP')}円`
  return `${Math.round(value / 10_000).toLocaleString('ja-JP')}万円`
}
export function formatSqm(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value.toFixed(2)}㎡`
}
export function formatTsubo(min: number | null | undefined, max: number | null | undefined): string {
  if (min != null && max != null) return `${min}〜${max}万円/坪`
  if (min != null) return `${min}万円/坪〜`
  if (max != null) return `〜${max}万円/坪`
  return '—'
}
```

- [ ] **Step 2: `StatusBadge` / `VendorCard` / `PropertyCard`**

```tsx
// src/components/candidates/StatusBadge.tsx
import { Badge } from '@mantine/core'
import { STATUS_COLOR, STATUS_LABEL, type CandidateStatus } from '../../lib/status'
export function StatusBadge({ status }: { status: CandidateStatus }) {
  return (
    <Badge color={STATUS_COLOR[status]} variant={status === 'dropped' ? 'outline' : 'light'}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}
```

```tsx
// src/components/candidates/VendorCard.tsx
import { Badge, Card, Group, Stack, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { MapPin } from 'lucide-react'

import { VENDOR_KIND_LABEL, type Vendor } from '../../db/schema'
import { formatTsubo } from '../../lib/format'
import { StatusBadge } from './StatusBadge'

export function VendorCard({ vendor }: { vendor: Vendor & { coversHome: boolean; placeCount: number } }) {
  return (
    <Card withBorder padding="md" component={Link} to="/candidates/vendors/$id" params={{ id: vendor.id }}>
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap">
          <Text fw={700} lineClamp={1}>
            {vendor.name}
          </Text>
          <StatusBadge status={vendor.status} />
        </Group>
        <Group gap="xs">
          <Badge variant="default">{VENDOR_KIND_LABEL[vendor.kind]}</Badge>
          {vendor.coversHome ? <Badge color="teal" variant="light">建築予定地が施工エリア内</Badge> : null}
          {vendor.uaValue != null ? <Badge variant="default">UA {vendor.uaValue}</Badge> : null}
          {vendor.cValuePublished ? <Badge variant="default">C値公開</Badge> : null}
        </Group>
        <Group gap="md">
          <Text size="sm" c="dimmed">
            {formatTsubo(vendor.pricePerTsuboMin, vendor.pricePerTsuboMax)}
          </Text>
          {vendor.placeCount > 0 ? (
            <Group gap={4}>
              <MapPin size={14} aria-hidden />
              <Text size="sm" c="dimmed">
                {vendor.placeCount} 箇所
              </Text>
            </Group>
          ) : null}
        </Group>
      </Stack>
    </Card>
  )
}
```

`PropertyCard` は同じ形で `name` / `StatusBadge` / `station`＋`walkMinutes` 分 / `formatYen(price)` / `layout`・`formatSqm(areaSqm)` を出す。

- [ ] **Step 3: `VendorForm` / `PropertyForm`**（`@mantine/form`。`FormDrawer` の中で使う。保存後は `router.invalidate()`）

```tsx
// src/components/candidates/VendorForm.tsx
import { Button, Checkbox, Group, NumberInput, Select, Stack, TagsInput, TextInput, Textarea } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { VENDOR_KINDS, VENDOR_KIND_LABEL, type Vendor } from '../../db/schema'
import { CANDIDATE_STATUSES, STATUS_LABEL } from '../../lib/status'
import { saveVendor, type VendorInput } from '../../server/candidates'

type Values = Omit<VendorInput, 'id'>

const empty: Values = {
  name: '',
  kind: 'koumuten',
  hq: null,
  serviceAreas: [],
  uaValue: null,
  cValuePublished: false,
  seismicGrade: null,
  longTermCertified: false,
  pricePerTsuboMin: null,
  pricePerTsuboMax: null,
  structure: null,
  features: null,
  status: 'interested',
  sourceUrl: null,
  websiteUrl: null,
}

export function VendorForm({
  vendor,
  homeAreas,
  onSaved,
}: {
  vendor: Vendor | null
  homeAreas: string[]
  onSaved: (id: string) => void
}) {
  const router = useRouter()
  const save = useServerFn(saveVendor)
  const [saving, setSaving] = useState(false)
  const form = useForm<Values>({
    initialValues: vendor ? { ...empty, ...vendor } : empty,
    validate: { name: (v) => (v.trim() ? null : '名前は必須です') },
  })

  async function submit(values: Values) {
    setSaving(true)
    try {
      const { id } = await save({ data: { ...(vendor ? { id: vendor.id } : {}), ...values } })
      await router.invalidate()
      notifications.show({ message: vendor ? '業者を更新しました' : '業者を追加しました' })
      onSaved(id)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={form.onSubmit(submit)}>
      <Stack gap="md">
        <TextInput label="名前" required {...form.getInputProps('name')} />
        <Select
          label="種別"
          data={VENDOR_KINDS.map((k) => ({ value: k, label: VENDOR_KIND_LABEL[k] }))}
          {...form.getInputProps('kind')}
        />
        <Select
          label="状態"
          data={CANDIDATE_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          {...form.getInputProps('status')}
        />
        <TagsInput
          label="施工エリア"
          description={homeAreas.length ? `建築予定地: ${homeAreas.join('、')}` : '設定で建築予定地を登録すると照合できます'}
          placeholder="市区町村名を入力して Enter"
          splitChars={[',', '、']}
          {...form.getInputProps('serviceAreas')}
        />
        <TextInput label="本社" {...form.getInputProps('hq')} value={form.values.hq ?? ''} />
        <Group grow>
          <NumberInput label="UA値" decimalScale={2} step={0.01} min={0} max={5} {...form.getInputProps('uaValue')} />
          <NumberInput label="耐震等級" min={1} max={3} {...form.getInputProps('seismicGrade')} />
        </Group>
        <Group>
          <Checkbox label="C値の実測を公開" {...form.getInputProps('cValuePublished', { type: 'checkbox' })} />
          <Checkbox label="長期優良住宅に対応" {...form.getInputProps('longTermCertified', { type: 'checkbox' })} />
        </Group>
        <Group grow>
          <NumberInput label="坪単価 下限（万円）" min={0} {...form.getInputProps('pricePerTsuboMin')} />
          <NumberInput label="坪単価 上限（万円）" min={0} {...form.getInputProps('pricePerTsuboMax')} />
        </Group>
        <TextInput label="構造" {...form.getInputProps('structure')} value={form.values.structure ?? ''} />
        <Textarea label="特徴・メモ" autosize minRows={3} {...form.getInputProps('features')} value={form.values.features ?? ''} />
        <TextInput label="公式サイト" type="url" {...form.getInputProps('websiteUrl')} value={form.values.websiteUrl ?? ''} />
        <TextInput label="参照 URL" type="url" {...form.getInputProps('sourceUrl')} value={form.values.sourceUrl ?? ''} />
        <Button type="submit" loading={saving} fullWidth>
          保存
        </Button>
      </Stack>
    </form>
  )
}
```

`value={... ?? ''}` は null を持つ列の TextInput が uncontrolled 警告を出さないための処置。送信時に `''` は zod の `optionalText` が null に戻す。

`PropertyForm` は同じ骨格で `propertyInput` の項目（名前・状態・所在地・駅・徒歩分・価格(円)・専有面積・間取り・築年 or 竣工予定・管理費・修繕積立・掲載 URL・メモ）を並べる。価格は `NumberInput` に `thousandSeparator` と `suffix=" 円"`。

- [ ] **Step 4: `src/routes/candidates.tsx`（一覧）**

```tsx
import { Chip, Group, SegmentedControl, SimpleGrid, Stack, Switch } from '@mantine/core'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'

import { EmptyState } from '../components/EmptyState'
import { Fab } from '../components/Fab'
import { FormDrawer } from '../components/FormDrawer'
import { PageShell } from '../components/PageShell'
import { PropertyCard } from '../components/candidates/PropertyCard'
import { PropertyForm } from '../components/candidates/PropertyForm'
import { VendorCard } from '../components/candidates/VendorCard'
import { VendorForm } from '../components/candidates/VendorForm'
import { CANDIDATE_STATUSES, STATUS_LABEL } from '../lib/status'
import { listCandidates } from '../server/candidates'

const search = z.object({
  tab: z.enum(['vendors', 'properties']).default('vendors'),
  coversHome: z.boolean().default(false),
  status: z.enum(CANDIDATE_STATUSES).optional(),
})

export const Route = createFileRoute('/candidates')({
  component: Page,
  validateSearch: search,
  loader: () => listCandidates(),
})

function Page() {
  const { vendors, properties, homeAreas } = Route.useLoaderData()
  const { tab, coversHome, status } = Route.useSearch()
  const navigate = useNavigate({ from: '/candidates' })
  const [opened, setOpened] = useState(false)

  const shownVendors = vendors.filter((v) => (!coversHome || v.coversHome) && (!status || v.status === status))
  const shownProperties = properties.filter((p) => !status || p.status === status)

  return (
    <PageShell title="候補">
      <Stack gap="md">
        <SegmentedControl
          fullWidth
          value={tab}
          onChange={(v) => navigate({ search: (s) => ({ ...s, tab: v as 'vendors' | 'properties' }) })}
          data={[
            { value: 'vendors', label: `戸建て業者 ${vendors.length}` },
            { value: 'properties', label: `マンション ${properties.length}` },
          ]}
        />
        <Group gap="xs">
          {tab === 'vendors' ? (
            <Switch
              label="建築予定地が施工エリア内"
              checked={coversHome}
              disabled={homeAreas.length === 0}
              onChange={(e) => navigate({ search: (s) => ({ ...s, coversHome: e.currentTarget.checked }) })}
            />
          ) : null}
          <Chip.Group
            value={status ?? null}
            onChange={(v) => navigate({ search: (s) => ({ ...s, status: (v as typeof status) || undefined }) })}
          >
            <Group gap={6}>
              {CANDIDATE_STATUSES.map((s) => (
                <Chip key={s} value={s} size="xs">
                  {STATUS_LABEL[s]}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        </Group>

        {tab === 'vendors' ? (
          shownVendors.length ? (
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              {shownVendors.map((v) => (
                <VendorCard key={v.id} vendor={v} />
              ))}
            </SimpleGrid>
          ) : (
            <EmptyState title="業者がありません" description="右下の追加から登録できます。" />
          )
        ) : shownProperties.length ? (
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {shownProperties.map((p) => (
              <PropertyCard key={p.id} property={p} />
            ))}
          </SimpleGrid>
        ) : (
          <EmptyState title="物件がありません" description="右下の追加から登録できます。" />
        )}
      </Stack>

      <Fab label={tab === 'vendors' ? '業者を追加' : '物件を追加'} onClick={() => setOpened(true)} />
      <FormDrawer opened={opened} onClose={() => setOpened(false)} title={tab === 'vendors' ? '業者を追加' : '物件を追加'}>
        {tab === 'vendors' ? (
          <VendorForm vendor={null} homeAreas={homeAreas} onSaved={(id) => { setOpened(false); navigate({ to: '/candidates/vendors/$id', params: { id } }) }} />
        ) : (
          <PropertyForm property={null} onSaved={(id) => { setOpened(false); navigate({ to: '/candidates/properties/$id', params: { id } }) }} />
        )}
      </FormDrawer>
    </PageShell>
  )
}
```

- [ ] **Step 5: 詳細ページ `candidates.vendors.$id.tsx`**（`properties.$id.tsx` は同じ骨格）

```tsx
import { ActionIcon, Anchor, Badge, Card, Group, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { ExternalLink, MapPin, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { FormDrawer } from '../components/FormDrawer'
import { PageShell } from '../components/PageShell'
import { StatusBadge } from '../components/candidates/StatusBadge'
import { VendorForm } from '../components/candidates/VendorForm'
import { PLACE_KIND_LABEL, VENDOR_KIND_LABEL } from '../db/schema'
import { formatTsubo } from '../lib/format'
import { deleteVendor, getVendor } from '../server/candidates'
import { getHomeAreas } from '../server/settings'

export const Route = createFileRoute('/candidates/vendors/$id')({
  component: Page,
  loader: async ({ params }) => {
    const [detail, homeAreas] = await Promise.all([getVendor({ data: { id: params.id } }), getHomeAreas()])
    return { ...detail, homeAreas }
  },
})

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Group justify="space-between" wrap="nowrap" align="flex-start">
      <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>{label}</Text>
      <Text size="sm" ta="right" className="breakable">{value ?? '—'}</Text>
    </Group>
  )
}

function Page() {
  const { vendor, places, coversHome, homeAreas } = Route.useLoaderData()
  const navigate = useNavigate()
  const remove = useServerFn(deleteVendor)
  const [editing, setEditing] = useState(false)

  async function handleDelete() {
    if (!window.confirm(`「${vendor.name}」を削除します。場所・予定・記録は残ります。`)) return
    await remove({ data: { id: vendor.id } })
    notifications.show({ message: '業者を削除しました' })
    navigate({ to: '/candidates', search: { tab: 'vendors', coversHome: false } })
  }

  return (
    <PageShell
      title={vendor.name}
      actions={
        <Group gap="xs">
          <StatusBadge status={vendor.status} />
          <Badge variant="default">{VENDOR_KIND_LABEL[vendor.kind]}</Badge>
          {coversHome ? <Badge color="teal" variant="light">建築予定地が施工エリア内</Badge> : null}
          <ActionIcon variant="default" aria-label="編集" onClick={() => setEditing(true)}><Pencil size={16} /></ActionIcon>
          <ActionIcon variant="default" color="red" aria-label="削除" onClick={handleDelete}><Trash2 size={16} /></ActionIcon>
        </Group>
      }
    >
      <Card withBorder padding="md">
        <Stack gap="xs">
          <Row label="本社" value={vendor.hq} />
          <Row label="施工エリア" value={vendor.serviceAreas.length ? vendor.serviceAreas.join('、') : '未登録'} />
          <Row label="UA値 / C値" value={`${vendor.uaValue ?? '—'} / ${vendor.cValuePublished ? '実測公開' : '非公開'}`} />
          <Row label="耐震等級 / 長期優良" value={`${vendor.seismicGrade ?? '—'} / ${vendor.longTermCertified ? '対応' : '—'}`} />
          <Row label="坪単価" value={formatTsubo(vendor.pricePerTsuboMin, vendor.pricePerTsuboMax)} />
          <Row label="構造" value={vendor.structure} />
          {vendor.websiteUrl ? (
            <Row label="公式" value={<Anchor href={vendor.websiteUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden /> 開く</Anchor>} />
          ) : null}
        </Stack>
      </Card>
      {vendor.features ? <Text style={{ whiteSpace: 'pre-wrap' }}>{vendor.features}</Text> : null}

      <Stack gap="xs">
        <Title order={2}>場所</Title>
        {places.length === 0 ? (
          <Text size="sm" c="dimmed">この業者の展示場・モデルハウスはまだ登録されていません（地図タブから追加）。</Text>
        ) : (
          places.map((p) => (
            <Card key={p.id} withBorder padding="sm" component={Link} to="/places/$id" params={{ id: p.id }}>
              <Group gap="xs" wrap="nowrap">
                <MapPin size={16} aria-hidden />
                <Text fw={600} lineClamp={1}>{p.name}</Text>
                <Badge variant="default" size="xs">{PLACE_KIND_LABEL[p.kind]}</Badge>
              </Group>
            </Card>
          ))
        )}
      </Stack>

      <FormDrawer opened={editing} onClose={() => setEditing(false)} title="業者を編集">
        <VendorForm vendor={vendor} homeAreas={homeAreas} onSaved={() => setEditing(false)} />
      </FormDrawer>
    </PageShell>
  )
}
```

- [ ] **Step 6: 動作確認と検証**

Playwright MCP（390×844）で: 候補タブ→「業者を追加」→名前「甲工務店」・施工エリア「テスト市」で保存→詳細に遷移→編集で状態を「本命」に→一覧に戻り「本命」チップで絞れる→削除で一覧に戻る。マンション側も 1 件で同じ流れ。

```bash
npm run generate-routes && npm run typecheck && npm run test:coverage && npm run format:check && npm run build
git add -A
git commit -m "feat(candidates): 業者・マンション物件の一覧／詳細／フォーム

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: 場所（住所→座標、手貼り座標、詳細ページ）

**Files:**
- Create: `src/routes/places.$id.tsx` `src/components/places/PlaceForm.tsx` `src/components/places/PlaceLocation.tsx`
- Modify: `src/routes/candidates.vendors.$id.tsx` `src/routes/candidates.properties.$id.tsx`（「場所を追加」ボタンを付ける）

**Interfaces:**
- Consumes: `getPlace` `savePlace` `deletePlace` `listLinkTargets` `placeInput`（Task 4）、`/api/geocode`（Task 4）、`parseCoordinate` `formatLatLng`（Task 3）
- Produces: `PlaceForm({ place, defaults?: { vendorId?, propertyId? }, onSaved })`、`PlaceLocation({ place })`（座標が無いときは「出せない理由」を書く）

- [ ] **Step 1: `PlaceForm`**

住所入力の横に「住所から座標を引く」ボタン。押すと `fetch('/api/geocode?q=' + encodeURIComponent(address))` を呼び、200 なら `lat/lng/geocodeSource='gsi'` をフォームに入れ、結果の `title` を「この住所で引きました: …」と表示。404 なら「見つかりませんでした。Google マップで場所を開き、座標をコピーして下の欄に貼ってください」と表示し、手貼り欄（`coordsText`）を出す。`coordsText` は `parseCoordinate` でその場で検証し、読めない表記はエラーにする。

```tsx
import { Alert, Button, Group, Select, Stack, Text, TextInput, Textarea } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Crosshair, Search } from 'lucide-react'
import { useState } from 'react'

import { PLACE_KINDS, PLACE_KIND_LABEL, type Place } from '../../db/schema'
import { formatLatLng, parseCoordinate } from '../../lib/coords'
import { savePlace, type PlaceInput } from '../../server/places'

type Values = Omit<PlaceInput, 'id'>
type Targets = { vendors: { id: string; name: string }[]; properties: { id: string; name: string }[] }

const empty: Values = {
  name: '',
  kind: 'model_house',
  address: null,
  lat: null,
  lng: null,
  coordsText: null,
  geocodeSource: null,
  vendorId: null,
  propertyId: null,
  note: null,
}

export function PlaceForm({
  place,
  targets,
  defaults,
  onSaved,
}: {
  place: Place | null
  targets: Targets
  defaults?: Partial<Pick<Values, 'vendorId' | 'propertyId'>>
  onSaved: (id: string) => void
}) {
  const router = useRouter()
  const save = useServerFn(savePlace)
  const [saving, setSaving] = useState(false)
  const [lookup, setLookup] = useState<{ state: 'idle' | 'busy' | 'hit' | 'miss'; title?: string | null }>({ state: 'idle' })
  const form = useForm<Values>({
    initialValues: place ? { ...empty, ...place } : { ...empty, ...defaults },
    validate: {
      name: (v) => (v.trim() ? null : '名前は必須です'),
      coordsText: (v) => (v && !parseCoordinate(v) ? '座標の形式が読めません（例: 35.123456, 139.123456）' : null),
    },
  })

  async function geocode() {
    const address = form.values.address?.trim()
    if (!address) return
    setLookup({ state: 'busy' })
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`)
    if (res.ok) {
      const hit = (await res.json()) as { lat: number; lng: number; title: string | null }
      form.setValues({ lat: hit.lat, lng: hit.lng, geocodeSource: 'gsi', coordsText: null })
      setLookup({ state: 'hit', title: hit.title })
    } else {
      setLookup({ state: 'miss' })
    }
  }

  async function submit(values: Values) {
    setSaving(true)
    try {
      const { id } = await save({ data: { ...(place ? { id: place.id } : {}), ...values } })
      await router.invalidate()
      notifications.show({ message: place ? '場所を更新しました' : '場所を追加しました' })
      onSaved(id)
    } finally {
      setSaving(false)
    }
  }

  const resolved = form.values.coordsText ? parseCoordinate(form.values.coordsText) : form.values.lat != null && form.values.lng != null ? { lat: form.values.lat, lng: form.values.lng } : null

  return (
    <form onSubmit={form.onSubmit(submit)}>
      <Stack gap="md">
        <TextInput label="名前" required {...form.getInputProps('name')} />
        <Select label="種別" data={PLACE_KINDS.map((k) => ({ value: k, label: PLACE_KIND_LABEL[k] }))} {...form.getInputProps('kind')} />
        <Select label="業者" clearable searchable data={targets.vendors.map((v) => ({ value: v.id, label: v.name }))} {...form.getInputProps('vendorId')} />
        <Select label="マンション物件" clearable searchable data={targets.properties.map((p) => ({ value: p.id, label: p.name }))} {...form.getInputProps('propertyId')} />
        <TextInput label="住所" placeholder="都道府県から。番地まで無くても町名で引けます" {...form.getInputProps('address')} value={form.values.address ?? ''} />
        <Button variant="default" leftSection={<Search size={16} aria-hidden />} loading={lookup.state === 'busy'} onClick={geocode} disabled={!form.values.address}>
          住所から座標を引く
        </Button>
        {lookup.state === 'hit' ? (
          <Alert color="teal" variant="light">この住所で引きました: {lookup.title ?? '（名称なし）'}。ずれていれば下に座標を貼って上書きできます。</Alert>
        ) : null}
        {lookup.state === 'miss' ? (
          <Alert color="orange" variant="light">見つかりませんでした。Google マップで場所を長押し→座標をコピーして、下の欄に貼ってください。</Alert>
        ) : null}
        <TextInput label="座標を手貼り（任意）" placeholder="35.123456, 139.123456" leftSection={<Crosshair size={16} aria-hidden />} {...form.getInputProps('coordsText')} value={form.values.coordsText ?? ''} />
        <Text size="xs" c="dimmed">{resolved ? `地図に出す位置: ${formatLatLng(resolved)}` : '座標が無いので地図には出ません（一覧と詳細には出ます）'}</Text>
        <Textarea label="メモ" autosize minRows={2} {...form.getInputProps('note')} value={form.values.note ?? ''} />
        <Button type="submit" loading={saving} fullWidth>保存</Button>
      </Stack>
    </form>
  )
}
```

- [ ] **Step 2: `PlaceLocation`（詳細ページの地図枠）**

**依存の順序**: `PlacesMapLazy` は Task 8 で作る。Task 7 の時点では下のコードの「座標あり」分岐を `<Text size="sm">座標: {formatLatLng({ lat: place.lat, lng: place.lng })}</Text>` にしておき、Task 8 の Step 3 が終わったら下のコードどおり `PlacesMapLazy` に差し替える（Task 8 のコミットに含める）。

```tsx
import { Card, Group, Text } from '@mantine/core'
import { MapPinOff } from 'lucide-react'

import type { Place } from '../../db/schema'
import { PlacesMapLazy } from '../map/PlacesMapLazy'

export function PlaceLocation({ place }: { place: Place }) {
  if (place.lat == null || place.lng == null) {
    return (
      <Card withBorder padding="md" bg="var(--mantine-color-default-hover)">
        <Group gap={8} wrap="nowrap">
          <MapPinOff size={16} aria-hidden />
          <Text size="sm" c="dimmed">
            {place.address ? '住所から座標を引けていないため地図を出せません。編集して座標を貼ってください。' : '住所も座標も登録されていないため地図を出せません。'}
          </Text>
        </Group>
      </Card>
    )
  }
  return (
    <div style={{ height: 240, borderRadius: 'var(--mantine-radius-lg)', overflow: 'hidden' }}>
      <PlacesMapLazy markers={[{ id: place.id, name: place.name, lat: place.lat, lng: place.lng, visited: true }]} focusId={place.id} />
      {place.geocodeSource === 'manual' ? <Text size="xs" c="dimmed">座標は手貼り（{place.coordsText}）</Text> : null}
    </div>
  )
}
```

- [ ] **Step 3: `src/routes/places.$id.tsx`**

名前・種別・住所・業者/物件へのリンク・`PlaceLocation`・メモ・編集（`FormDrawer`+`PlaceForm`）・削除（`deletePlace` が `{ ok:false, reason:'has_visits' }` を返したら「見学記録があるため消せません」と通知）。`loader` は `Promise.all([getPlace({ data: { id } }), listLinkTargets()])`。

- [ ] **Step 4: 業者／物件の詳細に「場所を追加」**

`candidates.vendors.$id.tsx` の「場所」見出しの右に `Button variant="default" size="xs"` → `FormDrawer` + `PlaceForm defaults={{ vendorId: vendor.id }}`。`loader` に `listLinkTargets()` を足す。物件側も同様に `propertyId`。

- [ ] **Step 5: 動作確認・検証・コミット**

Playwright（390×844）: 業者詳細→場所を追加→住所「東京都千代田区丸の内1丁目」→「住所から座標を引く」→ヒットの Alert→保存→場所詳細に地図が出る。もう 1 件は住所を空で座標手貼り `35.5, 139.5`。3 件目は住所も座標も無し→「地図を出せません」の文言。

```bash
npm run generate-routes && npm run typecheck && npm run test:coverage && npm run format:check && npm run build
git add -A
git commit -m "feat(places): 場所の登録（住所→座標／手貼り）と詳細ページ

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: 地図タブ（Leaflet + 地理院タイル）

**Files:**
- Create: `src/components/map/PlacesMap.tsx` `src/components/map/PlacesMapLazy.tsx` `src/components/map/PlaceSheet.tsx` `src/lib/mapMarkers.ts` `src/lib/mapMarkers.test.ts`
- Modify: `src/routes/map.tsx` `src/lib/securityHeaders.ts` `src/lib/securityHeaders.test.ts` `src/styles.css`

**Interfaces:**
- Consumes: `listPlaces` → `PlaceWithLinks[]`（Task 4）
- Produces: `PlacesMap({ markers: MapMarker[]; focusId?: string | null; onSelect?: (id) => void })`（クライアント専用）、`PlacesMapLazy`（同 props。SSR では Skeleton）、`type MapMarker = { id: string; name: string; lat: number; lng: number; visited: boolean; subtitle?: string }`、`toMarkers(places: PlaceWithLinks[]): MapMarker[]`、`boundsOf(markers): [[south, west],[north, east]] | null`

- [ ] **Step 1: `src/lib/mapMarkers.test.ts` → `mapMarkers.ts`（TDD）**

```ts
// mapMarkers.test.ts
import { describe, expect, it } from 'vitest'
import { boundsOf, toMarkers } from './mapMarkers'

const base = { kind: 'showroom', address: null, coordsText: null, geocodeSource: null, vendorId: null, propertyId: null, note: null, createdBy: 'owner@example.com', createdAt: '', updatedAt: '', propertyName: null } as const

describe('toMarkers', () => {
  it('座標のある場所だけをマーカーにし、業者名を subtitle にする', () => {
    const rows = [
      { ...base, id: 'a', name: 'A', lat: 35, lng: 139, vendorName: '甲工務店', visited: true },
      { ...base, id: 'b', name: 'B', lat: null, lng: null, vendorName: null, visited: false },
    ]
    expect(toMarkers(rows)).toEqual([{ id: 'a', name: 'A', lat: 35, lng: 139, visited: true, subtitle: '甲工務店' }])
  })
})
describe('boundsOf', () => {
  it('全マーカーを含む矩形。0 件は null、1 件は点', () => {
    expect(boundsOf([])).toBeNull()
    expect(boundsOf([{ id: 'a', name: 'A', lat: 35, lng: 139, visited: false }])).toEqual([[35, 139], [35, 139]])
    expect(boundsOf([
      { id: 'a', name: 'A', lat: 35, lng: 139, visited: false },
      { id: 'b', name: 'B', lat: 36, lng: 138, visited: false },
    ])).toEqual([[35, 138], [36, 139]])
  })
})
```

```ts
// mapMarkers.ts
import type { PlaceWithLinks } from '../server/repository'

export type MapMarker = { id: string; name: string; lat: number; lng: number; visited: boolean; subtitle?: string }

export function toMarkers(places: readonly PlaceWithLinks[]): MapMarker[] {
  const out: MapMarker[] = []
  for (const p of places) {
    if (p.lat == null || p.lng == null) continue
    const subtitle = p.vendorName ?? p.propertyName ?? undefined
    out.push({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, visited: p.visited, ...(subtitle ? { subtitle } : {}) })
  }
  return out
}

export function boundsOf(markers: readonly MapMarker[]): [[number, number], [number, number]] | null {
  if (markers.length === 0) return null
  let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity
  for (const m of markers) {
    south = Math.min(south, m.lat); north = Math.max(north, m.lat)
    west = Math.min(west, m.lng); east = Math.max(east, m.lng)
  }
  return [[south, west], [north, east]]
}
```

`src/lib/mapMarkers.ts` は `PlaceWithLinks` の型だけを `../server/repository` から import する（型 import は実行時依存にならないので lib の純粋性を崩さない。`import type` を必ず使う）。

- [ ] **Step 2: `PlacesMap.tsx`（`lifeplan-me/src/components/dashboard/AtlasMap.tsx` を下敷きに）**

```tsx
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'

import { boundsOf, type MapMarker } from '../../lib/mapMarkers'

const GSI_PALE = 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'
const ATTRIBUTION = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>'

function pinIcon(visited: boolean, active: boolean): L.DivIcon {
  return L.divIcon({
    className: 'place-pin-wrap',
    html: `<div class="place-pin${visited ? ' visited' : ''}${active ? ' active' : ''}"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
  })
}

export function PlacesMap({ markers, focusId = null, onSelect }: { markers: MapMarker[]; focusId?: string | null; onSelect?: (id: string) => void }) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<Map<string, L.Marker>>(new Map())
  const onSelectRef = useRef(onSelect)
  useEffect(() => { onSelectRef.current = onSelect })

  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    const map = L.map(elRef.current, { zoomControl: false, minZoom: 4, maxZoom: 18 })
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.tileLayer(GSI_PALE, { maxZoom: 18, maxNativeZoom: 18, attribution: ATTRIBUTION }).addTo(map)
    mapRef.current = map
    const t = setTimeout(() => map.invalidateSize(), 0)
    return () => { clearTimeout(t); map.remove(); mapRef.current = null; layerRef.current.clear() }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    for (const m of layerRef.current.values()) m.remove()
    layerRef.current.clear()
    for (const m of markers) {
      const marker = L.marker([m.lat, m.lng], { icon: pinIcon(m.visited, m.id === focusId) }).addTo(map)
      marker.bindTooltip(m.name, { direction: 'top', offset: [0, -20] })
      marker.on('click', () => onSelectRef.current?.(m.id))
      layerRef.current.set(m.id, marker)
    }
    const b = boundsOf(markers)
    if (!b) map.setView([35.68, 139.69], 9)
    else if (markers.length === 1) map.setView(b[0], 15)
    else map.fitBounds(b, { padding: [24, 24] })
  }, [markers, focusId])

  return <div ref={elRef} className="places-map" role="region" aria-label="場所の地図" />
}
```

`src/styles.css` にピンの見た目を足す:

```css
.place-pin { width: 22px; height: 22px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: var(--mantine-color-gray-4); border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.35); }
.place-pin.visited { background: var(--mantine-color-clay-6); }
.place-pin.active { transform: rotate(-45deg) scale(1.25); border-color: var(--mantine-color-yellow-4); }
```

- [ ] **Step 3: `PlacesMapLazy.tsx`（SSR で Leaflet を評価しない）**

```tsx
import { Skeleton } from '@mantine/core'
import { ClientOnly } from '@tanstack/react-router'
import { lazy, Suspense, type ComponentProps } from 'react'

const Inner = lazy(() => import('./PlacesMap').then((m) => ({ default: m.PlacesMap })))

export function PlacesMapLazy(props: ComponentProps<typeof Inner>) {
  return (
    <ClientOnly fallback={<Skeleton h="100%" mih={200} />}>
      <Suspense fallback={<Skeleton h="100%" mih={200} />}>
        <Inner {...props} />
      </Suspense>
    </ClientOnly>
  )
}
```

`@tanstack/react-router` に `ClientOnly` が無いバージョンなら、`useEffect` で `mounted` を立てる自前の `ClientOnly` を同ファイルに書く。

- [ ] **Step 4: `PlaceSheet.tsx` と `src/routes/map.tsx`**

`map.tsx`: `loader: () => listPlaces()`。画面は `PageShell` を使わず高さいっぱい（`calc(100dvh - 52px - 64px - env(safe-area-inset-bottom))`、sm 以上は `calc(100dvh - 52px)`）の `PlacesMapLazy`。上に `SegmentedControl`「すべて / 行った / 予定だけ」。ピンを押すと `PlaceSheet`（Mantine `Drawer position="bottom" size="auto"`）に名前・種別・業者名・住所・「詳細を見る」リンク。右上に「現在地」`ActionIcon`（`navigator.geolocation.getCurrentPosition` → `focus` を現在地に。拒否されたら通知）。座標が無い場所の件数を「地図に出せない場所が N 件（一覧で確認）」として上部に出す。FAB「場所を追加」→ `FormDrawer` + `PlaceForm`（`listLinkTargets` を loader に含める）。

- [ ] **Step 5: CSP と Permissions-Policy**

`src/lib/securityHeaders.ts`:

```ts
'permissions-policy': 'camera=(), microphone=(), geolocation=(self), payment=()',
'content-security-policy':
  "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; img-src 'self' data: blob: https://i.ytimg.com https://cyberjapandata.gsi.go.jp; connect-src 'self'",
```

`securityHeaders.test.ts` に「img-src に地理院タイルと i.ytimg.com が含まれる」「geolocation は self」を足す。`kousan-admin` の CSP は `frame-ancestors/object-src/base-uri` だけなので、`img-src`/`connect-src` を足しても Vite/Mantine のインラインは壊れない（`script-src`/`style-src` は書かない）。

- [ ] **Step 6: 動作確認・検証・コミット**

Playwright（390×844）: 地図タブに Task 7 で作った 2 件のピン（行った=塗り／予定=枠）が出て、`fitBounds` で両方入る。ピン→シート→「詳細を見る」で `/places/$id`。「地図に出せない場所が 1 件」の表示。1280 幅でも崩れない。DevTools の Console に CSP 違反が無い。

```bash
npm run typecheck && npm run test:coverage && npm run format:check && npm run build
git add -A
git commit -m "feat(map): 地図タブ（Leaflet + 地理院タイル・現在地・下からのカード）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: 設定ページ

**Files:**
- Modify: `src/routes/settings.tsx`

**Interfaces:**
- Consumes: `getSettings` `saveHomeAreas`（Task 4）、`MemberChip`（Task 5）

- [ ] **Step 1: 画面**

`loader: () => getSettings()`。カード 3 枚: (1)「建築予定地」= `TextInput`（読点・カンマ区切り）＋保存。保存後に `notifications` で「照合に使う市区町村: …」。(2)「利用者」= `members` を `MemberChip` で並べ、自分に「あなた」バッジ。`MEMBERS` が空なら「secret MEMBERS が未設定です（README 参照）」の Alert。(3)「環境」= `environment`・写真保管(R2)の有無・アプリのバージョン（`package.json` の version を `import.meta.env` ではなく `__APP_VERSION__` で埋める必要は無い。単に環境名だけでよい）。

- [ ] **Step 2: 動作確認・検証・コミット**

Playwright: 「テスト市」を保存→候補タブの「建築予定地が施工エリア内」スイッチが有効化され、`serviceAreas` に「テスト市」を持つ業者だけ残る。

```bash
npm run typecheck && npm run test:coverage && npm run format:check && npm run build
git add -A
git commit -m "feat(settings): 建築予定地・利用者・環境の設定ページ

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Cloudflare の資源・Access・secret・Keyway・初回デプロイ

このタスクは手元の CLI とダッシュボード操作を含む。**妻の Gmail アドレスが要る**（未取得なら、本人のアドレスだけで先に通し、後から Access ポリシーと secret に足す）。

**Files:**
- Modify: `wrangler.jsonc`（database_id / ACCESS_TEAM_DOMAIN / ACCESS_POLICY_AUD）、`README.md`（本番手順）

- [ ] **Step 1: D1 と R2**

```bash
npx wrangler d1 create sumai-log            # 出力の database_id を wrangler.jsonc に貼る
npx wrangler r2 bucket create sumai-log-photos
npm run db:migrate:remote
```

- [ ] **Step 2: 初回デプロイ（Access 前。secret が無いので allowlist 空＝全拒否になる）**

```bash
npm run deploy
curl -s -o /dev/null -w '%{http_code}\n' https://sumai-log.saitotakuya0719.workers.dev/   # 403（misconfigured → 拒否）
```

- [ ] **Step 3: Cloudflare Access アプリ（ダッシュボード）**

Zero Trust → Access → Applications → Add → Self-hosted:
- Application name: `sumai-log`／Session duration: **1 month**／Application domain: `sumai-log.saitotakuya0719.workers.dev`
- Identity providers: 既設の Google だけを選ぶ
- Policy: Allow / Include → Emails → 二人のアドレス
- 作成後の Overview で **Application Audience (AUD) Tag** をコピー
- `wrangler.jsonc` の `ACCESS_TEAM_DOMAIN` を `https://odd-bush-1f0d.cloudflareaccess.com`、`ACCESS_POLICY_AUD` を AUD に置き換える

- [ ] **Step 4: secret と `.dev.vars`（実値）**

```bash
# .dev.vars に実際のメールと MEMBERS を入れる（.dev.vars.example を元に。gitignore 済み）
printf '%s' 'a@example.com,b@example.com' | npx wrangler secret put ACCESS_ALLOWED_EMAILS   # 実値に置き換える
printf '%s' 'a@example.com:名前:teal,b@example.com:名前:pink' | npx wrangler secret put MEMBERS
npx wrangler secret list        # 2 件（名前だけ。値の正しさはログインして確かめる）
npm run deploy
```

`printf '%s'` は末尾改行を入れないため（`echo` だと改行が値に混ざる）。引用符も入れない。

- [ ] **Step 5: 認証の実確認**

- シークレットウィンドウで `https://sumai-log.saitotakuya0719.workers.dev/` → Access のログイン画面 → Google → ホームが出る
- `curl` で JWT なし → Access のリダイレクト（302）またはブロック。**Worker 直叩きは無い**（workers.dev は Access の前段でしか到達できない）
- 許可外の Google アカウント（別ブラウザ）で → Access が拒否
- 設定ページで自分の表示名と色が `MEMBERS` どおりに出る

- [ ] **Step 6: Keyway**

```bash
cd /Users/saitoutakuya/src/github.com/tktk7l9/sumai-log
keyway init                                      # .env を作るので消す
rm -f .env
keyway push -e development -f .dev.vars -y
# 本番の控え: 本番値だけの一時ファイルを作って push し、すぐ消す
printf 'ENVIRONMENT=production\nACCESS_ALLOWED_EMAILS=%s\nMEMBERS=%s\n' '<実値>' '<実値>' > .dev.vars.production
keyway push -e production -f .dev.vars.production -y
rm .dev.vars.production
git check-ignore -q .dev.vars && git check-ignore -q .env.production && echo ignored
keyway pull -e development -f /tmp/keyway-check -y 2>/dev/null || true   # 絶対パスは失敗する既知の癖。相対で:
keyway pull -e development -f .dev.vars.pulled -y && diff -q .dev.vars .dev.vars.pulled && rm .dev.vars.pulled
```

`keyway init` が README にバッジを足したらそのままコミットしてよい（秘密は含まない）。

- [ ] **Step 7: Workers Builds（ダッシュボード）**

Workers & Pages → sumai-log → Settings → Build → Connect to GitHub → `tktk7l9/sumai-log` / branch `main` / Build command `npm run build` / Deploy command `npx wrangler deploy`。接続後に空コミットを push し、`npx wrangler deployments list` の先頭 `Created` が push 時刻（UTC）と一致することを確認する（無音で止まる前例があるため）。

- [ ] **Step 8: README の本番手順を上の内容で書き、コミット**

```bash
git add -A
git commit -m "chore(deploy): Access・secret・Keyway・Workers Builds の手順と本番設定

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

### Task 11: 実データの取り込み（seed.local.json → D1 / R2）

`seed.local.json`（gitignore 済み）に本人が渡した実データが入っている: 業者 4・場所 4・予定 4・見学記録 3（写真 4 枚 = `seed.local/photos/*.HEIC`）・YouTube 5。予定・見学記録・動画の UI は Phase 2/3 だが、テーブルは Task 2 で作ったので今入れる。

**Files:**
- Create: `scripts/import-seed.mjs` `scripts/lib/seed.mjs`（純粋部分）`scripts/lib/seed.test.mjs`
- Modify: `package.json`（`"import:seed": "node scripts/import-seed.mjs"`、`"test"` に `node --test scripts/lib/` を足す）

**Interfaces:**
- Consumes: `wrangler d1 execute sumai-log --remote --command` / `--local`、`wrangler r2 object put`、macOS `sips`
- Produces: `buildStatements(seed, { actorEmail, now }) → { sql: string[]; photos: { visitSlug, src, photoId }[] }`（純粋。slug→id は決定的に `uuid v5` 相当…ではなく、**slug から id を引く `slugToId(slug)`** = `crypto.createHash('sha256').update('sumai-log:' + slug).digest('hex')` の先頭 32 桁を UUID 形式に整形。同じ slug は何度取り込んでも同じ id になり、`INSERT OR REPLACE` で冪等）

- [ ] **Step 1: `scripts/lib/seed.mjs`（純粋）と `node --test` のテスト**

`buildStatements` は seed の各配列を SQL 文字列（`INSERT OR REPLACE INTO ...`）に変換する。値のエスケープは `'` を `''` に。`serviceAreas`/`tags` は `JSON.stringify`。`events.startsAt` はそのまま、`visits.eventId/placeId/vendorId` は slug→id。`photos` 行は `{ id: slugToId(visitSlug + ':' + basename), visitId, displayKey: photos/<visitId>/<photoId>-display.jpg, thumbKey: ...-thumb.jpg, width, height, sortOrder }` を返し、SQL は写真の実寸を知ってから（Step 3）作る。`settings.homeAreas` は `INSERT OR REPLACE INTO settings (key, value) VALUES ('homeAreas', '["…"]')`。

テスト（`scripts/lib/seed.test.mjs`、架空データのみ）: `slugToId` が決定的で UUID 形式／`'` がエスケープされる／未知の slug 参照はエラー／`photos` が visit ごとに sortOrder 0,1,… になる。

- [ ] **Step 2: `scripts/import-seed.mjs`**

```
node scripts/import-seed.mjs [--local|--remote] [--dry-run]
```

1. `.dev.vars` から `DEV_IDENTITY_EMAIL` を読んで `actorEmail` にする（作成者は本人）
2. `seed.local.json` を読み、`buildStatements` で SQL を作る
3. 写真: `seed.local/photos/<name>.HEIC` を `sips -s format jpeg -s formatOptions 80 -Z 1600 <src> --out seed.local/out/<photoId>-display.jpg` と `-Z 400 … -thumb.jpg` で変換。`sips -g pixelWidth -g pixelHeight` で display の実寸を取り、photos 行の SQL を作る
4. `--dry-run` なら SQL と R2 のキー一覧を出して終了
5. `--remote` なら `npx wrangler r2 object put sumai-log-photos/<key> --file <path> --content-type image/jpeg` を写真ごとに実行（`--local` はローカル R2 に put: `--local` フラグ）
6. SQL を 1 ファイルにまとめて `npx wrangler d1 execute sumai-log --remote --file <tmp.sql>`（`--local` なら `--local`）
7. 取り込み後に `SELECT count(*)` を各テーブルで出して表示

`sips` は macOS 専用。他 OS で走らせたら「写真は変換できないので飛ばす」と出して SQL だけ流す。

- [ ] **Step 3: ローカルで取り込み → 画面で確認 → 本番へ**

```bash
npm run import:seed -- --local --dry-run
npm run import:seed -- --local
npm run dev   # 候補タブに業者 4 件（1 件は「建築予定地が施工エリア内」）、地図に 4 ピン（3 つは行った=塗り、1 つは予定=枠）
npm run import:seed -- --remote
```

本番の画面で同じ表示になること、`/api/photos/...`（Phase 2 で作る）はまだ無いので写真は D1 と R2 に入っただけでよい。R2 のキー数 = 8（4 枚 × display/thumb）。

- [ ] **Step 4: コミット（スクリプトとテストのみ。seed と写真は gitignore 済み）**

```bash
npm run check:pii && npm run format:check
git add scripts package.json
git commit -m "feat(seed): seed.local.json から D1/R2 へ取り込むスクリプト（冪等・HEIC は sips で変換）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

## Phase 1 完了の確認

- `npm run format:check` `typecheck` `test:coverage`（lib 100%）`test:server` `build` `check:pii` が green、CI が green
- 本番で: Access ログイン → 候補 4 件・地図 4 ピン・設定に建築予定地（seed の値）
- 妻のアカウントでログインできる（メール取得後）
- `git ls-files | grep -E 'seed.local|\.dev\.vars$|\.env'` が空（`.dev.vars.example` 以外）
- 次: `docs/superpowers/plans/2026-09-XX-sumai-log-phase2.md`（予定・見学記録・写真・コメント）を writing-plans で作る
