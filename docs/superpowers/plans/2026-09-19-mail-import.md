# メール取込 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `news@sumai-log.app` に転送された業者のメルマガを Worker の `email` ハンドラで受け、既存の「お知らせ」（`vendor_news`）として表示・予定化できるようにする。過去分は mbox から SQL を生成して入れる。

**Architecture:** 判定・変換はすべて純粋関数（`src/lib/mail/*`、100% カバレッジ）。Worker の `email` ハンドラ（`src/server.ts` → `src/server/mailHandler.ts`）は「読む → 判定 → `inbound_mails` に記録 → 業者が決まれば `vendor_news` に変換」だけ。設定ページで未割当メールに業者を割り当てる。メール由来のお知らせは `url = 'mail:<messageId>'` で見分け、ドロワーで本文を表示する。

**Tech Stack:** Cloudflare Email Routing + Email Workers、`postal-mime`（MIME 解析。新規依存）、Drizzle/D1、TanStack Start server fn、Mantine、vitest（Node と workers pool）、`tsx`（一回きりの mbox 取込スクリプト用。devDependency）。

**Spec:** `docs/superpowers/specs/2026-09-19-mail-import-design.md`

## Global Constraints

- 実データ・PII（メールアドレス・氏名・実在の業者名/ドメイン）をコード・テスト・fixture に書かない。テストは `example.com` 系の架空値。コミット前フックの `npm run check:pii` を通す（本名の 2 文字も引っかかる）。
- `src/lib/**` はカバレッジ 100%（`npm run test:coverage` のゲート）。新しい lib ファイルはすべてテストを付ける。
- 新規依存は `postal-mime@^3` と devDependency の `tsx@^4` だけ。インストールは `npx npm@11 install <pkg>`（npm 10 の arborist が落ちるため）。
- `ctx.waitUntil` は使わない（例外が消える）。`email` ハンドラは処理完了まで await。
- Worker のログに本文・アドレス全体を出さない（status・差出人ドメイン・件名の先頭 40 字まで）。
- 日付表示は `formatDateWithWeekday`/`formatDateSlash`（`/` 区切り）。DB のキーは `YYYY-MM-DD`。
- コミットメッセージ末尾に `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。
- ブランチ `mail-import` で作業（仕様書のコミット 6ba429d が先頭にある）。

---

## ファイル構成

| ファイル | 責務 |
| --- | --- |
| `src/db/schema.ts`（変更） | `inboundMails` テーブル・`vendors.newsEmailDomain`・`vendorNews.mailId`・`INBOUND_STATUSES` |
| `drizzle/migrations/0009_inbound_mails.sql`（生成） | 上のマイグレーション |
| `src/lib/mail/match.ts` | 差出人ドメインの正規化と業者照合 |
| `src/lib/mail/forwarded.ts` | Gmail 手動転送ブロックの解析 |
| `src/lib/mail/parse.ts` | postal-mime の結果 → `ParsedMail`（本文テキスト化・上限・Message-ID 代替） |
| `src/lib/mail/route.ts` | 経路判定（自動転送 / 手動転送 / システム / 拒否） |
| `src/lib/mail/toNews.ts` | 受信メール → `vendor_news` 行の変換。`mail:` URL の判定 |
| `src/lib/mail/mbox.ts` | mbox の分割（スクリプト用の純粋関数） |
| `src/server/repository/mails.ts` | `inbound_mails` の insert / list / 取込 / 削除 / 掃除 |
| `src/server/mailHandler.ts` | `handleInboundMail(message, db, allowlist)`（Worker の `email` から呼ぶ） |
| `src/server/mails.schema.ts` / `src/server/mails.ts` | 設定ページ・ドロワー用 server fn |
| `src/server.ts`（変更） | `email` ハンドラ追加・`scheduled` に掃除を追加 |
| `src/server/candidates.ts` / `src/components/candidates/VendorForm.tsx` / `src/routes/candidates_.vendors.$id.tsx`（変更） | 業者の「メールの差出人ドメイン」 |
| `src/components/settings/MailImportCard.tsx` / `src/routes/settings.tsx`（変更） | 設定「メール取込」カード |
| `src/components/news/NewsEventDrawer.tsx` / `NewsAgenda.tsx`（変更） | メール由来の表示（バッジ・本文） |
| `scripts/import-mbox.ts` | 過去分 mbox → `seed.local/out/mails.sql` |
| `wrangler.jsonc` / `worker-configuration.d.ts` / `README.md` / `src/content/changelog.ts`（変更） | var `MAIL_INBOX_ADDRESS`・手順・変更履歴 |

---

### Task 1: 依存・スキーマ・マイグレーション・env

**Files:**

- Modify: `package.json`（依存追加は npm コマンドで）
- Modify: `src/db/schema.ts`
- Create: `drizzle/migrations/0009_inbound_mails.sql`（`npm run db:generate` が生成）
- Modify: `src/server/repository/test-helpers.ts:14-27`（reset の対象に `inbound_mails`）
- Modify: `wrangler.jsonc:47-52`（vars に `MAIL_INBOX_ADDRESS`）
- Modify: `worker-configuration.d.ts`（`npm run cf-typegen` で再生成）
- Test: `src/server/repository/mails.worker-test.ts`（このタスクではテーブルが存在することだけ確認）

**Interfaces:**

- Produces: `inboundMails` テーブル（型 `InboundMail`/`NewInboundMail`）、`INBOUND_STATUSES`・`InboundStatus`、`vendors.newsEmailDomain: string | null`、`vendorNews.mailId: string | null`、`Env.MAIL_INBOX_ADDRESS: string`

- [ ] **Step 1: 依存を入れる**

```bash
cd ~/src/github.com/tktk7l9/sumai-log && git checkout mail-import
npx npm@11 install postal-mime@^3 --no-audit --no-fund
npx npm@11 install -D tsx@^4 --no-audit --no-fund
grep -n '"postal-mime"\|"tsx"' package.json
```

Expected: 両方が package.json に載る。

- [ ] **Step 2: スキーマを足す**

`src/db/schema.ts` の `vendors` の `newsFetchError` 列の直後（`/** 代表者の顔写真` の前）に追加:

```ts
    /** メール取込（design 2026-09-19）: メルマガの差出人ドメイン。カンマ区切り・小文字。
     * 一致（完全一致またはサブドメイン）したメールをこの業者のお知らせにする */
    newsEmailDomain: text('news_email_domain'),
```

`vendorNews` の `plannedEventId` の直後に追加（`inboundMails` は後で宣言するので遅延参照）:

```ts
    /** メール由来のお知らせ。本文は inbound_mails.body_text にある（二重保存しない） */
    mailId: text('mail_id').references((): AnySQLiteColumn => inboundMails.id, {
      onDelete: 'set null',
    }),
