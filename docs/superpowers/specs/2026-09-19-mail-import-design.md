# sumai-log — メール取込（業者のメルマガをお知らせに流し込む）設計仕様

2026-09-19 承認。design.md §10「業者のお知らせ取得」の追加フェーズ。

## 1. 背景と目的

業者のメルマガ（見学会・完成見学会の案内など）は所有者の Gmail にしか届かず、パートナーが
見られない。RSS/HTML から取っている「お知らせ」（`vendor_news`）にメールも同じ形で流し込み、
ホーム・`/news`・カレンダーの情報レイヤー・「行く」（予定化）をそのまま使えるようにする。

- 対象は **業者のメルマガだけ**。Gmail のフィルタで差出人ドメインを `news@sumai-log.app` に
  自動転送する。二人の Gmail からの**手動転送**も受け付ける（フィルタ漏れの救済・過去分）。
- 業者への紐づけは、業者に登録した**差出人ドメイン**で決める。一致しないメールは「未割当」として
  設定ページで業者を選んで取り込む。
- 残すのは **件名と本文テキスト全文**。添付（画像・PDF）は保存しない。
- 過去分（業者 A 64 件・業者 B 21 件）は Gmail Takeout の mbox から**一回きりのスクリプト**で
  SQL を生成し、既存の seed と同じく本人が本番 D1 に流す。

決めたこと（2026-09-16〜19）: ドメイン `sumai-log.app` は取得済み・Email Routing は有効化済み
（MX/SPF/DKIM 自動）・`news@` → Worker の転送ルールは**未作成**（Worker に `email` ハンドラを
デプロイしてから API で作る）。

## 2. 流れ

```
Gmail（所有者）フィルタ → 自動転送 ─┐
Gmail（二人）手動転送 ───────────┼→ news@sumai-log.app → Email Routing ルール
Gmail 転送先の確認メール ─────────┘        ↓
                                   Worker `email` ハンドラ（src/server.ts）
                                          ↓ postal-mime で解析
                                   inbound_mails に 1 行（必ず残す）
                                          ↓ 受理 & 業者一致
                                   vendor_news に 1 行（url = mail:<messageId>）
```

## 3. 受信時の判定（Worker）

`src/server.ts` の `email(message, env, ctx)`。判定は純粋関数 `src/lib/mail/*.ts` に置き、
ハンドラは「読む → 判定 → 書く」だけにする。

1. **サイズ**: `message.rawSize` が 2 MB（`MAX_INPUT_LENGTH` と同じ）を超えたら
   `setReject('too large')`。行は残さない（本文を読まないため）が、`mail: too-large` の
   ログ 1 行だけは出す（件名・本文は出さない）。
2. **解析**: `postal-mime` で `message.raw` を解析（新規依存。design.md §7 の例外として明記）。
   `Message-ID`・`From`・`Subject`・`Date`・`text`・`html`・`X-Forwarded-For` を使う。
   ヘッダの正規化（`toParsedMail`）と**本文のテキスト化（`extractBody`）は分ける**:
   本文の変換は入力サイズに比例して重いので、経路が受理されてから（3 の後で）行う。
   拒否するメールでは本文を触らない（誰でも送れる経路で CPU を使わせない）。
