# sumai-log — 夫婦で共有する住まい検討ノート 設計仕様

日付: 2026-09-15 ／ 状態: 承認済み（実装前）

## 1. 背景と目的

夫婦二人で「親族の土地に戸建てを建てる」案と「別のエリアでマンションを買う」案を並行して検討している。住宅展示場・工務店の完成見学会・モデルハウスに足を運び、YouTube で情報収集もしている。記録が二人の頭とスマホの写真に散らばっているので、**予定・見学した事実と感想・観た動画のメモを一箇所に残し、二人がスマホから同じものを見られる**私的な Web アプリを作る。

決まっていること:
- 利用者は二人だけ。公開サイトにしない
- カレンダーはアプリ内で完結（外部カレンダー連携なし）
- **記録だけ**。採点・意思決定支援は持たない。比較表だけは 2026-09-22 に例外として追加した（候補の業者を横に並べる `/candidates/compare`。順位付け・採点はしない。「調査メモ」（`vendors.research`）と「建築計画」（`settings.buildPlan`: 階数・坪数・土地以外の予算の 3 点）を元にする）
- 写真はスマホからアプリへ直接アップロード
- モバイルファースト。UI/UX にこだわる

土地・資金・相続などの一次情報はこのアプリの外（個人のノート）にあり、アプリはそれを複製しない。

## 2. 技術スタック

| 分岐 | 判断 | 根拠 |
|---|---|---|
| フレームワーク | **TanStack Start on Cloudflare Workers** | 小規模でサーバーが要る。Cloudflare Vite plugin が公式サポート |
| UI | **Mantine v9** | モバイルファーストのシェル（下タブ／FAB／全画面 Drawer）を組む |
| DB | **D1 + Drizzle** | 無料枠 読取500万/日・書込10万/日・5GB |
| ストレージ | **R2**（非公開バケット） | 無料枠 10GB・egress 無料。写真は端末側で縮小して上げる |
| 認証 | **Cloudflare Access（Google IdP）** | 「一部の人にだけ公開」。無料50ユーザー。セッション1ヶ月 |
| メール | なし | 通知は持たない。要るなら Cloudflare Email Service |
| リアルタイム同期 | なし | 二人なので再取得で足りる |
| 画像変換 | なし | 端末側 Canvas 縮小で足りる |
| 環境変数 | **Keyway**（`.dev.vars` を管理） | 本番の正本は Cloudflare の secret |

不採用: Next.js + Supabase（無料枠の停止リスク）／バックエンドなし静的 PWA（二人同時編集の競合）。

## 3. 画面構成（モバイルファースト）

下タブ 5 つ、追加は右下 FAB、フォームはスマホでは全画面 Drawer。デスクトップでは同じ 5 項目を左ナビに出す（AppShell の `footer` をモバイル、`navbar` をデスクトップ）。

| タブ | ルート | 役割 |
|---|---|---|
| ホーム | `/` | 次の予定 3 件・「記録を書きませんか」（終わった予定で見学記録が無いもの）・二人の最近の更新フィード |
| 予定 | `/calendar` | 月カレンダー（`@mantine/dates` の `renderDay` で予定ドット）＋選択日のリスト。種別=見学/打合せ/内覧/その他 |
| 記録 | `/records`（`?tab=visits\|videos`） | 見学記録と YouTube メモを SegmentedControl で切替。サムネ付きカード一覧。FAB は 2 択メニューではなく、アクティブなタブに応じてラベルが変わる（見学記録タブ→「記録を書く」／YouTube タブ→「YouTube」） |
| 候補 | `/candidates` | 戸建て業者とマンション物件を切替。業者は「施工エリアに建築予定地の市区町村（設定値）を含む」フィルタと状態フィルタ |
| 候補の比較 | `/candidates/compare` | 業者を列、項目（登録済みの数値・調査メモの事実・建築計画に対する目安）を行にした比較表。見送りは既定で隠す。2026-09-22 追加 |
| 区画シミュレーター | `/site` | 大きな土地（長方形で近似）の一部を敷地として切り出し、区画と平屋を図の上で動かして面積・接道（路地状部分）・残りの土地の接道・建ぺい率/容積率・外壁後退・南側の空きを確かめる。ヘッダから開く。2026-09-23 追加 |
| 地図 | `/map` | Leaflet + 地理院タイル。行った場所は塗りピン、予定だけの場所は枠ピン。タップで下からカード→詳細へ。現在地ボタン |

