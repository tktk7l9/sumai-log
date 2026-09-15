# sumai-log — 夫婦で共有する住まい検討ノート 設計仕様

日付: 2026-09-15 ／ 状態: 承認済み（実装前）

## 1. 背景と目的

夫婦二人で「親族の土地に戸建てを建てる」案と「別のエリアでマンションを買う」案を並行して検討している。住宅展示場・工務店の完成見学会・モデルハウスに足を運び、YouTube で情報収集もしている。記録が二人の頭とスマホの写真に散らばっているので、**予定・見学した事実と感想・観た動画のメモを一箇所に残し、二人がスマホから同じものを見られる**私的な Web アプリを作る。

決まっていること:
- 利用者は二人だけ。公開サイトにしない
- カレンダーはアプリ内で完結（外部カレンダー連携なし）
- **記録だけ**。採点・比較表・意思決定支援は持たない
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
| 記録 | `/records` | 見学記録と YouTube メモを SegmentedControl で切替。サムネ付きカード一覧。FAB→「見学記録」「YouTube」 |
| 候補 | `/candidates` | 戸建て業者とマンション物件を切替。業者は「施工エリアに建築予定地の市区町村（設定値）を含む」フィルタと状態フィルタ |
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
| `vendors` 業者 | name, kind(hm/koumuten/sekkei/developer), hq, serviceAreas(JSON: 市区町村名の配列), uaValue, cValuePublished, seismicGrade, longTermCertified, pricePerTsuboMin/Max(万円), structure, features, status, sourceUrl, websiteUrl | `serviceAreas` に設定値の市区町村を含むかで一覧フィルタ |
| `properties` マンション物件 | name, address, station, walkMinutes, price, areaSqm, layout, builtYear/completionDate, managementFee, repairReserve, listingUrl, status | |
| `places` 場所 | name, kind(showroom/model_house/open_house/gallery/site/other), address, lat, lng, geocodeSource(gsi/manual/null), vendorId?, propertyId?, note | 地図の単位。同じ展示場に何度も行ける |
| `events` 予定 | title, kind(visit/meeting/viewing/other), startsAt, endsAt, allDay, placeId?, vendorId?, propertyId?, note | 終日は日付のみ |
| `visits` 見学記録 | eventId?, placeId, vendorId?, propertyId?, visitedOn, attendees(both/a/b), good, concerns, qa, nextActions | 「聞いたこと/答え」は自由記述 1 欄 |
| `photos` | visitId, displayKey, thumbKey, width, height, caption, sortOrder | R2 キー `photos/{visitId}/{photoId}-{display|thumb}.jpg` |
| `videos` YouTube | url, videoId, title, channel, thumbnailUrl, watchedOn, watchedBy, tags(JSON), takeaways, vendorId? | title/channel/thumbnail は保存時に oEmbed で自動取得（編集可） |
| `comments` | targetType(vendor/property/place/visit/video), targetId, body | 二人がどの記録にも一言足せる汎用の場 |
| `tags` | name, sortOrder | 初期値: 断熱・気密・耐震・間取り・資金・ローン・土地・マンション・管理・設備・外構 |
| `settings` | key, value | `homeAreas`（建築予定地の市区町村、JSON 配列）など。画面から編集 |
| `geocode_cache` | query, lat, lng, fetchedAt | 同じ住所を二度引かない |

`status` は業者・物件で共通: `interested` / `visited` / `consulting` / `shortlisted` / `dropped`。

利用者テーブルは持たない。Access JWT のメール → 表示名と色の対応は secret `MEMBERS`（`email:表示名:色` をカンマ区切り）。

住所→座標: 場所の保存時に国土地理院 住所検索 API（キー不要・同一 IP 10 秒 10 回・継続保証なし）を Worker から 1 回だけ呼び `geocode_cache` に入れる。取れなければ座標の手貼り（度分秒/十進を受ける）。地図に出せない場所は「出せない理由」を画面に書く。

持たないもの: 採点・比較表・通知・外部カレンダー連携・オフライン編集・写真原本の保存・リアルタイム同期・全文検索。

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
3. **Phase 3 仕上げ**: YouTube メモ・ホームのフィード・PWA・デザイン仕上げ・バックアップ手順
4. 業者の初期データは公開情報だけで `data/vendors.seed.json` を作り `npm run import:vendors` で取り込む

## 9. 検証

- 完了基準: `format:check` `typecheck` `test:coverage`（lib 100%）`test:server` `build` `check:pii` が green
- 認証: JWT なし／署名不正／allowlist 外／本番での dev 経路 → 403 を実際に確認
- 写真: iPhone Safari から HEIC を選んで JPEG として保存・20 枚同時・2 MB 超と非画像の拒否・未認証で配信 URL が 403
- 地図: 住所で取れた／手貼り／座標なし の 3 通りの描画と出典表示
- モバイル: 390×844 のスモーク（下タブ・FAB・全画面フォーム・地図・写真グリッド）。1280 でも崩れない
- デプロイ: `wrangler deployments list` の `Created` が最新コミットと一致すること