```

ファイル先頭の import を変更:

```ts
import { index, integer, real, sqliteTable, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
```

`vendorNews` の定義の直後に追加:

```ts
export const INBOUND_STATUSES = ['imported', 'unassigned', 'rejected', 'system'] as const
export type InboundStatus = (typeof INBOUND_STATUSES)[number]
export const INBOUND_STATUS_LABEL: Record<InboundStatus, string> = {
  imported: '取込',
  unassigned: '未割当',
  rejected: '拒否',
  system: 'システム',
}

/**
 * news@ に届いたメールの全記録（設計 2026-09-19 §4）。未割当の置き場と受信ログを兼ねる。
 * 人ではなく Worker が作るので created_by は持たない。
 */
export const inboundMails = sqliteTable(
  'inbound_mails',
  {
    id: id(),
    /** 元メールの Message-ID（<> 付き）。無ければ 'hash:<sha256>' */
    messageId: text('message_id').notNull().unique(),
    /** 受信時刻 ISO-8601 */
    receivedAt: text('received_at').notNull(),
    /** 元の差出人（手動転送なら転送ブロックの From） */
    fromAddress: text('from_address').notNull(),
    /** 経路: 自動転送なら X-Forwarded-For の元アドレス、手動転送なら From、mbox 取込なら 'mbox' */
    forwardedBy: text('forwarded_by'),
    subject: text('subject').notNull(),
    /** 元メールの日付 YYYY-MM-DD（JST）。無ければ null */
    sentOn: text('sent_on'),
    /** rejected は null（本文を保存しない） */
    bodyText: text('body_text'),
    bodyTruncated: integer('body_truncated', { mode: 'boolean' }).notNull().default(false),
    status: text('status', { enum: INBOUND_STATUSES }).notNull(),
    rejectReason: text('reject_reason'),
    vendorId: text('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    newsId: text('news_id').references((): AnySQLiteColumn => vendorNews.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('inbound_mails_status_received_idx').on(t.status, t.receivedAt)],
)
```

ファイル末尾の型エクスポート群（`export type VendorNews = ...` の近く）に追加:

```ts
export type InboundMail = typeof inboundMails.$inferSelect
export type NewInboundMail = typeof inboundMails.$inferInsert
```

- [ ] **Step 3: マイグレーションを生成して中身を確認**

```bash
npm run db:generate -- --name inbound_mails
cat drizzle/migrations/0009_inbound_mails.sql
```

Expected: `CREATE TABLE \`inbound_mails\``（列 12 + created_at/updated_at）、`CREATE INDEX \`inbound_mails_status_received_idx\``、`ALTER TABLE \`vendors\` ADD \`news_email_domain\` text;`、`ALTER TABLE \`vendor_news\` ADD \`mail_id\` text REFERENCES inbound_mails(id);` の 4 文。もし drizzle-kit が `vendor_news` の作り直し（`__new_vendor_news`）を提案したら、生成 SQL を上の 4 文だけに手で置き換える（既存データを守る。`meta/_journal.json` と `meta/0009_snapshot.json` はそのまま）。

- [ ] **Step 4: テストの reset とローカル D1 に反映**

`src/server/repository/test-helpers.ts` の配列に `'vendor_news'` の**前**に `'inbound_mails'` を足す:

```ts
    'sources',
    'places',
    'inbound_mails',
    'vendor_news',
```

```bash
npm run db:migrate:local
```

- [ ] **Step 5: wrangler var と Env 型**

`wrangler.jsonc` の `vars` に追加（`ACCESS_POLICY_AUD` の行の後）:

```jsonc
    // メール取込（設計 2026-09-19）。転送先アドレス。非秘密（設定ページに表示する）
    "MAIL_INBOX_ADDRESS": "news@sumai-log.app",
```

```bash
npm run cf-typegen
grep -n "MAIL_INBOX_ADDRESS" worker-configuration.d.ts
```

Expected: `MAIL_INBOX_ADDRESS: "news@sumai-log.app";` が Env に入る。

- [ ] **Step 6: テーブルが存在するテスト**

`src/server/repository/mails.worker-test.ts`:

```ts
import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import { reset } from './test-helpers'

beforeEach(reset)

describe('inbound_mails', () => {
  it('テーブルと列がある', async () => {
    const { results } = await env.DB.prepare('PRAGMA table_info(inbound_mails)').all()
    const names = results.map((r) => (r as { name: string }).name)
    expect(names).toEqual(
      expect.arrayContaining(['message_id', 'status', 'body_text', 'vendor_id', 'news_id']),
    )
    const vn = await env.DB.prepare('PRAGMA table_info(vendor_news)').all()
    expect(vn.results.map((r) => (r as { name: string }).name)).toContain('mail_id')
  })
})
```

```bash
npx vitest run --config vitest.workers.config.ts src/server/repository/mails.worker-test.ts
npm run typecheck
```

Expected: PASS、型エラー 0。

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/db/schema.ts drizzle/migrations src/server/repository/test-helpers.ts src/server/repository/mails.worker-test.ts wrangler.jsonc worker-configuration.d.ts
git commit -m "feat(db): メール取込の inbound_mails と vendors.news_email_domain / vendor_news.mail_id（migration 0009）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: lib/mail/match.ts — ドメインの正規化と業者照合

**Files:**

- Create: `src/lib/mail/match.ts`
- Test: `src/lib/mail/match.test.ts`

**Interfaces:**

- Produces:
  - `normalizeDomains(input: string | null | undefined): string | null` — フォーム入力 `'A.com, @Mail.b.com '` → `'a.com,mail.b.com'`。空なら null。
  - `splitDomains(stored: string | null | undefined): string[]`
  - `domainOf(address: string): string | null` — `'Name <x@Y.com>'` でも `'x@y.com'` でも `'y.com'`。
  - `domainMatches(domain: string, registered: string): boolean` — 完全一致またはサブドメイン。
  - `matchVendorByDomain<T extends { newsEmailDomain: string | null }>(fromAddress: string, vendors: readonly T[]): T | null`

- [ ] **Step 1: 失敗するテスト**

`src/lib/mail/match.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  domainMatches,
  domainOf,
  matchVendorByDomain,
  normalizeDomains,
  splitDomains,
} from './match'

describe('normalizeDomains', () => {
  it('小文字化・空白除去・@ の右だけ・重複除去。空は null', () => {
    expect(normalizeDomains(' A.com, @Mail.B.com ,info@c.com,a.com ')).toBe('a.com,mail.b.com,c.com')
    expect(normalizeDomains('')).toBeNull()
    expect(normalizeDomains(' , ')).toBeNull()
    expect(normalizeDomains(null)).toBeNull()
    expect(normalizeDomains(undefined)).toBeNull()
  })
  it('改行区切りも受ける', () => {
    expect(normalizeDomains('a.com\nb.com')).toBe('a.com,b.com')
  })
})

describe('splitDomains', () => {
  it('カンマ区切りを配列に。null は空', () => {
    expect(splitDomains('a.com,b.com')).toEqual(['a.com', 'b.com'])
    expect(splitDomains(null)).toEqual([])
    expect(splitDomains('')).toEqual([])
  })
})

describe('domainOf', () => {
  it('表示名付き・大文字・空白を吸収する', () => {
    expect(domainOf('Some One <Some@Example.COM>')).toBe('example.com')
    expect(domainOf('  x@y.com ')).toBe('y.com')
  })
  it('@ が無い・空なら null', () => {
    expect(domainOf('nobody')).toBeNull()
    expect(domainOf('')).toBeNull()
    expect(domainOf('x@')).toBeNull()
  })
})

describe('domainMatches', () => {
  it('完全一致とサブドメインだけ一致する', () => {
    expect(domainMatches('example.com', 'example.com')).toBe(true)
    expect(domainMatches('mail.example.com', 'example.com')).toBe(true)
    expect(domainMatches('notexample.com', 'example.com')).toBe(false)
    expect(domainMatches('example.com', 'mail.example.com')).toBe(false)
  })
})

describe('matchVendorByDomain', () => {
  const vendors = [
    { id: 'a', newsEmailDomain: 'a.com,news.a.jp' },
    { id: 'b', newsEmailDomain: null },
    { id: 'c', newsEmailDomain: 'c.com' },
  ]
  it('最初に一致した業者を返す', () => {
    expect(matchVendorByDomain('x@mail.news.a.jp', vendors)?.id).toBe('a')
    expect(matchVendorByDomain('Y <y@C.com>', vendors)?.id).toBe('c')
  })
  it('一致しない・差出人が読めないなら null', () => {
    expect(matchVendorByDomain('x@d.com', vendors)).toBeNull()
    expect(matchVendorByDomain('broken', vendors)).toBeNull()
  })
})
```

- [ ] **Step 2: 失敗を確認**

```bash
npx vitest run src/lib/mail/match.test.ts
```

Expected: FAIL（`./match` が無い）。

- [ ] **Step 3: 実装**

`src/lib/mail/match.ts`:

```ts
/**
 * メール取込（設計 2026-09-19 §3-5）: 差出人ドメインと業者の照合。純粋関数だけ。
 * 業者の `news_email_domain` はカンマ区切り・小文字で保存する（normalizeDomains）。
 */

const ADDRESS_IN_BRACKETS = /<([^<>]+)>/

/** 'Name <x@y.com>' / 'x@y.com' からアドレス部分を取り出して小文字にする */
function extractAddress(raw: string): string {
  const m = ADDRESS_IN_BRACKETS.exec(raw)
  return (m ? m[1] : raw).trim().toLowerCase()
}

/** アドレスの '@' の右側。無ければ null */
export function domainOf(address: string): string | null {
  const addr = extractAddress(address)
  const at = addr.lastIndexOf('@')
  if (at < 0) return null
  const domain = addr.slice(at + 1)
  return domain.length > 0 ? domain : null
}

/** フォーム入力をカンマ区切り・小文字・重複なしに正規化する。空なら null */
export function normalizeDomains(input: string | null | undefined): string | null {
  if (!input) return null
  const seen = new Set<string>()
  for (const part of input.split(/[,\n]/)) {
    const raw = part.trim().toLowerCase()
    if (!raw) continue
    const at = raw.lastIndexOf('@')
    const domain = at >= 0 ? raw.slice(at + 1) : raw
    if (domain) seen.add(domain)
  }
  return seen.size > 0 ? [...seen].join(',') : null
}

export function splitDomains(stored: string | null | undefined): string[] {
  if (!stored) return []
  return stored.split(',').filter((d) => d.length > 0)
}

/** 完全一致またはサブドメイン（'mail.example.com' は 'example.com' に一致） */
export function domainMatches(domain: string, registered: string): boolean {
  return domain === registered || domain.endsWith(`.${registered}`)
}

/** 差出人ドメインが登録ドメインに一致する最初の業者。無ければ null */
export function matchVendorByDomain<T extends { newsEmailDomain: string | null }>(
  fromAddress: string,
  vendors: readonly T[],
): T | null {
  const domain = domainOf(fromAddress)
  if (!domain) return null
  for (const v of vendors) {
    if (splitDomains(v.newsEmailDomain).some((r) => domainMatches(domain, r))) return v
  }
  return null
}
```

- [ ] **Step 4: 通ることを確認**

```bash
npx vitest run src/lib/mail/match.test.ts --coverage.enabled=false
```

Expected: PASS（12 件前後）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/mail/match.ts src/lib/mail/match.test.ts
git commit -m "feat(mail): 差出人ドメインの正規化と業者照合（lib/mail/match）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: lib/mail/forwarded.ts — Gmail 手動転送ブロックの解析

**Files:**

- Create: `src/lib/mail/forwarded.ts`
- Test: `src/lib/mail/forwarded.test.ts`

**Interfaces:**

- Produces:
  - `type ForwardedBlock = { from: string | null; date: string | null; subject: string | null; body: string }`（`date` は `YYYY-MM-DD` か null）
  - `splitForwardedBlock(text: string): ForwardedBlock | null` — 転送ブロックが無ければ null
  - `parseForwardedDate(raw: string): string | null` — Gmail の日付表記 → `YYYY-MM-DD`

- [ ] **Step 1: 失敗するテスト**

`src/lib/mail/forwarded.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { parseForwardedDate, splitForwardedBlock } from './forwarded'

const EN = `FYI

---------- Forwarded message ---------
From: Test Builder <news@example.com>
Date: Tue, Sep 16, 2026 at 10:05 AM
Subject: 完成見学会のご案内
To: <owner@example.com>


9月27日(土)・28日(日) 完成見学会を開催します。
場所は後日ご案内します。`

const JA = `---------- 転送メッセージ ---------
差出人: Test Builder <news@example.com>
日付: 2026年9月16日(火) 10:05
件名: 完成見学会のご案内
To: owner@example.com

本文です。`

describe('splitForwardedBlock', () => {
  it('英語 UI のブロックから差出人・日付・件名・本文を取り出す', () => {
    const b = splitForwardedBlock(EN)
    expect(b).toEqual({
      from: 'news@example.com',
      date: '2026-09-16',
      subject: '完成見学会のご案内',
      body: '9月27日(土)・28日(日) 完成見学会を開催します。\n場所は後日ご案内します。',
    })
  })
  it('日本語 UI の見出し語でも同じ', () => {
    const b = splitForwardedBlock(JA)
    expect(b?.from).toBe('news@example.com')
    expect(b?.date).toBe('2026-09-16')
    expect(b?.subject).toBe('完成見学会のご案内')
    expect(b?.body).toBe('本文です。')
  })
  it('ブロックが無ければ null', () => {
    expect(splitForwardedBlock('ただの本文')).toBeNull()
    expect(splitForwardedBlock('')).toBeNull()
  })
  it('ヘッダ行が欠けていても落ちない（無い項目は null）', () => {
    const b = splitForwardedBlock('---------- Forwarded message ---------\nSubject: x\n\nbody')
    expect(b).toEqual({ from: null, date: null, subject: 'x', body: 'body' })
  })
  it('空行が無くても本文が取れる（ヘッダ行が終わったところから）', () => {
    const b = splitForwardedBlock('---------- Forwarded message ---------\nFrom: a@b.com\nbody line')
    expect(b?.from).toBe('a@b.com')
    expect(b?.body).toBe('body line')
  })
})

describe('parseForwardedDate', () => {
  it('和暦なしの日本語表記', () => {
    expect(parseForwardedDate('2026年9月16日(火) 10:05')).toBe('2026-09-16')
  })
  it('英語表記（"at" 付き）', () => {
    expect(parseForwardedDate('Tue, Sep 16, 2026 at 10:05 AM')).toBe('2026-09-16')
  })
  it('読めなければ null', () => {
    expect(parseForwardedDate('someday')).toBeNull()
    expect(parseForwardedDate('')).toBeNull()
  })
})
```

- [ ] **Step 2: 失敗を確認**

```bash
npx vitest run src/lib/mail/forwarded.test.ts
```

Expected: FAIL（モジュールが無い）。

- [ ] **Step 3: 実装**

`src/lib/mail/forwarded.ts`:

```ts
/**
 * Gmail の「転送」が本文の先頭に付けるブロックを解析する（設計 2026-09-19 §3-3 手動転送）。
 *
 *   ---------- Forwarded message ---------   （日本語 UI: ---------- 転送メッセージ ---------）
 *   From: 名前 <addr>                         （差出人:）
 *   Date: ...                                 （日付:）
 *   Subject: ...                              （件名:）
 *   To: ...                                   （宛先: / To:）
 *   <空行>
 *   本文
 *
 * ブロックより上（転送した人のコメント）は捨てる。
 */

export type ForwardedBlock = {
  from: string | null
  /** YYYY-MM-DD。読めなければ null */
  date: string | null
  subject: string | null
  body: string
}

const MARKER = /^-{3,}\s*(Forwarded message|転送メッセージ)\s*-{3,}\s*$/m
const HEADER_LINE = /^(From|差出人|Date|日付|Subject|件名|To|宛先|Cc):\s*(.*)$/

const ADDRESS_IN_BRACKETS = /<([^<>]+)>/

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** '2026年9月16日(火) 10:05' / 'Tue, Sep 16, 2026 at 10:05 AM' → '2026-09-16' */
export function parseForwardedDate(raw: string): string | null {
  const ja = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(raw)
  if (ja) return `${ja[1]}-${pad(Number(ja[2]))}-${pad(Number(ja[3]))}`
  const ms = Date.parse(raw.replace(/\s+at\s+/, ' '))
  if (Number.isNaN(ms)) return null
  // 表記に時差が無いので、ローカル時刻として解釈した日付をそのまま使う
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function splitForwardedBlock(text: string): ForwardedBlock | null {
  const m = MARKER.exec(text)
  if (!m) return null
  const after = text.slice(m.index + m[0].length).replace(/^\r?\n/, '')
  const lines = after.split(/\r?\n/)

  let from: string | null = null
  let date: string | null = null
  let subject: string | null = null
  let i = 0
  for (; i < lines.length; i++) {
    const h = HEADER_LINE.exec(lines[i])
    if (!h) break
    const key = h[1]
    const value = h[2].trim()
    if (key === 'From' || key === '差出人') {
      const addr = ADDRESS_IN_BRACKETS.exec(value)
      from = (addr ? addr[1] : value).trim().toLowerCase() || null
    } else if (key === 'Date' || key === '日付') {
      date = parseForwardedDate(value)
    } else if (key === 'Subject' || key === '件名') {
      subject = value || null
    }
  }
  const body = lines.slice(i).join('\n').trim()
  return { from, date, subject, body }
}
```

- [ ] **Step 4: 通ることを確認**

```bash
npx vitest run src/lib/mail/forwarded.test.ts --coverage.enabled=false
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/mail/forwarded.ts src/lib/mail/forwarded.test.ts
git commit -m "feat(mail): Gmail 手動転送ブロックの解析（lib/mail/forwarded）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: lib/mail/parse.ts — postal-mime の結果を ParsedMail に

**Files:**

- Create: `src/lib/mail/parse.ts`
- Test: `src/lib/mail/parse.test.ts`

**Interfaces:**

- Consumes: `stripTags`（`src/lib/news/text.ts`）
- Produces:
  - `type ParsedMail = { messageId: string; from: string; subject: string; date: string | null; text: string; truncated: boolean; forwardedFor: string[] }`
  - `type RawParsed = { messageId?: string | null; from?: { address?: string | null } | null; subject?: string | null; date?: string | null; text?: string | null; html?: string | null; headers?: { key: string; value: string }[] }`（postal-mime の `Email` のうち使う部分。テストはこの形の素のオブジェクトで書ける）
  - `MAX_BODY_CHARS = 100_000`
  - `htmlToText(html: string): string` — 段落・改行を保ったテキスト化
  - `normalizeBody(text: string): { text: string; truncated: boolean }` — 空行の畳み込みと上限
  - `fallbackMessageId(from: string, subject: string, date: string | null): Promise<string>` — `'hash:' + sha256 hex`
  - `toParsedMail(email: RawParsed): Promise<ParsedMail>`

- [ ] **Step 1: 失敗するテスト**

`src/lib/mail/parse.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  MAX_BODY_CHARS,
  fallbackMessageId,
  htmlToText,
  normalizeBody,
  toParsedMail,
} from './parse'

describe('htmlToText', () => {
  it('br / p / div / li / tr の区切りを改行にし、タグと実体参照を落とす', () => {
    const html = '<p>見学会の<b>ご案内</b>&amp;地図</p><div>9月27日<br>10時</div><ul><li>A</li><li>B</li></ul>'
    expect(htmlToText(html)).toBe('見学会のご案内&地図\n9月27日\n10時\nA\nB')
  })
  it('style / script の中身は出さない', () => {
    expect(htmlToText('<style>p{}</style><p>本文</p><script>x()</script>')).toBe('本文')
  })
})

describe('normalizeBody', () => {
  it('3 つ以上の連続改行を 2 つに畳み、前後の空白を落とす', () => {
    expect(normalizeBody('\n\na\n\n\n\nb  \n')).toEqual({ text: 'a\n\nb', truncated: false })
  })
  it('上限を超えたら切り捨てて truncated', () => {
    const r = normalizeBody('x'.repeat(MAX_BODY_CHARS + 10))
    expect(r.text.length).toBe(MAX_BODY_CHARS)
    expect(r.truncated).toBe(true)
  })
})

describe('fallbackMessageId', () => {
  it('同じ入力なら同じ値、違えば違う。hash: 接頭辞', async () => {
    const a = await fallbackMessageId('a@example.com', 's', '2026-09-16T01:00:00Z')
    const b = await fallbackMessageId('a@example.com', 's', '2026-09-16T01:00:00Z')
    const c = await fallbackMessageId('a@example.com', 's', null)
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^hash:[0-9a-f]{64}$/)
  })
})

describe('toParsedMail', () => {
  it('text を優先し、ヘッダから X-Forwarded-For を拾う', async () => {
    const p = await toParsedMail({
      messageId: '<abc@example.com>',
      from: { address: 'News@Example.com' },
      subject: '  件名 ',
      date: '2026-09-16T01:05:00.000Z',
      text: 'テキスト本文',
      html: '<p>HTML本文</p>',
      headers: [{ key: 'x-forwarded-for', value: 'Owner@example.com news@sumai.example' }],
    })
    expect(p).toEqual({
      messageId: '<abc@example.com>',
      from: 'news@example.com',
      subject: '件名',
      date: '2026-09-16T01:05:00.000Z',
      text: 'テキスト本文',
      truncated: false,
      forwardedFor: ['owner@example.com', 'news@sumai.example'],
    })
  })
  it('text が無ければ html をテキスト化。Message-ID が無ければ hash 代替。空の件名は空文字', async () => {
    const p = await toParsedMail({ from: { address: 'a@b.com' }, html: '<p>x</p><p>y</p>' })
    expect(p.text).toBe('x\ny')
    expect(p.messageId).toMatch(/^hash:/)
    expect(p.subject).toBe('')
    expect(p.date).toBeNull()
    expect(p.forwardedFor).toEqual([])
  })
  it('差出人が無ければ from は空文字', async () => {
    const p = await toParsedMail({ text: 'x' })
    expect(p.from).toBe('')
  })
})
```

- [ ] **Step 2: 失敗を確認**

```bash
npx vitest run src/lib/mail/parse.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 実装**

`src/lib/mail/parse.ts`:

```ts
/**
 * postal-mime の解析結果を、判定に使う形（ParsedMail）に正規化する（設計 2026-09-19 §3-2, 3-6）。
 * postal-mime 自体はここでは呼ばない（Worker とスクリプトが呼び、結果だけ渡す）ので、
 * このファイルは素の Node でテストできる。
 */

import { stripTags } from '../news/text'

export const MAX_BODY_CHARS = 100_000

export type ParsedMail = {
  /** 元メールの Message-ID（<> 付き）。無ければ 'hash:<sha256>' */
  messageId: string
  /** 小文字のアドレス。無ければ '' */
  from: string
  subject: string
  /** ISO-8601。無ければ null */
  date: string | null
  text: string
  truncated: boolean
  /** X-Forwarded-For ヘッダを空白で分けて小文字にしたもの（Gmail の自動転送が付ける） */
  forwardedFor: string[]
}

/** postal-mime の Email のうち使う部分だけ */
export type RawParsed = {
  messageId?: string | null
  from?: { address?: string | null } | null
  subject?: string | null
  date?: string | null
  text?: string | null
  html?: string | null
  headers?: { key: string; value: string }[]
}

const BLOCK_END = /<\/(p|div|tr|li|h[1-6]|blockquote|table|section|article)\s*>/gi
const BR = /<br\s*\/?>/gi
const DROP_BLOCKS = /<(style|script|head)\b[\s\S]*?<\/\1\s*>/gi

/** 段落と改行を保ってテキストにする（stripTags は空白を 1 つに畳むので行ごとに通す） */
export function htmlToText(html: string): string {
  const withBreaks = html.replace(DROP_BLOCKS, '').replace(BR, '\n').replace(BLOCK_END, '\n')
  return withBreaks
    .split('\n')
    .map((line) => stripTags(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function normalizeBody(text: string): { text: string; truncated: boolean } {
  const collapsed = text.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (collapsed.length <= MAX_BODY_CHARS) return { text: collapsed, truncated: false }
  return { text: collapsed.slice(0, MAX_BODY_CHARS), truncated: true }
}

export async function fallbackMessageId(
  from: string,
  subject: string,
  date: string | null,
): Promise<string> {
  const data = new TextEncoder().encode(`${from}\n${subject}\n${date ?? ''}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `hash:${hex}`
}