詳細: `/candidates/vendors/$id` `/candidates/properties/$id` `/places/$id` `/records/visits/$id` `/records/videos/$id`。設定 `/settings`（建築予定地の市区町村・タグ一覧・自分の表示名）。

デザイン方針:
- 「管理画面」の見た目から離れる。暖色の中立パレットにアクセント 1 色、Noto Sans JP。カード主体・写真を大きく
- 二人それぞれに色を割り当て、作成者チップ・アバターに使う
- ダークモードは Mantine の `auto`
- 実装時に `frontend-design` スキルで具体化する

## 4. データモデル（D1 / Drizzle）

共通列: `id`(text, nanoid)・`createdAt`・`updatedAt`(ISO-8601 TEXT)・`createdBy`(メール)。金額は円の整数、面積は小数。

| テーブル | 主な列 | 備考 |
|---|---|---|
| `vendors` 業者 | name, kind(hm/koumuten/sekkei/developer), hq, serviceAreas(JSON: 市区町村名の配列), uaValue, cValuePublished, seismicGrade, longTermCertified, pricePerTsuboMin/Max(万円), structure, features, status, sourceUrl, websiteUrl, research(JSON: 調査メモ。`src/lib/research.ts` の VendorResearch) | `serviceAreas` に設定値の市区町村を含むかで一覧フィルタ。`research` は業者フォームとは別の「調査メモ」フォームだけが書く |
| `properties` マンション物件 | name, address, station, walkMinutes, price, areaSqm, layout, builtYear/completionDate, managementFee, repairReserve, listingUrl, status | |
| `places` 場所 | name, kind(showroom/model_house/open_house/gallery/site/other), address, lat, lng, geocodeSource(gsi/manual/null), vendorId?, propertyId?, note | 地図の単位。同じ展示場に何度も行ける |
| `events` 予定 | title, kind(visit/meeting/viewing/other), startsAt, endsAt, allDay, placeId?, vendorId?, propertyId?, note | 終日は日付のみ |
| `visits` 見学記録 | eventId?, placeId?, vendorId?, propertyId?, visitedOn, attendees(both/a/b), good, concerns, qa, nextActions | 「聞いたこと/答え」は自由記述 1 欄。`placeId` は null 可（場所を伴わない業者との打ち合わせ等） |
| `photos` | visitId, displayKey, thumbKey, width, height, caption, sortOrder | R2 キー `photos/{visitId}/{photoId}-{display|thumb}.jpg`。`caption`/`sortOrder` は列としては Phase 2 で持つが、編集 UI（キャプション入力・並べ替え）は Phase 3 |
| `videos` YouTube | url, videoId, title, channel, thumbnailUrl, watchedOn, watchedBy, tags(JSON), takeaways, vendorId? | title/channel/thumbnail は保存時に oEmbed で自動取得（編集可） |
| `comments` | targetType(vendor/property/place/visit/video), targetId, body | 二人がどの記録にも一言足せる汎用の場 |
| `tags` | name, sortOrder | 初期値: 断熱・気密・耐震・間取り・資金・ローン・土地・マンション・管理・設備・外構 |
| `settings` | key, value | `homeAreas`（建築予定地の市区町村、JSON 配列）、`buildPlan`（建築計画: floors/tsuboMin/tsuboMax/budgetManYen、JSON）、`sitePlan`（区画シミュレーターの寸法。`src/lib/sitePlan.ts` の SitePlan。長方形の寸法・区画・建物・法規の目安の数値だけで、所在地・地番・座標は持たない）など。画面から編集 |
| `geocode_cache` | query, lat, lng, fetchedAt | 同じ住所を二度引かない |