3. **経路の検証**（認可は **エンベロープ送信者** ＝ `message.from` だけで行う。`From` ヘッダや
   `X-Forwarded-For` ヘッダはメール本文の一部で誰でも書ける＝偽装できるため、認可には使わない。
   ただしエンベロープ送信者も「絶対に偽装できない」わけではない: **Email Routing は送信
   ドメインの DMARC ポリシーに従って認証失敗メールを拒否する**ので、`google.com` は
   `p=reject` ＝ system 経路は保護されるが、`gmail.com` は `p=none` のためエンベロープ
   送信者の偽装は Routing を通り得る。ヘッダより強い判定だが完全ではない。
   緩和策: 転送先アドレスを推測できないもの（secret。§7）にする。
   SPF/ARC ヘッダ検証は follow-up（§9））:
   - `message.from` を正規化（`normalizeEnvelopeAddress`: 小文字化・`<>` を外す・ローカル部の
     `+タグ` を除去）。Gmail の自動転送はエンベロープを `owner+caf_=news=<転送先>@gmail.com`
     に書き換える（`+タグ` を戻すと本人のアドレスに一致する）ため、この正規化が必須。
   - 正規化後のドメインが `google.com`（またはそのサブドメイン）かつ `From` ヘッダが
     `forwarding-noreply@google.com`（Gmail の転送先確認）なら **システム**: `status='system'`
     で本文ごと保存し、確認コードを設定ページで読めるようにする。`vendor_news` には入れない。
     `From` だけそれを装っていてもエンベロープが google.com 系でなければ
     `setReject('envelope sender not trusted')` で拒否する。
   - 正規化後のエンベロープが `ACCESS_ALLOWED_EMAILS` に無ければ
     `setReject('envelope sender not allowed')` し、`status='rejected'`・`rejectReason` で残す
     （差出人・件名だけ。本文は保存しない）。ここが唯一の認可判定。
   - エンベロープが許可リストにあれば受理。**自動転送か手動転送か**（見た目の分類。認可には
     関係しない）は `From` ヘッダで決める: `From` が `ACCESS_ALLOWED_EMAILS` に無ければ
     **自動転送**（メール自体が業者のもの。`forwardedBy` = 正規化後のエンベロープ）。
     `From` も `ACCESS_ALLOWED_EMAILS` のどれかなら **手動転送**（本人が書いた／転送した。
     本文先頭の Gmail 転送ブロック — `---------- Forwarded message ---------` に続く
     `From:` `Date:` `Subject:` 行。英語/日本語 UI 両方の見出し語 — から元の差出人・日付・件名を
     復元し、ブロックより下を本文にする。ブロックが無ければ転送したメールそのものを対象にする）。
4. **重複**: `messageId`（元メールの `Message-ID`。手動転送のときも転送ブロック内に無いので
   転送メール自身の `Message-ID`）が `inbound_mails.message_id` に既にあれば何もしない。
   `Message-ID` が無いメールは `sha256(from + subject + date)` を `messageId` の代わりに使う
   （接頭辞 `hash:`）。
5. **業者照合**: 元の差出人のドメイン（`@` の右）を `vendors.news_email_domain`
   （カンマ区切り・小文字・複数可）と照合。**完全一致またはサブドメイン**（`mail.example.com` は
   `example.com` に一致）。一致 → `status='imported'` にして `vendor_news` へ。
   不一致 → `status='unassigned'`（本文は保存する）。
6. **本文のテキスト化**: `text` パートがあればそれ。無ければ `html` を既存の `stripTags`
   （`src/lib/news/text.ts`）でテキスト化。連続する空行は 1 つに畳む。上限 100,000 字
   （超えた分は切り捨て。`inbound_mails.body_truncated=1`）。
7. **お知らせ行**（`vendor_news`）:
   - `url = 'mail:' + messageId`（unique を維持。外部リンクではない印）
   - `title = 件名`（空なら「（件名なし）」）。`summary = 本文先頭 300 字`（既存 `truncate`）
   - `publishedOn = 元メールの Date を JST の YYYY-MM-DD に`（無ければ受信日）
   - `eventStart/End/Kind = extractEvent(件名 + '\n' + 本文, publishedOn)`（RSS と同じ）
   - `mailId = inbound_mails.id`
8. **ログ**: 1 通ごとに `console.log('mail: ...')` を 1 行（status・差出人ドメイン・件名の先頭 40 字。
   本文は出さない）。

`ctx.waitUntil` は使わない（例外が消える罠。`email` ハンドラは処理完了まで await する）。

## 4. データ（migration 0009）

```sql
-- 受信の全記録と、未割当の置き場
CREATE TABLE inbound_mails (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL UNIQUE,          -- 元メールの Message-ID か 'hash:<sha256>'
  received_at TEXT NOT NULL,                -- ISO-8601（受信時刻）
  from_address TEXT NOT NULL,               -- 元の差出人（手動転送なら転送ブロックの From）
  forwarded_by TEXT,                        -- 正規化したエンベロープ送信者（自動転送・手動転送とも）／mbox 取込は 'mbox'
  subject TEXT NOT NULL,
  sent_on TEXT,                             -- 元メールの日付 YYYY-MM-DD（JST）
  body_text TEXT,                           -- rejected は NULL
  body_truncated INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,                     -- imported / unassigned / rejected / system
  reject_reason TEXT,
  vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  news_id TEXT REFERENCES vendor_news(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX inbound_mails_status_received_idx ON inbound_mails(status, received_at);

ALTER TABLE vendor_news ADD COLUMN mail_id TEXT REFERENCES inbound_mails(id) ON DELETE SET NULL;
ALTER TABLE vendors ADD COLUMN news_email_domain TEXT;   -- カンマ区切り・小文字
```