export async function toParsedMail(email: RawParsed): Promise<ParsedMail> {
  const from = (email.from?.address ?? '').trim().toLowerCase()
  const subject = (email.subject ?? '').trim()
  const date = email.date ?? null
  const rawText = email.text && email.text.trim() ? email.text : email.html ? htmlToText(email.html) : ''
  const body = normalizeBody(rawText)
  const messageId = email.messageId?.trim() || (await fallbackMessageId(from, subject, date))
  const xff = (email.headers ?? []).find((h) => h.key.toLowerCase() === 'x-forwarded-for')
  const forwardedFor = xff ? xff.value.split(/\s+/).map((s) => s.trim().toLowerCase()).filter(Boolean) : []
  return { messageId, from, subject, date, text: body.text, truncated: body.truncated, forwardedFor }
}
```

- [ ] **Step 4: 通ることを確認**

```bash
npx vitest run src/lib/mail/parse.test.ts --coverage.enabled=false
```

Expected: PASS。`htmlToText` の期待値が `stripTags` の挙動（実体参照の復号・空白畳み）とずれたら、期待値ではなく実装（改行の挿入位置）を直す。

- [ ] **Step 5: Commit**

```bash
git add src/lib/mail/parse.ts src/lib/mail/parse.test.ts
git commit -m "feat(mail): 解析結果の正規化・本文テキスト化・Message-ID 代替（lib/mail/parse）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: lib/mail/route.ts — 経路判定

**Files:**

- Create: `src/lib/mail/route.ts`
- Test: `src/lib/mail/route.test.ts`

**Interfaces:**

- Consumes: `ParsedMail`（Task 4）
- Produces:
  - `GMAIL_FORWARDING_NOTICE = 'forwarding-noreply@google.com'`
  - `type RouteResult = { kind: 'auto'; forwardedBy: string } | { kind: 'manual'; forwardedBy: string } | { kind: 'system' } | { kind: 'rejected'; reason: string }`
  - `classifyRoute(mail: Pick<ParsedMail, 'from' | 'forwardedFor'>, allowlist: readonly string[]): RouteResult`

- [ ] **Step 1: 失敗するテスト**

`src/lib/mail/route.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { GMAIL_FORWARDING_NOTICE, classifyRoute } from './route'

const allow = ['owner@example.com', 'partner@example.com']

describe('classifyRoute', () => {
  it('X-Forwarded-For に許可アドレスがあれば auto（誰が転送したかを持つ）', () => {
    expect(
      classifyRoute({ from: 'news@vendor.example', forwardedFor: ['owner@example.com', 'news@x'] }, allow),
    ).toEqual({ kind: 'auto', forwardedBy: 'owner@example.com' })
  })
  it('From が許可アドレスなら manual', () => {
    expect(classifyRoute({ from: 'partner@example.com', forwardedFor: [] }, allow)).toEqual({
      kind: 'manual',
      forwardedBy: 'partner@example.com',
    })
  })
  it('Gmail の転送先確認は system（許可リストに無くても）', () => {
    expect(classifyRoute({ from: GMAIL_FORWARDING_NOTICE, forwardedFor: [] }, allow)).toEqual({
      kind: 'system',
    })
  })
  it('どれでもなければ rejected', () => {
    expect(classifyRoute({ from: 'news@vendor.example', forwardedFor: [] }, allow)).toEqual({
      kind: 'rejected',
      reason: 'not forwarded by owner',
    })
    expect(
      classifyRoute({ from: 'x@y.com', forwardedFor: ['stranger@example.org'] }, allow),
    ).toEqual({ kind: 'rejected', reason: 'not forwarded by owner' })
  })
  it('auto の判定は system より優先しない（From が確認メールなら system）', () => {
    expect(
      classifyRoute({ from: GMAIL_FORWARDING_NOTICE, forwardedFor: ['owner@example.com'] }, allow),
    ).toEqual({ kind: 'system' })
  })
})
```

- [ ] **Step 2: 失敗を確認**

```bash
npx vitest run src/lib/mail/route.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 実装**

`src/lib/mail/route.ts`:

```ts
/**
 * 受信メールがどの経路で来たかを決める（設計 2026-09-19 §3-3）。差出人だけでは偽装できるので、
 * Gmail の自動転送が付ける X-Forwarded-For か、二人自身からの手動転送だけを受理する。
 */

import type { ParsedMail } from './parse'

/** Gmail が「転送先アドレスの確認」を送ってくる差出人 */
export const GMAIL_FORWARDING_NOTICE = 'forwarding-noreply@google.com'

export type RouteResult =
  | { kind: 'auto'; forwardedBy: string }
  | { kind: 'manual'; forwardedBy: string }
  | { kind: 'system' }
  | { kind: 'rejected'; reason: string }

export function classifyRoute(
  mail: Pick<ParsedMail, 'from' | 'forwardedFor'>,
  allowlist: readonly string[],
): RouteResult {
  if (mail.from === GMAIL_FORWARDING_NOTICE) return { kind: 'system' }
  const auto = mail.forwardedFor.find((a) => allowlist.includes(a))
  if (auto) return { kind: 'auto', forwardedBy: auto }
  if (allowlist.includes(mail.from)) return { kind: 'manual', forwardedBy: mail.from }
  return { kind: 'rejected', reason: 'not forwarded by owner' }
}
```

- [ ] **Step 4: 通ることを確認**

```bash
npx vitest run src/lib/mail/route.test.ts --coverage.enabled=false
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/mail/route.ts src/lib/mail/route.test.ts
git commit -m "feat(mail): 経路判定（自動転送 / 手動転送 / システム / 拒否）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: lib/mail/toNews.ts — お知らせ行への変換

**Files:**

- Create: `src/lib/mail/toNews.ts`
- Test: `src/lib/mail/toNews.test.ts`

**Interfaces:**

- Consumes: `extractEvent(text, publishedOn)`（`src/lib/news/eventDate.ts`）、`truncate`（`src/lib/news/text.ts`）
- Produces:
  - `MAIL_URL_PREFIX = 'mail:'`、`isMailNews(url: string): boolean`、`mailUrl(messageId: string): string`
  - `type InboundForNews = { messageId: string; subject: string; text: string; sentOn: string | null }`
  - `type NewsDraft = { vendorId: string; url: string; title: string; summary: string | null; publishedOn: string; eventStart: string | null; eventEnd: string | null; eventKind: string | null }`
  - `inboundToNews(mail: InboundForNews, vendorId: string, receivedOn: string): NewsDraft`

- [ ] **Step 1: 失敗するテスト**

`src/lib/mail/toNews.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { inboundToNews, isMailNews, mailUrl } from './toNews'

describe('mailUrl / isMailNews', () => {
  it('mail: 接頭辞で見分ける', () => {
    expect(mailUrl('<a@b>')).toBe('mail:<a@b>')
    expect(isMailNews('mail:<a@b>')).toBe(true)
    expect(isMailNews('https://example.com/')).toBe(false)
  })
})

describe('inboundToNews', () => {
  it('件名がタイトル・本文先頭 300 字が要約・日程は件名+本文から判定', () => {
    const n = inboundToNews(
      {
        messageId: '<m1@example.com>',
        subject: '完成見学会のご案内',
        text: '9月27日(土)・28日(日)に開催します。' + 'あ'.repeat(400),
        sentOn: '2026-09-16',
      },
      'vendor-1',
      '2026-09-17',
    )
    expect(n.vendorId).toBe('vendor-1')
    expect(n.url).toBe('mail:<m1@example.com>')
    expect(n.title).toBe('完成見学会のご案内')
    expect(n.summary?.length).toBe(300)
    expect(n.publishedOn).toBe('2026-09-16')
    expect(n.eventKind).toBe('完成見学会')
    expect(n.eventStart).toBe('2026-09-27')
    expect(n.eventEnd).toBe('2026-09-28')
  })
  it('日付が無ければ受信日。件名が空なら「（件名なし）」。本文が空なら要約 null。日程が無ければ null', () => {
    const n = inboundToNews({ messageId: 'hash:x', subject: '', text: '', sentOn: null }, 'v', '2026-09-17')
    expect(n.publishedOn).toBe('2026-09-17')
    expect(n.title).toBe('（件名なし）')
    expect(n.summary).toBeNull()
    expect(n.eventStart).toBeNull()
    expect(n.eventEnd).toBeNull()
    expect(n.eventKind).toBeNull()
  })
})
```

- [ ] **Step 2: 失敗を確認**

```bash
npx vitest run src/lib/mail/toNews.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 実装**

`src/lib/mail/toNews.ts`:

```ts
/**
 * 受信メール → お知らせ（vendor_news）の行（設計 2026-09-19 §3-7）。RSS と同じ日程判定を使う。
 */

import { extractEvent } from '../news/eventDate'
import { truncate } from '../news/text'

export const MAIL_URL_PREFIX = 'mail:'
const SUMMARY_MAX = 300
const TITLE_MAX = 300
const UNTITLED = '（件名なし）'

export function mailUrl(messageId: string): string {
  return `${MAIL_URL_PREFIX}${messageId}`
}

export function isMailNews(url: string): boolean {
  return url.startsWith(MAIL_URL_PREFIX)
}

export type InboundForNews = {
  messageId: string
  subject: string
  text: string
  /** YYYY-MM-DD か null */
  sentOn: string | null
}