`status` は業者・物件で共通: `interested` / `visited` / `consulting` / `shortlisted` / `dropped`。

利用者テーブルは持たない。Access JWT のメール → 表示名と色の対応は secret `MEMBERS`（`email:表示名:色` をカンマ区切り）。

住所→座標: 場所の保存時に国土地理院 住所検索 API（キー不要・同一 IP 10 秒 10 回・継続保証なし）を Worker から 1 回だけ呼び `geocode_cache` に入れる。取れなければ座標の手貼り（度分秒/十進を受ける）。地図に出せない場所は「出せない理由」を画面に書く。

持たないもの: 採点・通知・外部カレンダー連携・オフライン編集・写真原本の保存・リアルタイム同期・全文検索（比較表は §1 のとおり 2026-09-22 に例外として追加）。

## 5. 認証・環境変数

- Cloudflare Access のアプリを Worker の既定 URL に作る。ポリシー= Emails に二人。セッション 1 ヶ月
- Worker 側でも JWT を検証し allowlist と突き合わせる（fail closed。`ENVIRONMENT` の既定は `production`）。判定は `src/lib/access.ts` に集約し、`src/start.ts` のグローバルミドルウェアで全リクエストに適用する
- `wrangler.jsonc` `vars`: `ENVIRONMENT`・`ACCESS_TEAM_DOMAIN`・`ACCESS_POLICY_AUD`（非秘密）
- secret（`wrangler secret put`）: `ACCESS_ALLOWED_EMAILS`・`MEMBERS`。**メールアドレスをリポジトリに書かない**
- ローカル `.dev.vars`: `ENVIRONMENT=development`・`DEV_IDENTITY_EMAIL`・`ACCESS_ALLOWED_EMAILS`・`MEMBERS`。雛形 `.dev.vars.example` は架空値
- Keyway: `keyway pull -e development -f .dev.vars -y` で引く。`keyway run` は wrangler に効かないので使わない。`-e` は必ず明示
- `.gitignore`: `.dev.vars*` `!.dev.vars.example` `.env` `.env.*` `!.env*.example`。`git check-ignore` で検証

## 6. 写真・外部 API・セキュリティ

- アップロード: `<input type="file" accept="image/*" multiple>`（`image/heic` は書かない。Safari 17+ で拡張子が壊れる既知バグ）。端末側 Canvas で表示用 1600px JPEG q0.8 とサムネ 400px を生成し multipart POST → Worker → R2。1 回 20 枚・縮小後 2 MB 上限・マジックバイトで JPEG/PNG/WebP 以外を拒否
- 配信: 認証後に R2 からストリーム。`Cache-Control: private, max-age=31536000, immutable` + ETag。バケットは公開設定にしない
- YouTube: Worker から `https://www.youtube.com/oembed` を取得。受け付けるホストは `youtube.com` / `youtu.be` のみ。失敗時は題名手入力
  - 実装メモ（2026-09-16）: `src/routes/api.oembed.tsx` が oEmbed を Worker 経由でプロキシする。ホストは allowlist、動画 ID は 11 文字であることを検証し、5 秒タイムアウト。題名/チャンネルは長さ上限つきで受け取る。200 のレスポンスには `Cache-Control: private, max-age=86400` を付け、取得に失敗した場合は題名の手入力にフォールバックする
  - ホームの「最近の更新」フィードは UNION SQL を書かず、ドメインごとの `recent*`（見学記録・予定・業者・物件・場所・動画・コメント・写真）を並行取得し、`mergeFeed`（`src/lib/feed.ts`）で 1 つに結合する。各 `FeedItem.href` はルートの動的パラメータを `params`、カレンダーの選択日など画面固有のクエリを `search` に持つ（例: 予定は `/calendar` に `search: { d: 日付 }`）