- `vendor_news` の本文は持たない。ドロワーは `mail_id` 経由で `inbound_mails.body_text` を読む
  （二重保存しない）。
- `inbound_mails.created_by` は持たない（人ではなく Worker が作る）。
- **掃除**: 毎朝の Cron（既存 `scheduled`）で `status IN ('rejected','system')` かつ
  `received_at` が 30 日より古い行を削除。`imported`/`unassigned` は残す。

## 5. 画面

- **候補 → 業者フォーム**: 「メールの差出人ドメイン」（`newsEmailDomain`。公式サイトの下。
  例 `example.com, mail.example.com`。保存時に小文字化・空白除去・`@` があれば右側だけ）。
  業者詳細にも表示（設定済みのときだけ）。
- **設定 → 「メール取込」カード**（お知らせカードの下）:
  - 転送先アドレス（secret `MAIL_INBOX_ADDRESS`。未設定なら「未設定（secret MAIL_INBOX_ADDRESS）」）と
    Gmail 側の手順 2 行。
  - **未割当** `N` 件: 各行に 受信日時・差出人・件名・本文の先頭 100 字、業者 Select、
    「取り込む」「削除」。取り込むと §3-7 と同じ変換で `vendor_news` に入り `status='imported'`。
  - **直近の受信ログ** 20 件: 日時・差出人・件名・結果（取込／未割当／拒否／システム）。
    `system` 行は本文（確認コード）を展開して読める。
- **お知らせ**（ホーム／`/news`／カレンダー情報レイヤー／`NewsEventDrawer`）:
  - `url` が `mail:` で始まる行は「メール」バッジを付け、ドロワーでは外部リンクの代わりに本文
    テキストを `white-space: pre-wrap` で表示（長ければドロワー内スクロール）。「行く」は従来どおり。
  - 一覧の行（`NewsAgenda`）は変えない（タイトル・日付・業者名のまま）。

## 6. 過去分の一括取込（一回きりのスクリプト）

`scripts/import-mbox.ts`（`npm run import:mbox -- seed.local/mail.mbox`）:

1. mbox を `From ` 行で分割し、各メールを **Worker と同じ純粋関数**（`src/lib/mail/*` を
   Node から import。postal-mime は Node でも動く）で解析・判定する。`X-Forwarded-For` は
   無いので「所有者の Gmail から取り出した mbox」＝受理扱い（`forwarded_by` は
   `'mbox'`）。
2. 業者の照合は本番の `vendors.news_email_domain` で行う。スクリプトは
   `--vendors seed.local/out/vendors.json` を受け取り、そのファイルは本人が
   `npx wrangler d1 execute sumai-log --remote --json --command "SELECT id,name,news_email_domain FROM vendors"`
   の出力を保存して作る（README に 1 行コマンドを書く。業者フォームでドメインを入力してから）。
3. 出力は `seed.local/out/mails.sql`（`INSERT ... ON CONFLICT(message_id) DO NOTHING` と
   `INSERT INTO vendor_news ... ON CONFLICT(url) DO NOTHING`）。実行は本人が `!` で
   `npx wrangler d1 execute sumai-log --remote --file seed.local/out/mails.sql`。冪等。
4. 不一致（未割当）も SQL に含める（設定ページで割り当てられる）。集計を標準出力に出す
   （総数・業者別・未割当・日程あり）。

本人の手順（README「メール取込」）: Gmail で `from:<業者Aのドメイン> OR from:<業者Bのドメイン>` を
検索 → 全選択 → ラベル `sumai-import` → Google Takeout（メールのみ・そのラベルだけ）→ mbox を
`seed.local/mail.mbox` に置く。

## 7. インフラ