export type NewsDraft = {
  vendorId: string
  url: string
  title: string
  summary: string | null
  publishedOn: string
  eventStart: string | null
  eventEnd: string | null
  eventKind: string | null
}

export function inboundToNews(mail: InboundForNews, vendorId: string, receivedOn: string): NewsDraft {
  const publishedOn = mail.sentOn ?? receivedOn
  const title = truncate(mail.subject.trim() || UNTITLED, TITLE_MAX)
  const summary = mail.text ? truncate(mail.text, SUMMARY_MAX) : null
  const event = extractEvent(`${mail.subject}\n${mail.text}`, publishedOn)
  return {
    vendorId,
    url: mailUrl(mail.messageId),
    title,
    summary,
    publishedOn,
    eventStart: event?.start ?? null,
    eventEnd: event?.end ?? null,
    eventKind: event?.kind ?? null,
  }
}
```

- [ ] **Step 4: 通ることを確認**

```bash
npx vitest run src/lib/mail/toNews.test.ts --coverage.enabled=false
```

Expected: PASS。`eventKind` の期待値 `'完成見学会'` は `detectKind` のラベルに合わせる（違えば `src/lib/news/eventDate.ts` の `EventKindLabel` を見て期待値を直す）。

- [ ] **Step 5: lib 全体のカバレッジゲート**

```bash
npm run test:coverage 2>&1 | grep -E "Tests |mail/|threshold|ERROR"
```

Expected: `src/lib/mail/*` が 100%、ゲート通過。

- [ ] **Step 6: Commit**

```bash
git add src/lib/mail/toNews.ts src/lib/mail/toNews.test.ts
git commit -m "feat(mail): 受信メールからお知らせ行への変換と mail: URL

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: repository/mails.ts — inbound_mails の入出力

**Files:**

- Create: `src/server/repository/mails.ts`
- Modify: `src/server/repository/index.ts`（`export * from './mails'` を末尾に）
- Modify: `src/server/repository/news.ts:14-17`（`NewNews` から `mailId` を除外しない＝そのまま。変更不要。確認のみ）
- Test: `src/server/repository/mails.worker-test.ts`（Task 1 のファイルに追記）

**Interfaces:**

- Consumes: `inboundMails`・`vendorNews`・`vendors`（schema）、`insertNewsIfNew(db, rows: NewNews[])`（news.ts）、`inboundToNews`（Task 6）
- Produces:
  - `type NewInbound = Omit<NewInboundMail, 'id' | 'createdAt' | 'updatedAt'>`
  - `insertInboundMail(db: Db, row: NewInbound): Promise<{ id: string; created: boolean }>` — `message_id` 重複なら `created: false`（既存 id を返す）
  - `importMailAsNews(db: Db, mailId: string, vendorId: string, receivedOn: string): Promise<{ newsId: string | null }>` — お知らせ行を作り、`inbound_mails` を `imported` に更新。`url` 重複で作れなければ `newsId: null` のまま status だけ更新
  - `listInboundMails(db: Db, opts: { status?: InboundStatus; limit: number }): Promise<InboundMail[]>` — 新しい順
  - `getInboundMailBody(db: Db, id: string): Promise<string | null>`
  - `deleteInboundMail(db: Db, id: string): Promise<void>`
  - `cleanupInboundMails(db: Db, olderThanIso: string): Promise<number>` — `rejected`/`system` で `received_at < olderThanIso` を削除。件数を返す

- [ ] **Step 1: 失敗するテスト**

`src/server/repository/mails.worker-test.ts` に追記（既存 import に足す）:

```ts
import { eq } from 'drizzle-orm'

import { inboundMails, vendorNews } from '../../db/schema'
import { upsertVendor } from './candidates'
import {
  cleanupInboundMails,
  deleteInboundMail,
  getInboundMailBody,
  importMailAsNews,
  insertInboundMail,
  listInboundMails,
} from './mails'
import { actor, db } from './test-helpers'

function row(over: Partial<Parameters<typeof insertInboundMail>[1]> = {}) {
  return {
    messageId: '<m1@example.com>',
    receivedAt: '2026-09-17T00:00:00.000Z',
    fromAddress: 'news@vendor.example',
    forwardedBy: 'owner@example.com',
    subject: '完成見学会のご案内',
    sentOn: '2026-09-16',
    bodyText: '9月27日(土) 完成見学会を開催します。',
    bodyTruncated: false,
    status: 'unassigned' as const,
    rejectReason: null,
    vendorId: null,
    newsId: null,
    ...over,
  }
}

describe('insertInboundMail', () => {
  it('入り、同じ message_id は created=false で既存 id を返す', async () => {
    const a = await insertInboundMail(db, row())
    const b = await insertInboundMail(db, row({ subject: '別件名' }))
    expect(a.created).toBe(true)
    expect(b).toEqual({ id: a.id, created: false })
    const rows = await db.select().from(inboundMails)
    expect(rows).toHaveLength(1)
    expect(rows[0].subject).toBe('完成見学会のご案内')
  })
})

describe('importMailAsNews', () => {
  it('お知らせ行を作って imported にし、日程も付く', async () => {
    const vendorId = await upsertVendor(db, { name: 'テスト工務店', kind: 'koumuten', serviceAreas: [] }, actor)
    const { id } = await insertInboundMail(db, row())
    const { newsId } = await importMailAsNews(db, id, vendorId, '2026-09-17')
    expect(newsId).not.toBeNull()
    const [news] = await db.select().from(vendorNews).where(eq(vendorNews.id, newsId!))
    expect(news.url).toBe('mail:<m1@example.com>')
    expect(news.mailId).toBe(id)
    expect(news.publishedOn).toBe('2026-09-16')
    expect(news.eventStart).toBe('2026-09-27')
    const [mail] = await db.select().from(inboundMails).where(eq(inboundMails.id, id))
    expect(mail.status).toBe('imported')
    expect(mail.vendorId).toBe(vendorId)
    expect(mail.newsId).toBe(newsId)
  })
  it('2 回目は url 重複で作らず newsId は最初のまま', async () => {
    const vendorId = await upsertVendor(db, { name: 'テスト工務店', kind: 'koumuten', serviceAreas: [] }, actor)
    const { id } = await insertInboundMail(db, row())
    const first = await importMailAsNews(db, id, vendorId, '2026-09-17')
    const second = await importMailAsNews(db, id, vendorId, '2026-09-17')
    expect(second.newsId).toBe(first.newsId)
    expect(await db.select().from(vendorNews)).toHaveLength(1)
  })
})

describe('listInboundMails / getInboundMailBody / deleteInboundMail / cleanupInboundMails', () => {
  it('新しい順・status 絞り込み・本文取得・削除', async () => {
    await insertInboundMail(db, row({ messageId: '<a>', receivedAt: '2026-09-01T00:00:00.000Z' }))
    const { id: b } = await insertInboundMail(
      db,
      row({ messageId: '<b>', receivedAt: '2026-09-02T00:00:00.000Z', status: 'rejected', bodyText: null }),
    )
    const all = await listInboundMails(db, { limit: 10 })
    expect(all.map((m) => m.messageId)).toEqual(['<b>', '<a>'])
    expect(await listInboundMails(db, { status: 'unassigned', limit: 10 })).toHaveLength(1)
    expect(await getInboundMailBody(db, all[1].id)).toBe('9月27日(土) 完成見学会を開催します。')
    expect(await getInboundMailBody(db, 'nope')).toBeNull()
    await deleteInboundMail(db, b)
    expect(await listInboundMails(db, { limit: 10 })).toHaveLength(1)
  })
  it('掃除は rejected/system の古い行だけ消す', async () => {
    await insertInboundMail(db, row({ messageId: '<old-rej>', receivedAt: '2026-01-01T00:00:00.000Z', status: 'rejected' }))
    await insertInboundMail(db, row({ messageId: '<old-sys>', receivedAt: '2026-01-01T00:00:00.000Z', status: 'system' }))
    await insertInboundMail(db, row({ messageId: '<old-un>', receivedAt: '2026-01-01T00:00:00.000Z', status: 'unassigned' }))
    await insertInboundMail(db, row({ messageId: '<new-rej>', receivedAt: '2026-09-10T00:00:00.000Z', status: 'rejected' }))
    const removed = await cleanupInboundMails(db, '2026-08-20T00:00:00.000Z')
    expect(removed).toBe(2)
    const left = (await listInboundMails(db, { limit: 10 })).map((m) => m.messageId).sort()
    expect(left).toEqual(['<new-rej>', '<old-un>'])
  })
})
```

- [ ] **Step 2: 失敗を確認**

```bash
npx vitest run --config vitest.workers.config.ts src/server/repository/mails.worker-test.ts
```

Expected: FAIL（`./mails` が無い）。

- [ ] **Step 3: 実装**

`src/server/repository/mails.ts`:

```ts
import { and, desc, eq, inArray, lt } from 'drizzle-orm'

import type { Db } from '../../db/client'
import {
  inboundMails,
  vendorNews,
  type InboundMail,
  type InboundStatus,
  type NewInboundMail,
} from '../../db/schema'
import { inboundToNews } from '../../lib/mail/toNews'
import { insertNewsIfNew } from './news'

export type NewInbound = Omit<NewInboundMail, 'id' | 'createdAt' | 'updatedAt'>

/** message_id が既にあれば何もせず既存 id を返す（冪等） */
export async function insertInboundMail(
  db: Db,
  row: NewInbound,
): Promise<{ id: string; created: boolean }> {
  const id = crypto.randomUUID()
  const inserted = await db
    .insert(inboundMails)
    .values({ ...row, id })
    .onConflictDoNothing({ target: inboundMails.messageId })
    .returning({ id: inboundMails.id })
  if (inserted.length > 0) return { id, created: true }
  const [existing] = await db
    .select({ id: inboundMails.id })
    .from(inboundMails)
    .where(eq(inboundMails.messageId, row.messageId))
    .limit(1)
  return { id: existing.id, created: false }
}

/**
 * 受信メールをお知らせに変換して vendor_news に入れ、inbound_mails を imported に更新する。
 * url（mail:<messageId>）が既にあれば新しく作らず、その id に紐づける。
 */
export async function importMailAsNews(
  db: Db,
  mailId: string,
  vendorId: string,
  receivedOn: string,
): Promise<{ newsId: string | null }> {
  const [mail] = await db.select().from(inboundMails).where(eq(inboundMails.id, mailId)).limit(1)
  if (!mail) return { newsId: null }
  const draft = inboundToNews(
    { messageId: mail.messageId, subject: mail.subject, text: mail.bodyText ?? '', sentOn: mail.sentOn },
    vendorId,
    receivedOn,
  )
  await insertNewsIfNew(db, [{ ...draft, mailId }])
  const [news] = await db
    .select({ id: vendorNews.id })
    .from(vendorNews)
    .where(eq(vendorNews.url, draft.url))
    .limit(1)
  const newsId = news?.id ?? null
  await db
    .update(inboundMails)
    .set({ status: 'imported', vendorId, newsId, updatedAt: new Date().toISOString() })
    .where(eq(inboundMails.id, mailId))
  return { newsId }
}

export async function listInboundMails(
  db: Db,
  opts: { status?: InboundStatus; limit: number },
): Promise<InboundMail[]> {
  return db
    .select()
    .from(inboundMails)
    .where(opts.status ? eq(inboundMails.status, opts.status) : undefined)
    .orderBy(desc(inboundMails.receivedAt))
    .limit(opts.limit)
}

export async function getInboundMailBody(db: Db, id: string): Promise<string | null> {
  const [row] = await db
    .select({ bodyText: inboundMails.bodyText })
    .from(inboundMails)
    .where(eq(inboundMails.id, id))
    .limit(1)
  return row?.bodyText ?? null
}

export async function deleteInboundMail(db: Db, id: string): Promise<void> {
  await db.delete(inboundMails).where(eq(inboundMails.id, id))
}

/** rejected / system で olderThanIso より古い行を消す。戻り値は件数 */
export async function cleanupInboundMails(db: Db, olderThanIso: string): Promise<number> {
  const removed = await db
    .delete(inboundMails)
    .where(
      and(inArray(inboundMails.status, ['rejected', 'system']), lt(inboundMails.receivedAt, olderThanIso)),
    )
    .returning({ id: inboundMails.id })
  return removed.length
}
```

`src/server/repository/index.ts` の末尾に `export * from './mails'`。

- [ ] **Step 4: 通ることを確認**

```bash
npx vitest run --config vitest.workers.config.ts src/server/repository/mails.worker-test.ts
npm run typecheck
```

Expected: PASS（6 件）、型エラー 0。`NewNews` に `mailId` が含まれる（`NewVendorNews` から派生）ので `{ ...draft, mailId }` はそのまま型が合う。

- [ ] **Step 5: Commit**

```bash
git add src/server/repository/mails.ts src/server/repository/index.ts src/server/repository/mails.worker-test.ts
git commit -m "feat(mail): inbound_mails の repository（記録・取込・一覧・削除・掃除）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: server/mailHandler.ts — 受信処理本体

**Files:**

- Create: `src/server/mailHandler.ts`
- Test: `src/server/mailHandler.worker-test.ts`

**Interfaces:**