- 地図: タイル `https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png`。出典表示「地理院タイル」を必ず出す
- CSP: `img-src 'self' data: blob: https://i.ytimg.com https://cyberjapandata.gsi.go.jp`、`connect-src 'self'`。`robots: noindex, nofollow, noarchive`
- CSRF: Origin / Sec-Fetch-Site 検査

## 7. コード構成の約束

- `src/lib/` は純粋関数のみ（バインディング・ネットワーク・時刻を持ち込まない）。カバレッジ 100% ゲート
- 副作用は `src/server/`、DB は `src/db/`、UI は `src/components/` と `src/routes/`
- 新規 lib: `calendar.ts`・`pending.ts`・`feed.ts`・`youtube.ts`・`geocode.ts`・`serviceArea.ts`・`photos.ts`・`members.ts`・`status.ts`
- 実データ・PII（メール・氏名・住所・座標）をコード/テスト/seed に書かない。テストは架空値。`npm run check:pii` をコミット前に通す

## 8. 実装の段階

1. **Phase 1 土台**: リポジトリ・Access・D1/R2・Keyway・CI・モバイルシェル・テーマ・候補（業者/物件）・場所・地図・設定
2. **Phase 2 記録**: 予定・見学記録・写真・コメント・「記録を書きませんか」
3. **Phase 3 仕上げ**: YouTube メモ・ホームのフィード・PWA・デザイン仕上げ・バックアップ手順。
   **実装済み（2026-09-16）**: oEmbed プロキシ・「最近の更新」フィード・ホーム画面追加（manifest・
   アイコン・セーフエリア）・暖色パレットへのデザイン仕上げ・繰り越し負債の回収まで完了（PR #4）
4. 業者の初期データは公開情報だけで `data/vendors.seed.json` を作り `npm run import:vendors` で取り込む

## 9. 検証

- 完了基準: `format:check` `typecheck` `test:coverage`（lib 100%）`test:server` `build` `check:pii` が green
- 認証: JWT なし／署名不正／allowlist 外／本番での dev 経路 → 403 を実際に確認
- 写真: iPhone Safari から HEIC を選んで JPEG として保存・20 枚同時・2 MB 超と非画像の拒否・未認証で配信 URL が 403
  （この 3 点は実機/本番でしか確認できないため、開発環境ではなくデプロイ後に確認する）
- 地図: 住所で取れた／手貼り／座標なし の 3 通りの描画と出典表示
- モバイル: 390×844 のスモーク（下タブ・FAB・全画面フォーム・地図・写真グリッド）。1280 でも崩れない
- デプロイ: `wrangler deployments list` の `Created` が最新コミットと一致すること

## 10. 業者のお知らせ取得（2026-09-16 追加）

候補業者のお知らせページから 1 日 1 回、定期的に情報を取得しタイムライン表示・カレンダーの
情報レイヤーに載せる機能。詳細（取得元と方式・データ設計・イベント日程の抽出・画面・
セキュリティ制約・所有者の作業）は別紙: `docs/superpowers/specs/2026-09-16-vendor-news-design.md`。

`## 4. データモデル`（本紙）への追加分:

- `vendor_news`（新規テーブル。migration 0003）: `vendor_id`（→ `vendors.id`、削除時 cascade）・
  `url`（UNIQUE、新着判定のキー）・`title`・`summary`・`published_on`・`event_start`/
  `event_end`/`event_kind`（イベントと判定したときだけ）・`planned_event_id`（→ `events.id`、
  「行く」で作った自分の予定。削除時 set null）・`first_seen_at`
- `vendors` への追加列（migration 0003）: `news_url`・`news_source`（`rss` | `html-list`）・
  `news_fetched_at`・`news_fetch_error`
- `vendors` への追加列（migration 0004）: `representative`（代表者名。任意）・`affiliations`
  （加盟団体 id の JSON 配列。既定 `[]`。`src/content/affiliations.ts` のデータと結びつき、
  用語集の該当語へバッジから飛べる）

Cron（`wrangler.jsonc` の `triggers.crons`）と Worker の自前エントリ（`src/server.ts`）は
`AGENTS.md` を参照。