- **転送先アドレスは secret**（§3-3 の緩和策）: local part は推測できないランダムなもの
  （`news-xxxxxxxx@sumai-log.app` の形）にし、リポジトリには書かない。本番は
  `printf '%s' 'news-xxxxxxxx@sumai-log.app' | npx wrangler secret put MAIL_INBOX_ADDRESS`。
  他の secret と同じく Keyway にも push する。`.dev.vars` では空でよい（設定ページに
  「未設定」と出るだけ）。
- **Email Routing ルール**（こちらが API で作成。Worker デプロイ後）:
  `POST /zones/f6370db1…/email/routing/rules`
  `{ matchers:[{type:'literal',field:'to',value:'<secret と同じアドレス>'}], actions:[{type:'worker',value:['sumai-log']}], enabled:true, name:'news to worker' }`。
  matcher のアドレスは secret `MAIL_INBOX_ADDRESS` と同じでなければならない（設定ページに
  出るアドレスが実際の宛先になる）。catch-all は drop のまま。
- **wrangler.jsonc**: var は無し（`MAIL_INBOX_ADDRESS` は secret）。バインディングも不要
  （受信は Routing 側の設定だけ）。
- **本人**: Gmail →「メール転送と POP/IMAP」→ 転送先にそのアドレスを追加 → 設定ページの
  受信ログ（system 行）に出る確認コードを入力 → フィルタ `from:(<業者Aのドメイン> OR <業者Bのドメイン>)`
  に「転送」を設定。業者 2 社の差出人ドメインを業者フォームに入力。

## 8. コード構成

- `src/lib/mail/parse.ts` — postal-mime の結果を `ParsedMail`（from/subject/date/messageId/
  forwardedFor）に正規化（`toParsedMail`。件名・アドレスは上限で切る）と、本文のテキスト化
  （`extractBody`。HTML → テキスト、上限）。本文は認可の後でしか作らない（§3-2）。
- `src/lib/mail/forwarded.ts` — Gmail 手動転送ブロックの解析（`splitForwardedBlock`）。
- `src/lib/mail/route.ts` — 経路判定 `classifyRoute(parsed, allowlist, envelopeFrom)` →
  `{ kind: 'auto'|'manual'|'system'|'rejected', forwardedBy, reason }`。認可はヘッダではなく
  エンベロープ送信者で行う（その限界は §3-3）。
- `src/lib/mail/match.ts` — `matchVendorByDomain(fromAddress, vendors)`・
  `normalizeDomains(input)`（フォーム保存用）。
- `src/lib/mail/toNews.ts` — `inboundToNews(mail, vendorId)`（§3-7 の変換。extractEvent 呼び出し）。
- `src/server/repository/mails.ts` — insert/list/assign/delete/cleanup。
- `src/server/mails.ts` — server fn（`listInboundMails`・`assignMail`・`deleteMail`）。
- `src/server/mailHandler.ts` — `handleInboundMail(message, env)`（server.ts から呼ぶ）。
- `src/server.ts` — `email` ハンドラ追加、`scheduled` に cleanup を追加。
- `scripts/import-mbox.ts` + `src/lib/mail/mbox.ts`（分割。mbox 分割は lib に置いて
  100% カバレッジのゲートに乗せる）。

lib は 100% カバレッジ（既存ゲート）。repository/handler は vitest（workers）で
`inbound_mails`→`vendor_news` まで通す。`wrangler dev` では
`curl -X POST 'http://localhost:3000/cdn-cgi/handler/email?from=…&to=news@sumai-log.app' --data-binary @fixture.eml`
で手元確認（README に記載。fixture は架空の差出人・本文）。

## 9. 見送るもの

添付の保存／メールの送信・返信／未割当の自動学習（一度割り当てたドメインを業者に自動登録する。
必要になったら「取り込む」時に「このドメインを業者に登録」チェックを足す）／
Gmail 以外の転送元（Outlook 等は `X-Forwarded-For` を付けないので手動転送で代替）／
`Authentication-Results`/ARC（`d=google.com`）の検証による自動転送の厳密な認証
（実メールでヘッダを確認してから）。

## 10. PII とテスト

テスト・fixture に実在のアドレス・氏名・業者ドメインを書かない（`example.com` 系）。
本番の差出人ドメインは業者フォーム（D1）にだけ入る。`npm run check:pii` を通す。