- Consumes: `PostalMime.parse`（postal-mime）、`toParsedMail`・`MAX_BODY_CHARS`（Task 4）、`classifyRoute`（Task 5）、`splitForwardedBlock`（Task 3）、`matchVendorByDomain`・`domainOf`（Task 2）、`insertInboundMail`・`importMailAsNews`（Task 7）、`toJstDateKey`（`src/lib/jst.ts`）、`MAX_INPUT_LENGTH`（`src/lib/news/text.ts`）
- Produces:
  - `type InboundMessage = { from: string; to: string; rawSize: number; raw: ReadableStream<Uint8Array> | string | Uint8Array; setReject(reason: string): void }`（`ForwardableEmailMessage` の使う部分。テストは素のオブジェクトで作る）
  - `type HandleResult = { status: 'imported' | 'unassigned' | 'rejected' | 'system' | 'duplicate' | 'too-large'; fromDomain: string | null; subject: string }`
  - `handleInboundMail(message: InboundMessage, db: Db, allowlist: readonly string[], nowIso?: string): Promise<HandleResult>`

- [ ] **Step 1: 失敗するテスト**

`src/server/mailHandler.worker-test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'

import { inboundMails, vendorNews } from '../db/schema'
import { upsertVendor } from './repository/candidates'
import { actor, db, reset } from './repository/test-helpers'
import { handleInboundMail, type InboundMessage } from './mailHandler'

beforeEach(reset)

const allow = ['owner@example.com', 'partner@example.com']
const NOW = '2026-09-17T01:00:00.000Z'

/** ForwardableEmailMessage の代わり。setReject の呼び出しを state.rejected に記録する */
function msg(raw: string, over: Partial<InboundMessage> = {}) {
  const state = { rejected: null as string | null }
  const message: InboundMessage = {
    from: 'news@vendor.example',
    to: 'news@sumai.example',
    rawSize: raw.length,
    raw,
    setReject(reason: string) {
      state.rejected = reason
    },
    ...over,
  }
  return { message, state }
}

const AUTO = [
  'Message-ID: <auto1@vendor.example>',
  'From: Test Builder <news@vendor.example>',
  'To: owner@example.com',
  'X-Forwarded-For: owner@example.com news@sumai.example',
  'Date: Wed, 16 Sep 2026 10:05:00 +0900',
  'Subject: 完成見学会のご案内',
  'Content-Type: text/plain; charset=utf-8',
  '',
  '9月27日(土)・28日(日) 完成見学会を開催します。',
].join('\r\n')

async function vendor(domain: string | null) {
  return upsertVendor(
    db,
    { name: 'テスト工務店', kind: 'koumuten', serviceAreas: [], newsEmailDomain: domain },
    actor,
  )
}

describe('handleInboundMail', () => {
  it('自動転送 + 業者一致 → imported（お知らせ行と日程が付く）', async () => {
    const vendorId = await vendor('vendor.example')
    const r = await handleInboundMail(msg(AUTO).message, db, allow, NOW)
    expect(r.status).toBe('imported')
    expect(r.fromDomain).toBe('vendor.example')
    const [mail] = await db.select().from(inboundMails)
    expect(mail.status).toBe('imported')
    expect(mail.forwardedBy).toBe('owner@example.com')
    expect(mail.sentOn).toBe('2026-09-16')
    expect(mail.vendorId).toBe(vendorId)
    const [news] = await db.select().from(vendorNews)
    expect(news.url).toBe('mail:<auto1@vendor.example>')
    expect(news.eventStart).toBe('2026-09-27')
  })

  it('自動転送 + 業者不一致 → unassigned（本文は保存）', async () => {
    await vendor('other.example')
    const r = await handleInboundMail(msg(AUTO).message, db, allow, NOW)
    expect(r.status).toBe('unassigned')
    const [mail] = await db.select().from(inboundMails)
    expect(mail.bodyText).toContain('完成見学会')
    expect(await db.select().from(vendorNews)).toHaveLength(0)
  })

  it('同じ Message-ID を 2 回受けたら duplicate', async () => {
    await vendor('vendor.example')
    await handleInboundMail(msg(AUTO).message, db, allow, NOW)
    const r = await handleInboundMail(msg(AUTO).message, db, allow, NOW)
    expect(r.status).toBe('duplicate')
    expect(await db.select().from(inboundMails)).toHaveLength(1)
  })

  it('経路が無ければ rejected（setReject し、本文は保存しない）', async () => {
    const raw = AUTO.replace('X-Forwarded-For: owner@example.com news@sumai.example\r\n', '')
    const { message, state } = msg(raw)
    const r = await handleInboundMail(message, db, allow, NOW)
    expect(r.status).toBe('rejected')
    expect(state.rejected).toBe('not forwarded by owner')
    const [mail] = await db.select().from(inboundMails)
    expect(mail.status).toBe('rejected')
    expect(mail.bodyText).toBeNull()
  })

  it('手動転送は転送ブロックから元の差出人・日付・件名を復元して照合する', async () => {
    const vendorId = await vendor('vendor.example')
    const raw = [
      'Message-ID: <fwd1@mail.example>',
      'From: Owner <partner@example.com>',
      'To: news@sumai.example',
      'Date: Thu, 17 Sep 2026 09:00:00 +0900',
      'Subject: Fwd: 構造見学会',
      'Content-Type: text/plain; charset=utf-8',
      '',
      '---------- Forwarded message ---------',
      'From: Test Builder <info@vendor.example>',
      'Date: 2026年9月10日(木) 12:00',
      'Subject: 構造見学会のお知らせ',
      'To: <partner@example.com>',
      '',
      '10月4日(日) 構造見学会。',
    ].join('\r\n')
    const r = await handleInboundMail(msg(raw, { from: 'partner@example.com' }).message, db, allow, NOW)
    expect(r.status).toBe('imported')
    const [mail] = await db.select().from(inboundMails)
    expect(mail.fromAddress).toBe('info@vendor.example')
    expect(mail.forwardedBy).toBe('partner@example.com')
    expect(mail.subject).toBe('構造見学会のお知らせ')
    expect(mail.sentOn).toBe('2026-09-10')
    expect(mail.bodyText).toBe('10月4日(日) 構造見学会。')
    expect(mail.vendorId).toBe(vendorId)
  })

  it('Gmail の転送先確認は system として本文ごと保存し、お知らせにはしない', async () => {
    const raw = [
      'Message-ID: <sys1@google.example>',
      'From: forwarding-noreply@google.com',
      'Subject: (#123456) Gmail の転送の確認',
      'Content-Type: text/plain; charset=utf-8',
      '',
      '確認コード: 123456',
    ].join('\r\n')
    const r = await handleInboundMail(msg(raw, { from: 'forwarding-noreply@google.com' }).message, db, allow, NOW)
    expect(r.status).toBe('system')
    const [mail] = await db.select().from(inboundMails)
    expect(mail.bodyText).toContain('123456')
    expect(await db.select().from(vendorNews)).toHaveLength(0)
  })

  it('大きすぎるメールは読まずに拒否し、記録も残さない', async () => {
    const { message, state } = msg(AUTO, { rawSize: 3_000_000 })
    const r = await handleInboundMail(message, db, allow, NOW)
    expect(r.status).toBe('too-large')
    expect(state.rejected).toBe('too large')
    expect(await db.select().from(inboundMails)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 失敗を確認**

```bash
npx vitest run --config vitest.workers.config.ts src/server/mailHandler.worker-test.ts
```

Expected: FAIL（`./mailHandler` が無い。`upsertVendor` の `newsEmailDomain` は Task 1 でスキーマに入っているが `VendorInput` には Task 10 で足す。それまでは型エラーになるので、このテストの `vendor()` は `as never` を付けるのではなく、Task 10 を先に終えてから Step 4 を確認してもよい。順番はこの計画どおり 8 → 9 → 10 だが、**このテストの型チェックは Task 10 完了後に通る**）。

- [ ] **Step 3: 実装**

`src/server/mailHandler.ts`:

```ts
import PostalMime from 'postal-mime'

import type { Db } from '../db/client'
import { vendors } from '../db/schema'
import { toJstDateKey } from '../lib/jst'
import { splitForwardedBlock } from '../lib/mail/forwarded'
import { domainOf, matchVendorByDomain } from '../lib/mail/match'
import { toParsedMail } from '../lib/mail/parse'
import { classifyRoute } from '../lib/mail/route'
import { MAX_INPUT_LENGTH } from '../lib/news/text'
import { importMailAsNews, insertInboundMail } from './repository/mails'
import { isNotNull } from 'drizzle-orm'

/** ForwardableEmailMessage のうち使う部分（テストは素のオブジェクトで渡す） */
export type InboundMessage = {
  from: string
  to: string
  rawSize: number
  raw: ReadableStream<Uint8Array> | string | Uint8Array
  setReject(reason: string): void
}

export type HandleResult = {
  status: 'imported' | 'unassigned' | 'rejected' | 'system' | 'duplicate' | 'too-large'
  fromDomain: string | null
  subject: string
}

/**
 * news@ に届いた 1 通を処理する（設計 2026-09-19 §3）。
 * 読む → 経路判定 → inbound_mails に記録 → 業者が決まれば vendor_news へ。
 * 例外は呼び出し側（server.ts）でログにする。ctx.waitUntil は使わない。
 */
export async function handleInboundMail(
  message: InboundMessage,
  db: Db,
  allowlist: readonly string[],
  nowIso: string = new Date().toISOString(),
): Promise<HandleResult> {
  if (message.rawSize > MAX_INPUT_LENGTH) {
    message.setReject('too large')
    return { status: 'too-large', fromDomain: domainOf(message.from), subject: '' }
  }

  const email = await PostalMime.parse(message.raw)
  const parsed = await toParsedMail(email)
  const route = classifyRoute(parsed, allowlist)
  const receivedOn = toJstDateKey(nowIso)

  if (route.kind === 'rejected') {
    message.setReject(route.reason)
    await insertInboundMail(db, {
      messageId: parsed.messageId,
      receivedAt: nowIso,
      fromAddress: parsed.from,
      forwardedBy: null,
      subject: parsed.subject,
      sentOn: parsed.date ? toJstDateKey(parsed.date) : null,
      bodyText: null,
      bodyTruncated: false,
      status: 'rejected',
      rejectReason: route.reason,
      vendorId: null,
      newsId: null,
    })
    return { status: 'rejected', fromDomain: domainOf(parsed.from), subject: parsed.subject }
  }

  if (route.kind === 'system') {
    const { created } = await insertInboundMail(db, {
      messageId: parsed.messageId,
      receivedAt: nowIso,
      fromAddress: parsed.from,
      forwardedBy: null,
      subject: parsed.subject,
      sentOn: parsed.date ? toJstDateKey(parsed.date) : null,
      bodyText: parsed.text,
      bodyTruncated: parsed.truncated,
      status: 'system',
      rejectReason: null,
      vendorId: null,
      newsId: null,
    })
    return { status: created ? 'system' : 'duplicate', fromDomain: domainOf(parsed.from), subject: parsed.subject }
  }

  // 手動転送は転送ブロックの中身が「元のメール」
  let fromAddress = parsed.from
  let subject = parsed.subject
  let sentOn = parsed.date ? toJstDateKey(parsed.date) : null
  let bodyText = parsed.text
  if (route.kind === 'manual') {
    const block = splitForwardedBlock(parsed.text)
    if (block) {
      fromAddress = block.from ?? fromAddress
      subject = block.subject ?? subject
      sentOn = block.date ?? sentOn
      bodyText = block.body
    }
  }

  const candidates = await db
    .select({ id: vendors.id, newsEmailDomain: vendors.newsEmailDomain })
    .from(vendors)
    .where(isNotNull(vendors.newsEmailDomain))
  const vendor = matchVendorByDomain(fromAddress, candidates)

  const { id, created } = await insertInboundMail(db, {
    messageId: parsed.messageId,
    receivedAt: nowIso,
    fromAddress,
    forwardedBy: route.forwardedBy,
    subject,
    sentOn,
    bodyText,
    bodyTruncated: parsed.truncated,
    status: vendor ? 'imported' : 'unassigned',
    rejectReason: null,
    vendorId: vendor?.id ?? null,
    newsId: null,
  })
  const fromDomain = domainOf(fromAddress)
  if (!created) return { status: 'duplicate', fromDomain, subject }
  if (!vendor) return { status: 'unassigned', fromDomain, subject }
  await importMailAsNews(db, id, vendor.id, receivedOn)
  return { status: 'imported', fromDomain, subject }
}
```

- [ ] **Step 4: 通ることを確認**（Task 10 の後でもよい）

```bash
npx vitest run --config vitest.workers.config.ts src/server/mailHandler.worker-test.ts
```

Expected: PASS（7 件）。`postal-mime` が `Date:` を ISO にするので `sentOn` は `toJstDateKey` で `2026-09-16`。

- [ ] **Step 5: Commit**

```bash
git add src/server/mailHandler.ts src/server/mailHandler.worker-test.ts
git commit -m "feat(mail): 受信処理本体 handleInboundMail（経路判定→記録→お知らせ化）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: server.ts — email ハンドラと掃除

**Files:**

- Modify: `src/server.ts`
- Modify: `README.md`（「よく使うコマンド」の後にローカル確認の 1 行）

**Interfaces:**

- Consumes: `handleInboundMail`（Task 8）、`parseAllowlist`（`src/lib/access.ts`）、`cleanupInboundMails`（Task 7）

- [ ] **Step 1: 実装**

`src/server.ts` の import に追加:

```ts
import { parseAllowlist } from './lib/access'
import { handleInboundMail } from './server/mailHandler'
import { cleanupInboundMails } from './server/repository/mails'
```

`runScheduledNewsFetch` の直後に追加:

