# 業者のお知らせ取得（vendor news）設計

2026-09-16 所有者の要望: 「候補業者のお知らせページから 1 日 1 回程度、定期的に情報を取得してタイムラインに表示したい。イベントの予定があればカレンダーにも載せたい。その際、実際に行く予定と、情報として表示する予定を区別したい。」

決定（2026-09-16 ヒアリング）: 表示は **ホームの別ブロック＋ `/news` ページ**（最近の更新には混ぜない）。カレンダーは **情報レイヤーで表示し「行く」で自分の予定に変換**（自動で予定にはしない）。取得は **毎朝 6 時（JST）** に 1 回、設定ページの「今すぐ取得」でも実行できる。

## 1. 取得元と方式

| 業者（既存の候補） | お知らせ URL | 方式 |
|---|---|---|
| あすなろ建築工房 | `https://www.asunaro-studio.com/feed/` | RSS 2.0（サイト全体のフィード。`/information/feed/` は HTML を返すので使わない） |
| 富士ソーラーハウス | `https://www.fsh.co.jp/news/feed/` | RSS 2.0 |
| 小泉木材（Kizuki） | `https://kizuki-home.co.jp/news/feed/` | RSS 2.0（`news` 投稿タイプのフィード。`/feed/` は空） |
| 樹々匠建設 | `https://www.ohki-k.com/` | HTML（トップの `<ul><li>` お知らせ一覧。「YYYY年M月D日」＋タイトル＋相対リンク。RSS なし） |

- 業者ごとの設定は `vendors` に列を足す: `news_url`（取得 URL）、`news_source`（`rss` | `html-list`）、`news_fetched_at`（最終取得）、`news_fetch_error`（最後の失敗理由。成功時は null）。
- 取得は Worker の `scheduled` ハンドラ（Cron `0 21 * * *` = 06:00 JST）。TanStack Start の `src/server.ts`（`createServerEntry`）に `scheduled` を足し、`wrangler.jsonc` の `main` を `./src/server.ts` に変える。`fetch` は既定のハンドラをそのまま使う。
- 1 ソースあたり 10 秒タイムアウト・1 MB 上限・User-Agent 明示。失敗しても他のソースは続行し、`news_fetch_error` に理由を残す。
- 解析はすべて純粋関数（`src/lib/news/`）で、RSS は `<item>` の `title` / `link` / `pubDate` / `description`（タグ除去・最大 300 字）、HTML は `<li>` 内の日付・リンク・テキストを正規表現で抜く。外部 HTML パーサは入れない。

## 2. データ

```
vendor_news
  id            text PK（crypto.randomUUID）
  vendor_id     text → vendors.id（削除時は cascade）
  url           text UNIQUE（重複判定のキー）
  title         text NOT NULL
  summary       text NULL（最大 300 字）
  published_on  text NOT NULL（YYYY-MM-DD。RSS は pubDate、HTML は表記の日付）
  event_start   text NULL（YYYY-MM-DD。イベントと判定したとき）
  event_end     text NULL（YYYY-MM-DD。複数日なら終端、単日なら start と同じ）
  event_kind    text NULL（見学会 / 完成見学会 / 構造見学会 / 相談会 / セミナー / イベント）
  planned_event_id text NULL → events.id（「行く」で作った自分の予定。削除時は set null）
  first_seen_at text NOT NULL（初回取得の日時 = datetime('now')）
  created_at / updated_at 既定
  index (vendor_id, published_on)
```

- 新着だけ INSERT する（`url` が既にあれば何もしない。タイトルの更新は追わない）。
- イベント判定は取得時に 1 回だけ行い、結果を列に保存する（画面側で再解析しない）。
- 自分の予定（`events`）には手を入れない。「行く」は `events` に `kind='visit'`、`title`＝お知らせのタイトル、`startsAt`＝`event_start`（終日）、`vendorId`＝業者、`note`＝お知らせ URL の行を作り、`vendor_news.planned_event_id` に紐づける。すでに紐づいていればボタンは「予定を見る」に変わる。

## 3. イベント日程の抽出（`src/lib/news/eventDate.ts`）

- 対象の文字列: タイトル＋要約。
- 種別語: 完成見学会 / 構造見学会 / 見学会（お住まい見学会・オープンハウスを含む）/ 相談会 / セミナー / イベント。種別語が無ければイベントにしない。
- 日付表現（いずれも投稿日の年を補完。投稿月より 2 か月以上前の月なら翌年とみなす）:
  - `M月D日` `M月D日(土)` `9月12日(土)開催`
  - `M/D` `M/D-/D` `M/D-M/D` `M/D〜M/D` `M/D～D`（`-/D` は同月の終端）
  - `YYYY年M月D日`
  - `D日・D日`・`D日(土)・D日(日)`（列挙は最小〜最大を範囲にする）
  - `11月14日(土)～23日(月祝)`（曜日と祝の注記は無視）
- 抽出できた日が 2 つ以上なら最小を `event_start`、最大を `event_end`。1 つなら両方同じ。日付が無ければイベントにしない。
- 例: 「【お住まい見学会】Clam Chowder House《9月12日(土)開催》」→ 見学会 / 09-12。「7/6-/7『開拓者の家Ⅱ』完成見学会のおしらせ」→ 完成見学会 / 07-06〜07-07。「"均悉想和" 構造見学会 11月17日(土)・18日(日)」→ 構造見学会 / 11-17〜11-18。

## 4. 画面

- **ホーム**: 「業者のお知らせ」ブロック（最新 5 件）。テキスト行＝日付見出し（曜日付き）＋「業者名「タイトル」」（タイトルは外部リンク・新しいタブ）＋イベントなら「見学会 9/12(土)」バッジ。0 件なら「まだお知らせはありません」。
- **`/news`**: 全件（新しい順・50 件ずつ「もっと見る」）。業者の絞り込み Chip。各行にイベントバッジと「行く」ボタン（イベントのみ）。ヘッダに「用語集」と同じ形で「お知らせ」リンク。下タブは 5 つのまま。
- **カレンダー**: 月表示で、自分の予定は今の塗りドット、業者イベントは **枠だけのドット（グレー）**。日別リストでは自分の予定を先に、その下に「情報」バッジ＋業者名＋タイトル＋「行く」。祝日表示はそのまま。
- **設定**: 「業者のお知らせ」カード。業者ごとに取得 URL・最終取得日時・エラー。「今すぐ取得」ボタン（POST の server function で全業者を取得、結果を Notification に）。

## 5. セキュリティ・制約

- 取得先は `vendors.news_url` に保存された URL のみ（画面から自由な URL を叩く口は作らない）。URL の編集は候補の編集フォームで、`https://` のみ許可。
- 取得は `scheduled` と設定ページの「今すぐ取得」（認証後）だけ。
- 保存するテキストはサニタイズ（タグ除去・長さ制限）。表示側は React のエスケープに任せ、`dangerouslySetInnerHTML` は使わない。外部リンクは `rel="noopener noreferrer"`。
- CSP・`compatibility_date` は変更しない。新規 npm 依存は増やさない。

## 6. 所有者の作業（本番）

- マイグレーション 0003 の適用: `npm run db:migrate:remote`（Claude からは本番書き込みが通らない）。
- 4 社の `news_url` / `news_source` は seed に入れてあるので、`seed.local/out/vendors-news.sql`（UPDATE 4 文）を `npx wrangler d1 execute sumai-log --remote --file ... -y` で適用。
- Cron はデプロイで自動有効。翌朝 6 時以降に設定ページの最終取得日時で確認。