```ts
/** 受信ログの掃除（設計 2026-09-19 §4）: 拒否・システム行は 30 日で消す。取込・未割当は残す */
const INBOUND_RETENTION_DAYS = 30
async function runInboundCleanup(env: Env): Promise<void> {
  try {
    const db = drizzle(env.DB, { schema })
    const cutoff = new Date(Date.now() - INBOUND_RETENTION_DAYS * 86400000).toISOString()
    const removed = await cleanupInboundMails(db, cutoff)
    console.log(`mail: cleanup removed=${removed}`)
  } catch (e) {
    console.log(`mail: cleanup failed error=${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * news@sumai-log.app に届いたメール（Email Routing → このWorker）。設計 2026-09-19 §3。
 * 例外は捕まえてログ 1 行にする（投げると Routing 側で再送・バウンスになる）。
 * 本文・アドレス全体はログに出さない。
 */
async function onEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  const db = drizzle(env.DB, { schema })
  try {
    const r = await handleInboundMail(message, db, parseAllowlist(env.ACCESS_ALLOWED_EMAILS))
    console.log(`mail: ${r.status} domain=${r.fromDomain ?? '-'} subject=${r.subject.slice(0, 40)}`)
  } catch (e) {
    console.log(`mail: failed error=${e instanceof Error ? e.message : String(e)}`)
  }
}
```

`export default` を次に置き換え:

```ts
export default {
  fetch: workerFetch,
  scheduled: async (_controller: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runScheduledNewsFetch(env).then(() => runInboundCleanup(env)))
  },
  email: onEmail,
} satisfies ExportedHandler<Env>
```

- [ ] **Step 2: 型・ビルド**

```bash
npm run typecheck && npm run build 2>&1 | grep -E "error|✓ built"
```

Expected: 型エラー 0、`✓ built` ×2。`ForwardableEmailMessage` は `worker-configuration.d.ts` のグローバル型。

- [ ] **Step 3: README にローカル確認の手順**

`README.md` の「よく使うコマンド」節の末尾に追加:

````markdown
### メール受信のローカル確認

`wrangler dev` はメール投入用のエンドポイントを持つ（`npm run dev` の Vite 開発サーバーには無い）。

```bash
npm run build && npx wrangler dev --port 8787
# 別ターミナルで（fixture は架空の差出人・本文）
curl -X POST 'http://localhost:8787/cdn-cgi/handler/email?from=news@vendor.example&to=news@sumai-log.app' \
  -H 'Content-Type: message/rfc822' --data-binary @test/fixtures/mail-auto.eml
```

結果は `wrangler dev` のログ（`mail: imported ...`）と、設定ページの「メール取込」で確認する。
````

`test/fixtures/mail-auto.eml` を作る（Task 8 の `AUTO` と同じ内容。CRLF でなくてもよい）:

```
Message-ID: <auto1@vendor.example>
From: Test Builder <news@vendor.example>
To: owner@example.com
X-Forwarded-For: owner@example.com news@sumai-log.app
Date: Wed, 16 Sep 2026 10:05:00 +0900
Subject: 完成見学会のご案内
Content-Type: text/plain; charset=utf-8

9月27日(土)・28日(日) 完成見学会を開催します。
```

- [ ] **Step 4: Commit**

```bash
git add src/server.ts README.md test/fixtures/mail-auto.eml
git commit -m "feat(mail): Worker の email ハンドラと受信ログの掃除（毎朝の Cron に相乗り）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: 業者の「メールの差出人ドメイン」

**Files:**

- Modify: `src/server/candidates.ts:88-92`（`vendorInput`）
- Modify: `src/components/candidates/VendorForm.tsx:38-60, 273-290`
- Modify: `src/routes/candidates_.vendors.$id.tsx:181-190`
- Test: `src/server/candidates.worker-test.ts`（既存なら追記。無ければ `src/server/repository/candidates.worker-test.ts` に追記）

**Interfaces:**

- Consumes: `normalizeDomains`（Task 2）
- Produces: `VendorInput.newsEmailDomain: string | null`（保存時に正規化済み）

- [ ] **Step 1: 失敗するテスト**

`src/server/candidates.schema` は無いので `vendorInput` は `src/server/candidates.ts` にある。テストは `src/server/repository/candidates.worker-test.ts` に追記（`vendorInput` を import できるか確認。`candidates.ts` が `currentActorEmail` を静的 import していて workers テストから読めない場合は、`vendorInput` を `src/server/candidates.schema.ts` に切り出して `candidates.ts` から再エクスポートする。news.schema.ts と同じ理由）:

```ts
import { vendorInput } from '../candidates.schema'

describe('vendorInput.newsEmailDomain', () => {
  const base = { name: 'x', kind: 'koumuten' as const, serviceAreas: [], affiliations: [], affiliationLinks: {}, uaValue: null, cValuePublished: false, seismicGrade: null, longTermCertified: false, pricePerTsuboMin: null, pricePerTsuboMax: null, structure: null, features: null, status: 'interested' as const, sourceUrl: null, websiteUrl: null, socialUrls: [], newsUrl: null, newsSource: null, hq: null, representative: null }
  it('正規化して保存する。空は null', () => {
    expect(vendorInput.parse({ ...base, newsEmailDomain: ' A.com, info@B.com ' }).newsEmailDomain).toBe('a.com,b.com')
    expect(vendorInput.parse({ ...base, newsEmailDomain: '' }).newsEmailDomain).toBeNull()
    expect(vendorInput.parse({ ...base, newsEmailDomain: null }).newsEmailDomain).toBeNull()
  })
})
```

`base` の必須キーは `vendorInput` の定義（`src/server/candidates.ts:40-92`）を見て揃える。

- [ ] **Step 2: 失敗を確認**

```bash
npx vitest run --config vitest.workers.config.ts src/server/repository/candidates.worker-test.ts
```

Expected: FAIL（`newsEmailDomain` が unknown key で落ちるか、正規化されない）。

- [ ] **Step 3: 実装**

`src/server/candidates.ts` の `vendorInput` で `newsSource` の行の後に追加:

```ts
    // メール取込（設計 2026-09-19）: メルマガの差出人ドメイン。保存時に小文字・カンマ区切りへ正規化
    newsEmailDomain: z.string().max(500).nullable().transform(normalizeDomains),
```

import に `import { normalizeDomains } from '../lib/mail/match'`。（`vendorInput` を schema ファイルに切り出した場合はそちらに。）

`src/components/candidates/VendorForm.tsx`:
- `empty` に `newsEmailDomain: null,` を追加（`newsSource: null,` の後）。
- 「取得方法」の `<Select ... />` の直後に追加:

```tsx
        <TextInput
          label="メールの差出人ドメイン"
          description="メルマガの差出人（@ の右）。カンマ区切りで複数可。news@sumai-log.app に転送されたメールをこの業者のお知らせにします"
          placeholder="example.com, mail.example.com"
          {...form.getInputProps('newsEmailDomain')}
          value={form.values.newsEmailDomain ?? ''}
        />
```

`src/routes/candidates_.vendors.$id.tsx` の「参照 URL」の Row の後に追加:

```tsx
          {vendor.newsEmailDomain ? (
            <Row label="メール差出人" value={vendor.newsEmailDomain.split(',').join(', ')} />
          ) : null}
```

- [ ] **Step 4: 通ることを確認**

```bash
npx vitest run --config vitest.workers.config.ts src/server/repository/candidates.worker-test.ts src/server/mailHandler.worker-test.ts
npm run typecheck && npm run format:check
```

Expected: PASS（Task 8 のテストもここで通る）。

- [ ] **Step 5: Commit**

```bash
git add src/server src/components/candidates/VendorForm.tsx 'src/routes/candidates_.vendors.$id.tsx'
git commit -m "feat(candidates): 業者に「メールの差出人ドメイン」

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: server fn（設定ページ・ドロワー用）

**Files:**

- Create: `src/server/mails.schema.ts`
- Create: `src/server/mails.ts`
- Test: `src/server/mails.schema.test.ts`（Node vitest。`src/server/**` は coverage 対象外だがバリデータだけ確認）

**Interfaces:**

- Consumes: Task 7 の repository、`env.MAIL_INBOX_ADDRESS`
- Produces（server fn）:
  - `listMailImport(): Promise<{ inboxAddress: string; unassigned: InboundMail[]; recent: InboundMail[] }>`（未割当は全件、直近 20 件）
  - `assignMail({ mailId, vendorId })`（POST）→ `{ newsId: string | null }`
  - `deleteMail({ id })`（POST）→ `{ ok: true }`
  - `getMailBody({ id })` → `{ body: string | null }`

- [ ] **Step 1: 失敗するテスト**

`src/server/mails.schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { assignMailInput, mailIdInput } from './mails.schema'

const uuid = '11111111-1111-4111-8111-111111111111'

describe('mails.schema', () => {
  it('assignMailInput は mailId と vendorId の UUID', () => {
    expect(assignMailInput.parse({ mailId: uuid, vendorId: uuid })).toEqual({ mailId: uuid, vendorId: uuid })
    expect(() => assignMailInput.parse({ mailId: 'x', vendorId: uuid })).toThrow()
  })
  it('mailIdInput は id の UUID', () => {
    expect(mailIdInput.parse({ id: uuid })).toEqual({ id: uuid })
  })
})
```

- [ ] **Step 2: 失敗を確認**

```bash
npx vitest run src/server/mails.schema.test.ts --coverage.enabled=false
```

Expected: FAIL。

- [ ] **Step 3: 実装**

`src/server/mails.schema.ts`:

```ts
import { z } from 'zod'

import { idField } from './zod'

export const assignMailInput = z.object({ mailId: idField, vendorId: idField })
export const mailIdInput = z.object({ id: idField })
```

`src/server/mails.ts`:

```ts
import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'

import { getDb } from '../db/client'
import { toJstDateKey } from '../lib/jst'
import { assignMailInput, mailIdInput } from './mails.schema'
import {
  deleteInboundMail,
  getInboundMailBody,
  importMailAsNews,
  listInboundMails,
} from './repository'

export { assignMailInput, mailIdInput }

const RECENT_LIMIT = 20
const UNASSIGNED_LIMIT = 200

/** 設定「メール取込」カード用 */
export const listMailImport = createServerFn().handler(async () => {
  const db = getDb()
  const [unassigned, recent] = await Promise.all([
    listInboundMails(db, { status: 'unassigned', limit: UNASSIGNED_LIMIT }),
    listInboundMails(db, { limit: RECENT_LIMIT }),
  ])
  return { inboxAddress: env.MAIL_INBOX_ADDRESS, unassigned, recent }
})

/** 未割当メールに業者を選んで取り込む */
export const assignMail = createServerFn({ method: 'POST' })
  .validator(assignMailInput)
  .handler(async ({ data }) => {
    return importMailAsNews(getDb(), data.mailId, data.vendorId, toJstDateKey(new Date().toISOString()))
  })

export const deleteMail = createServerFn({ method: 'POST' })
  .validator(mailIdInput)
  .handler(async ({ data }) => {
    await deleteInboundMail(getDb(), data.id)
    return { ok: true as const }
  })

/** お知らせのドロワーでメール本文を表示する */
export const getMailBody = createServerFn()
  .validator(mailIdInput)
  .handler(async ({ data }) => ({ body: await getInboundMailBody(getDb(), data.id) }))
```

- [ ] **Step 4: 通ることを確認**

```bash
npx vitest run src/server/mails.schema.test.ts --coverage.enabled=false && npm run typecheck
```

Expected: PASS、型エラー 0。

- [ ] **Step 5: Commit**

```bash
git add src/server/mails.schema.ts src/server/mails.ts src/server/mails.schema.test.ts
git commit -m "feat(mail): 設定・ドロワー用の server fn（一覧・割当・削除・本文）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: 設定「メール取込」カード

**Files:**

- Create: `src/components/settings/MailImportCard.tsx`
- Modify: `src/routes/settings.tsx:41-52`（loader）と「お知らせ」カードの直後

**Interfaces:**

- Consumes: `listMailImport`・`assignMail`・`deleteMail`（Task 11）、`INBOUND_STATUS_LABEL`（Task 1）、`formatJst`（`src/lib/jst.ts`）、`listNewsSources` ではなく業者一覧は `listLinkTargets()`（`src/server/places.ts`。`{ vendors: {id,name}[] }` を返す）

- [ ] **Step 1: 実装**

`src/components/settings/MailImportCard.tsx`:

```tsx
import { Badge, Button, Card, Code, Group, Select, Spoiler, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { INBOUND_STATUS_LABEL, type InboundMail } from '../../db/schema'
import { extractErrorMessage } from '../../lib/formError'
import { formatJst } from '../../lib/jst'
import { assignMail, deleteMail } from '../../server/mails'

const STATUS_COLOR: Record<InboundMail['status'], string> = {
  imported: 'teal',
  unassigned: 'yellow',
  rejected: 'red',
  system: 'gray',
}

/** 設定ページの「メール取込」（設計 2026-09-19 §5） */
export function MailImportCard({
  inboxAddress,
  unassigned,
  recent,
  vendors,
}: {
  inboxAddress: string
  unassigned: InboundMail[]
  recent: InboundMail[]
  vendors: { id: string; name: string }[]
}) {
  const router = useRouter()
  const assign = useServerFn(assignMail)
  const remove = useServerFn(deleteMail)
  const [choice, setChoice] = useState<Record<string, string | null>>({})
  const [busy, setBusy] = useState<string | null>(null)

  async function run(id: string, action: () => Promise<unknown>, done: string) {
    setBusy(id)
    try {
      await action()
      await router.invalidate()
      notifications.show({ message: done })
    } catch (error) {
      notifications.show({ message: extractErrorMessage(error), color: 'red' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Title order={2}>メール取込</Title>
        <Text size="sm">
          転送先: <Code>{inboxAddress}</Code>
        </Text>
        <Text size="xs" c="dimmed">
          Gmail の「転送先アドレス」にこの宛先を追加し、確認コードは下の受信ログ（システム）で読む。
          フィルタで業者の差出人ドメインを転送すると、業者の「メールの差出人ドメイン」に一致したものが
          お知らせに入る。
        </Text>

        <Title order={3}>未割当 {unassigned.length} 件</Title>
        {unassigned.length === 0 ? (
          <Text size="sm" c="dimmed">
            業者に紐づかなかったメールはありません。
          </Text>
        ) : (
          <Stack gap="xs">
            {unassigned.map((m) => (
              <Stack key={m.id} gap={4}>
                <Text size="xs" c="dimmed">
                  {formatJst(m.receivedAt)} · {m.fromAddress}
                </Text>
                <Text size="sm" fw={600}>
                  {m.subject || '（件名なし）'}
                </Text>
                {m.bodyText ? (
                  <Text size="xs" c="dimmed" lineClamp={2}>
                    {m.bodyText.slice(0, 100)}
                  </Text>
                ) : null}
                <Group gap="xs" wrap="nowrap">
                  <Select
                    size="xs"
                    placeholder="業者を選ぶ"
                    data={vendors.map((v) => ({ value: v.id, label: v.name }))}
                    value={choice[m.id] ?? null}
                    onChange={(v) => setChoice((c) => ({ ...c, [m.id]: v }))}
                    searchable
                    style={{ flex: 1 }}
                  />
                  <Button
                    size="xs"
                    disabled={!choice[m.id]}
                    loading={busy === m.id}
                    onClick={() =>
                      run(m.id, () => assign({ data: { mailId: m.id, vendorId: choice[m.id]! } }), 'お知らせに取り込みました')
                    }
                  >
                    取り込む
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    loading={busy === m.id}
                    onClick={() => run(m.id, () => remove({ data: { id: m.id } }), '削除しました')}
                  >
                    削除
                  </Button>
                </Group>
              </Stack>
            ))}
          </Stack>
        )}

        <Title order={3}>直近の受信</Title>
        {recent.length === 0 ? (
          <Text size="sm" c="dimmed">
            まだ受信していません。
          </Text>
        ) : (
          <Stack gap={6}>
            {recent.map((m) => (
              <Stack key={m.id} gap={2}>
                <Group gap="xs" wrap="nowrap">
                  <Badge size="xs" color={STATUS_COLOR[m.status]} variant="light">
                    {INBOUND_STATUS_LABEL[m.status]}
                  </Badge>
                  <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                    {formatJst(m.receivedAt)}
                  </Text>
                  <Text size="xs" lineClamp={1} style={{ minWidth: 0 }}>
                    {m.fromAddress} · {m.subject || '（件名なし）'}
                  </Text>
                </Group>
                {m.status === 'system' && m.bodyText ? (
                  <Spoiler maxHeight={0} showLabel="本文を見る" hideLabel="閉じる">
                    <Text size="xs" style={{ whiteSpace: 'pre-wrap' }}>
                      {m.bodyText}
                    </Text>
                  </Spoiler>
                ) : null}
              </Stack>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  )
}
```

`src/routes/settings.tsx`:
- import に `import { MailImportCard } from '../components/settings/MailImportCard'`、`import { listMailImport } from '../server/mails'`、`import { listLinkTargets } from '../server/places'`。
- loader を次に:

```ts
    const [settings, tags, news, favicons, mail, targets] = await Promise.all([
      getSettings(),
      listTagNames(),
      loadNewsSources(),
      loadFaviconSources(),
      listMailImport(),
      listLinkTargets(),
    ])
    return {
      ...settings,
      tags,
      newsSources: news.sources,
      faviconVendors: favicons.vendors,
      mail,
      vendorOptions: targets.vendors,
    }
```

- `Page()` の分割代入に `mail, vendorOptions` を足し、「お知らせ」カードの `</Card>` の直後に:

```tsx
      <MailImportCard
        inboxAddress={mail.inboxAddress}
        unassigned={mail.unassigned}
        recent={mail.recent}
        vendors={vendorOptions}
      />
```

- [ ] **Step 2: 型・整形**

```bash
npm run typecheck && npx prettier --write src/components/settings src/routes/settings.tsx && npm run format:check
```

Expected: 型エラー 0。`listLinkTargets` の戻り値の `vendors` が `{ id, name }[]` でなければ（余分な列があっても）そのまま渡してよい。

- [ ] **Step 3: 手元で見る**

```bash
npm run dev
```

390×844 で `/settings` を開き、「メール取込」カードに転送先と「未割当 0 件」「まだ受信していません」が出ることを確認（Playwright MCP で `page.$eval('main', m => m.innerText)` に「メール取込」「news@sumai-log.app」が含まれる）。

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/MailImportCard.tsx src/routes/settings.tsx
git commit -m "feat(settings): 「メール取込」カード（転送先・未割当の割当・受信ログ）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: お知らせ側の表示（メールバッジ・本文）

**Files:**

- Modify: `src/components/news/NewsEventDrawer.tsx`
- Modify: `src/components/news/NewsAgenda.tsx:125-130`

**Interfaces:**

- Consumes: `isMailNews`（Task 6）、`getMailBody`（Task 11）、`NewsEventRow.mailId`（Task 1 で列が増えたので型に含まれる）

- [ ] **Step 1: ドロワー**

`src/components/news/NewsEventDrawer.tsx` を次に置き換え:

```tsx
import { Anchor, Badge, Button, Loader, ScrollArea, Stack, Text } from '@mantine/core'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'

import { formatDateWithWeekday } from '../../lib/calendar'
import { isMailNews } from '../../lib/mail/toNews'
import { getMailBody } from '../../server/mails'
import type { NewsEventRow } from '../../server/repository'
import { EventBadge } from './EventBadge'

/**
 * お知らせをタップしたときに開くドロワーの中身。カレンダーの情報レイヤー
 * （src/routes/calendar.tsx の FormDrawer）と、お知らせのアジェンダ表示
 * （src/components/news/NewsAgenda.tsx の FormDrawer）の両方で使う共通部品。
 * 「行く」で自分の予定に変換すると（router.invalidate 後、同じ news をこの props に
 * 渡し直せば）plannedEventId が付き、ボタンが自動的に「予定を見る」に変わる。
 *
 * メール由来（url が mail:）は外部リンクが無いので、タイトルを文字で出し本文を下に表示する
 * （設計 2026-09-19 §5）。本文は開いたときに取りに行く（一覧の payload に本文を含めない）。
 */
export function NewsEventDrawer({
  news,
  planning,
  onPlan,
  onViewEvent,
}: {
  news: NewsEventRow
  planning: boolean
  onPlan: () => void
  onViewEvent: () => void
}) {
  const mail = isMailNews(news.url)
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {news.vendorName}
      </Text>
      {mail ? (
        <Stack gap={4}>
          <Badge size="xs" variant="light" style={{ alignSelf: 'flex-start' }}>
            メール
          </Badge>
          <Text fw={600}>{news.title}</Text>
        </Stack>
      ) : (
        <Anchor href={news.url} target="_blank" rel="noopener noreferrer" fw={600}>
          {news.title}
        </Anchor>
      )}
      <EventBadge eventKind={news.eventKind} eventStart={news.eventStart} eventEnd={news.eventEnd} />
      <Text size="xs" c="dimmed">
        公開日 {formatDateWithWeekday(news.publishedOn)}
      </Text>
      {news.plannedEventId ? (
        <Button onClick={onViewEvent}>予定を見る</Button>
      ) : (
        <Button onClick={onPlan} loading={planning}>
          行く
        </Button>
      )}
      {mail && news.mailId ? <MailBody mailId={news.mailId} /> : null}
    </Stack>
  )
}

function MailBody({ mailId }: { mailId: string }) {
  const load = useServerFn(getMailBody)
  const [body, setBody] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    setBody(undefined)
    load({ data: { id: mailId } })
      .then((r) => {
        if (!cancelled) setBody(r.body)
      })
      .catch(() => {
        if (!cancelled) setBody(null)
      })
    return () => {
      cancelled = true
    }
  }, [mailId, load])
  if (body === undefined) return <Loader size="sm" />
  if (body === null)
    return (
      <Text size="sm" c="dimmed">
        本文を読み込めませんでした。
      </Text>
    )
  return (
    <ScrollArea.Autosize mah="50vh" type="auto">
      <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
        {body}
      </Text>
    </ScrollArea.Autosize>
  )
}
```

- [ ] **Step 2: 一覧のバッジ**

`src/components/news/NewsAgenda.tsx` の `renderEvent` で、`{item.eventKind || item.plannedEventId ? (` の条件を `{item.eventKind || item.plannedEventId || isMailNews(item.url) ? (` にし、`Group` の中の先頭に:

```tsx
              {isMailNews(item.url) ? (
                <Badge size="xs" variant="outline" color="gray">
                  メール
                </Badge>
              ) : null}
```

import に `import { isMailNews } from '../../lib/mail/toNews'`（`Badge` は既に import 済み）。

- [ ] **Step 3: 型・整形・テスト**

```bash
npm run typecheck && npx prettier --write src/components/news && npm run format:check && npm test 2>&1 | grep -E "Tests |FAIL"
```

Expected: 型エラー 0、全テスト PASS。

- [ ] **Step 4: 手元で見る**

ローカル D1 に 1 通入れて確認（Task 9 の curl か、次の SQL）:

```bash
npx wrangler d1 execute sumai-log --local --command "INSERT INTO inbound_mails (id,message_id,received_at,from_address,forwarded_by,subject,sent_on,body_text,body_truncated,status,reject_reason,vendor_id,news_id,created_at,updated_at) VALUES ('m-local-1','<local1@vendor.example>','2026-09-17T01:00:00.000Z','news@vendor.example','owner@example.com','完成見学会のご案内','2026-09-16','9月27日(土) 完成見学会を開催します。',0,'unassigned',NULL,NULL,NULL,datetime('now'),datetime('now'))"
```

`npm run dev` → `/settings` の未割当に出る → 業者を選んで「取り込む」→ ホームの「お知らせ」に「メール」バッジ付きで出る → タップでドロワーに本文が出る。

- [ ] **Step 5: Commit**

```bash
git add src/components/news
git commit -m "feat(news): メール由来のお知らせにバッジと本文表示

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: 過去分の mbox 取込スクリプト

**Files:**

- Create: `src/lib/mail/mbox.ts`、Test: `src/lib/mail/mbox.test.ts`
- Create: `scripts/import-mbox.ts`
- Modify: `package.json`（`"import:mbox": "tsx scripts/import-mbox.ts"`）
- Modify: `README.md`（「メール取込」節。過去分の手順）

**Interfaces:**

- Consumes: `PostalMime.parse`、`toParsedMail`（Task 4）、`splitForwardedBlock`（Task 3）、`matchVendorByDomain`（Task 2）、`inboundToNews`（Task 6）、`toJstDateKey`（`src/lib/jst.ts`）、`sqlString`（`scripts/lib/seed.mjs`）
- Produces: `splitMbox(text: string): string[]`（各要素は RFC822 のメール文字列。`>From ` のエスケープを戻す）

- [ ] **Step 1: 失敗するテスト（mbox 分割）**

`src/lib/mail/mbox.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { splitMbox } from './mbox'

const MBOX = `From a@example.com Wed Sep 16 10:05:00 2026
Subject: one
Content-Type: text/plain

body one
>From the middle of body

From b@example.com Thu Sep 17 10:05:00 2026
Subject: two

body two
`

describe('splitMbox', () => {
  it('"From " 行で分け、">From " のエスケープを戻す', () => {
    const msgs = splitMbox(MBOX)
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toContain('Subject: one')
    expect(msgs[0]).toContain('\nFrom the middle of body')
    expect(msgs[0]).not.toContain('>From ')
    expect(msgs[1].startsWith('Subject: two')).toBe(true)
  })
  it('空・区切りが無いなら空配列', () => {
    expect(splitMbox('')).toEqual([])
    expect(splitMbox('no separator')).toEqual([])
  })
  it('CRLF でも分けられる', () => {
    expect(splitMbox('From x Wed\r\nSubject: a\r\n\r\nb\r\n')).toEqual(['Subject: a\r\n\r\nb'])
  })
})
```

- [ ] **Step 2: 失敗を確認**

```bash
npx vitest run src/lib/mail/mbox.test.ts
```

- [ ] **Step 3: 実装**

`src/lib/mail/mbox.ts`:

```ts
/**
 * mbox（Gmail Takeout の書き出し形式）を 1 通ずつに分ける。純粋関数。
 * 区切りは行頭の "From "（mboxrd: 本文中の "From " は ">From " にエスケープされているので戻す）。
 */
const SEPARATOR = /^From .*$/m

export function splitMbox(text: string): string[] {
  const out: string[] = []
  let rest = text
  let m = SEPARATOR.exec(rest)
  if (!m) return out
  rest = rest.slice(m.index)
  const parts = rest.split(/^From .*\r?\n/m).filter((p) => p.length > 0)
  for (const part of parts) {
    const unescaped = part.replace(/^>From /gm, 'From ').replace(/\r?\n+$/, '')
    if (unescaped.trim().length > 0) out.push(unescaped)
  }
  return out
}
```

- [ ] **Step 4: 通ることを確認**

```bash
npx vitest run src/lib/mail/mbox.test.ts --coverage.enabled=false
```

- [ ] **Step 5: スクリプト**

`scripts/import-mbox.ts`:

```ts
/**
 * 過去分のメルマガ（Gmail Takeout の mbox）を SQL にする一回きりのスクリプト（設計 2026-09-19 §6）。
 *
 *   npm run import:mbox -- seed.local/mail.mbox --vendors seed.local/out/vendors.json
 *
 * vendors.json は `npx wrangler d1 execute sumai-log --remote --json --command
 *   "SELECT id, name, news_email_domain FROM vendors"` の出力をそのまま保存したもの。
 * 出力 seed.local/out/mails.sql は冪等（message_id / url の重複は DO NOTHING）。
 * 本文・アドレスは標準出力に出さない（集計だけ）。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import PostalMime from 'postal-mime'

import { toJstDateKey } from '../src/lib/jst'
import { splitForwardedBlock } from '../src/lib/mail/forwarded'
import { matchVendorByDomain } from '../src/lib/mail/match'
import { splitMbox } from '../src/lib/mail/mbox'
import { toParsedMail } from '../src/lib/mail/parse'
import { inboundToNews } from '../src/lib/mail/toNews'
import { sqlString } from './lib/seed.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

type VendorRow = { id: string; name: string; news_email_domain: string | null }

function parseArgs(argv: string[]): { mbox: string; vendors: string } {
  const mbox = argv.find((a) => !a.startsWith('--'))
  const vi = argv.indexOf('--vendors')
  const vendors = vi >= 0 ? argv[vi + 1] : undefined
  if (!mbox || !vendors) {
    console.error('usage: tsx scripts/import-mbox.ts <mail.mbox> --vendors <vendors.json>')
    process.exit(1)
  }
  return { mbox: resolve(root, mbox), vendors: resolve(root, vendors) }
}

function loadVendors(path: string): { id: string; name: string; newsEmailDomain: string | null }[] {
  const json = JSON.parse(readFileSync(path, 'utf8')) as { results?: VendorRow[] }[] | VendorRow[]
  const rows: VendorRow[] = Array.isArray(json) && json.length > 0 && 'results' in json[0]
    ? (json as { results?: VendorRow[] }[]).flatMap((r) => r.results ?? [])
    : (json as VendorRow[])
  return rows.map((r) => ({ id: r.id, name: r.name, newsEmailDomain: r.news_email_domain }))
}

async function main() {
  const { mbox, vendors: vendorsPath } = parseArgs(process.argv.slice(2))
  const vendors = loadVendors(vendorsPath)
  const messages = splitMbox(readFileSync(mbox, 'utf8'))
  const nowIso = new Date().toISOString()
  const receivedOn = toJstDateKey(nowIso)

  const lines: string[] = ['-- generated by scripts/import-mbox.ts', 'BEGIN TRANSACTION;']
  const perVendor = new Map<string, number>()
  let unassigned = 0
  let withEvent = 0

  for (const raw of messages) {
    const parsed = await toParsedMail(await PostalMime.parse(raw))
    let fromAddress = parsed.from
    let subject = parsed.subject
    let sentOn = parsed.date ? toJstDateKey(parsed.date) : null
    let bodyText = parsed.text
    const block = splitForwardedBlock(parsed.text)
    if (block) {
      fromAddress = block.from ?? fromAddress
      subject = block.subject ?? subject
      sentOn = block.date ?? sentOn
      bodyText = block.body
    }
    const vendor = matchVendorByDomain(fromAddress, vendors)
    const mailId = crypto.randomUUID()
    const status = vendor ? 'imported' : 'unassigned'
    let newsId: string | null = null
    let newsSql: string | null = null
    if (vendor) {
      const draft = inboundToNews({ messageId: parsed.messageId, subject, text: bodyText, sentOn }, vendor.id, receivedOn)
      newsId = crypto.randomUUID()
      newsSql =
        `INSERT INTO vendor_news (id, vendor_id, url, title, summary, published_on, event_start, event_end, event_kind, mail_id) VALUES (` +
        [newsId, draft.vendorId, draft.url, draft.title, draft.summary, draft.publishedOn, draft.eventStart, draft.eventEnd, draft.eventKind, mailId]
          .map(sqlString)
          .join(', ') +
        `) ON CONFLICT(url) DO NOTHING;`
      perVendor.set(vendor.name, (perVendor.get(vendor.name) ?? 0) + 1)
      if (draft.eventStart) withEvent++
    } else {
      unassigned++
    }
    lines.push(
      `INSERT INTO inbound_mails (id, message_id, received_at, from_address, forwarded_by, subject, sent_on, body_text, body_truncated, status, reject_reason, vendor_id, news_id, created_at, updated_at) VALUES (` +
        [mailId, parsed.messageId, nowIso, fromAddress, 'mbox', subject, sentOn, bodyText, parsed.truncated ? 1 : 0, status, null, vendor?.id ?? null, newsId, nowIso, nowIso]
          .map(sqlString)
          .join(', ') +
        `) ON CONFLICT(message_id) DO NOTHING;`,
    )
    if (newsSql) lines.push(newsSql)
  }
  lines.push('COMMIT;')

  const out = resolve(root, 'seed.local/out/mails.sql')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, lines.join('\n') + '\n')

  console.log(`mails: ${messages.length} 通 → ${out}`)
  for (const [name, n] of perVendor) console.log(`  ${name}: ${n}`)
  console.log(`  未割当: ${unassigned}`)
  console.log(`  日程あり: ${withEvent}`)
  console.log('次: npx wrangler d1 execute sumai-log --remote --file seed.local/out/mails.sql')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
```

`package.json` の scripts に `"import:mbox": "tsx scripts/import-mbox.ts",`（`import:seed` の後）。

`tsconfig.json` の `include` に `scripts/**/*.ts` が無いなら typecheck の対象外のまま（tsx が実行時に型を剥がすだけ）。`npx tsx scripts/import-mbox.ts` で `./lib/seed.mjs` の import が通るか確認する（.mjs の default/named export はそのまま使える）。

- [ ] **Step 6: 架空の mbox で動作確認**

```bash
mkdir -p seed.local/out
cat > /tmp/test.mbox <<'EOF'
From news@vendor.example Wed Sep 16 10:05:00 2026
Message-ID: <mb1@vendor.example>
From: Test Builder <news@vendor.example>
Date: Wed, 16 Sep 2026 10:05:00 +0900
Subject: 完成見学会のご案内
Content-Type: text/plain; charset=utf-8

9月27日(土) 完成見学会を開催します。

From other@nowhere.example Thu Sep 17 10:05:00 2026
Message-ID: <mb2@nowhere.example>
From: other@nowhere.example
Subject: 無関係
Content-Type: text/plain; charset=utf-8

x
EOF
echo '[{"results":[{"id":"11111111-1111-4111-8111-111111111111","name":"テスト工務店","news_email_domain":"vendor.example"}]}]' > /tmp/vendors.json
npm run import:mbox -- /tmp/test.mbox --vendors /tmp/vendors.json
grep -c "INSERT INTO inbound_mails" seed.local/out/mails.sql   # 2
grep -c "INSERT INTO vendor_news" seed.local/out/mails.sql     # 1
grep -c "mail:<mb1@vendor.example>" seed.local/out/mails.sql   # 1
rm seed.local/out/mails.sql /tmp/test.mbox /tmp/vendors.json
```

Expected: 集計が `テスト工務店: 1 / 未割当: 1 / 日程あり: 1`。

- [ ] **Step 7: README**

`README.md` の「### 6. 所有者の作業」の前（または末尾）に節を追加:

````markdown
### メール取込（news@sumai-log.app）

設計: `docs/superpowers/specs/2026-09-19-mail-import-design.md`。

**初回設定（所有者）**

1. 候補 → 業者の編集で「メールの差出人ドメイン」を入れる（メルマガの差出人の `@` の右）
2. Gmail →「設定」→「メール転送と POP/IMAP」→ 転送先アドレスに `news@sumai-log.app` を追加
3. 設定ページ「メール取込」→ 直近の受信の「システム」行を開き、確認コードを Gmail に入力
4. Gmail のフィルタ `from:(<業者Aのドメイン> OR <業者Bのドメイン>)` に「転送先: news@sumai-log.app」を設定

**過去分の一括取込（一回きり）**

1. Gmail（PC）で `from:<ドメインA> OR from:<ドメインB>` を検索 → 全選択 → ラベル `sumai-import`
2. Google Takeout → 「メール」だけ → ラベル `sumai-import` だけ → mbox をダウンロード →
   `seed.local/mail.mbox` に置く（gitignore 済み）
3. 業者一覧を書き出す:
   `npx wrangler d1 execute sumai-log --remote --json --command "SELECT id, name, news_email_domain FROM vendors" > seed.local/out/vendors.json`
4. `npm run import:mbox -- seed.local/mail.mbox --vendors seed.local/out/vendors.json`
5. `npx wrangler d1 execute sumai-log --remote --file seed.local/out/mails.sql`
6. 設定ページで未割当を確認し、業者を選んで取り込む

拒否・システムの受信ログは 30 日で自動的に消える。取込済み・未割当は残る。
````

- [ ] **Step 8: カバレッジ・整形・Commit**

```bash
npm run test:coverage 2>&1 | grep -E "Tests |mail/|threshold|ERROR"
npx prettier --write scripts/import-mbox.ts src/lib/mail README.md && npm run format:check
git add src/lib/mail/mbox.ts src/lib/mail/mbox.test.ts scripts/import-mbox.ts package.json README.md
git commit -m "feat(mail): 過去分の mbox 取込スクリプト（seed.local/out/mails.sql を生成）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: 変更履歴・仕上げ・PR

**Files:**

- Modify: `src/content/changelog.ts`（先頭に 1 項目）
- Modify: `src/lib/pending.ts` は触らない。`src/components/PullToRefresh.tsx` も触らない。

- [ ] **Step 1: 変更履歴**

`CHANGELOG` 配列の先頭に:

```ts
  {
    date: '2026-09-20',
    title: '業者のメルマガをお知らせに取り込む',
    items: [
      'news@sumai-log.app に転送したメルマガが、業者のお知らせとして表示され、見学会は予定の情報レイヤーにも出る',
      '業者の編集に「メールの差出人ドメイン」。一致しないメールは設定の「メール取込」で業者を選んで取り込める',
      'メール由来のお知らせは「メール」バッジ付きで、開くと本文が読める',
    ],
  },
```

`date` は main にマージする日に合わせる。

- [ ] **Step 2: 全チェック**

```bash
npm run typecheck && npm run format:check && npm test 2>&1 | grep -E "Tests |FAIL" && npm run test:coverage 2>&1 | grep -E "threshold|ERROR" ; npm run build 2>&1 | grep -E "error|✓ built"; npm run check:pii
```

Expected: すべて通過。`npm test` は Node 側（`src/lib/mail/*` 5 ファイル分）と workers 側（mails / mailHandler / candidates）が増えている。

- [ ] **Step 3: Commit と PR**

```bash
git add src/content/changelog.ts
git commit -m "docs: 変更履歴にメール取込

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin mail-import
gh pr create --title "メール取込: news@ に転送した業者のメルマガをお知らせに" --body "$(cat <<'EOF'
## 変更
- Worker に `email` ハンドラ。Gmail の自動転送（X-Forwarded-For）と二人からの手動転送だけ受理し、`inbound_mails` に全記録。業者の「メールの差出人ドメイン」に一致すれば `vendor_news` に変換（日程判定は RSS と同じ）
- 設定に「メール取込」カード（転送先・未割当の割当・受信ログ。Gmail の確認コードもここで読める）
- お知らせのメール由来は「メール」バッジ＋ドロワーで本文表示
- 過去分の mbox 取込スクリプト `npm run import:mbox`
- migration 0009（`inbound_mails`・`vendors.news_email_domain`・`vendor_news.mail_id`）

## マージ後にやること
1. `npm run db:migrate:remote`（0009）
2. Email Routing の転送ルール作成（Claude が API で実行）
3. README「メール取込」の初回設定（業者のドメイン → Gmail 転送先 → 確認コード → フィルタ）
4. 過去分: README の一括取込手順

設計: docs/superpowers/specs/2026-09-19-mail-import-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

### Task 16: デプロイ後のインフラ（マージ後・本人の migrate 後に実施）

**Files:** なし（Cloudflare API と本番 D1）

- [ ] **Step 1: マイグレーション**（本人が `!` で実行）

```bash
npm run db:migrate:remote
```

- [ ] **Step 2: 転送ルールを作る**（Claude が cloudflare-api MCP で実行。Worker に `email` ハンドラがデプロイされていることを Workers Builds の成功で確認してから）

```js
async () => {
  const zone = 'f6370db1adcd4aace2361e354cbd5c62'
  return cloudflare.request({
    method: 'POST',
    path: `/zones/${zone}/email/routing/rules`,
    body: {
      name: 'news to worker',
      enabled: true,
      matchers: [{ type: 'literal', field: 'to', value: 'news@sumai-log.app' }],
      actions: [{ type: 'worker', value: ['sumai-log'] }],
    },
  })
}
```

Expected: `success: true`。`GET /zones/{zone}/email/routing/rules` に 1 件増える。

- [ ] **Step 3: 疎通**

本人が自分の Gmail から `news@sumai-log.app` に手動で 1 通送る（本文に「---------- Forwarded message ---------」は無くてよい）→ 数十秒後に設定ページ「直近の受信」に「未割当」または「取込」で出る。出なければ Workers の observability（`mail:` で始まるログ）を見る。

- [ ] **Step 4: メモリ更新**

`project_sumai_log.md` に、転送ルール作成日・残っている本人作業（Gmail 転送先の確認コード・フィルタ・過去分）を追記する。
