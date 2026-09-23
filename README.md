# sumai-log — 住まいログ

[![Keyway Secrets](https://www.keyway.sh/badge.svg?repo=tktk7l9/sumai-log)](https://www.keyway.sh/vaults/tktk7l9/sumai-log)

夫婦二人で使う、住まい探しの記録アプリ。見学した物件・依頼した業者・気になった土地を、
候補ごとにメモ・写真・地図つきで残していく。リポジトリは public だが、実データ
（二人のメール・表示名・見学先の住所や座標など）は D1 / R2 にしか置かず、コードには書かない。

## できること

- **予定**: 月カレンダーで見学・打合せなどの予定を追加・編集・削除。場所を選ぶと業者／物件を
  自動で補完する
- **記録**: 見学記録の一覧・詳細・フォーム。良かった点・気になる点・聞いたこと/答え・次の
  アクションを残す。見学記録 / YouTube メモは SegmentedControl で切替（`/records?tab=videos`）。
  新規作成の日付（見学日・観た日）は今日が既定で入る。
  日付表示は全ページで `YYYY/MM/DD（曜）` に統一
- **YouTube メモ**: 動画の URL を貼ると題名・チャンネル・サムネイルを自動取得
  （`GET /api/oembed?url=`）。取得できなければ題名を手入力。タグ・学び・コメントを残せる
- **写真**: 見学記録に写真を追加。並び替えモード（1 枚ずつ左右へ移動）・全画面ビューア
  （スワイプ/矢印キーで前後の写真へ移動）・削除ができる（仕様は下記）
- **コメント**: 見学記録・業者・物件・場所・YouTube メモそれぞれの詳細に、二人が一言ずつ残せる。
  削除できるのは自分のコメントだけ
- **ホーム**: これからの予定（今日以降の予定を期間で切らずに全部。AgendaView）、業者の
  お知らせ（最新 5 件）、「記録を書きませんか」（終わった予定のうち見学記録が無いもの）、
  二人の最近の更新フィード（見学記録・予定・業者・物件・場所・YouTube メモ・コメント・写真を
  新しい順に）を表示。ホームと予定タブでは、終わった予定（今日のうちに過ぎたもの）と終わった
  日程のお知らせは色を落として「これから」と見分けられるようにする
- **候補（業者/物件）**: 業者の公式サイト・SNS をアイコンリンクで表示する（詳細は下記）。
  工務店には代表者名・代表者の顔写真（ファイル選択または URL 取り込み）・加盟団体（家づくり
  百貨／未来へつなぐ工務店の会／構造塾マップ。バッジから用語集の解説へ飛べる）も表示でき、
  種別（工務店/ハウスメーカー/設計事務所/その他）ごとにグルーピングして一覧に出す。業者の
  公式サイトのファビコンを取得して一覧・詳細のアイコンに使う（設定ページの「候補のサイト
  アイコン」から一括取得も可能）。業者ごとに**調査メモ**（一言・比較表に出す事実・読み物・
  出典）を書け、`/candidates/compare` の**比較表**に横に並ぶ。設定の**建築計画**（階数・
  坪数・土地以外の予算）を登録すると、坪単価から本体・総額の目安と予算判定も並ぶ
  （本体＝坪単価×坪数、総額＝本体÷0.7 の換算。順位付け・採点はしない）。比較表では列の見出しから
  業者を個別に非表示にでき（`?h=` に保持）、表の上のチップから戻せる
- **お知らせ**: 候補業者のお知らせページを毎朝 6 時（JST）に自動取得する（RSS または
  トップページのお知らせ一覧）。ホームに最新 5 件、`/news` に全件を
  [AgendaView](https://mantine.dev/schedule/agenda-view/) で表示する。見学会などの
  イベントと判定したお知らせはカレンダーに「情報」として表示し、「行く」を押すと自分の
  予定に変換できる。設定ページの「今すぐ取得」で手動実行も可能
- **取得を拒否するサイトへの対応**: 一部の業者サイトは Cloudflare Workers からのアクセスを
  User-Agent に関係なく一律拒否する（HTTP 403 が多く、まれに 401/451）。この場合、お知らせ
  ・サイトアイコンとも自動取得できない。設定ページには「サイト側が Cloudflare からのアクセス
  を拒否（HTTP 403）」とそのまま表示する（取得の実装が悪いように見せない）。サイトアイコンは
  業者フォームの「サイトのアイコン」から手動でアップロードできる（PNG/JPEG/WebP/ICO・
  512KB まで）。お知らせは自動取得できないため URL を空にしておく（メール取り込みは今後の
  予定）
- **情報収集**（`/sources`）: 家づくりの情報収集に使っている YouTube チャンネル等を
  ジャンル別（候補の会社／加盟団体／家づくりの知識／他地域の工務店・設計／ハウスメーカー
  比較／マンション・リノベ／お金・ローン／太陽光・省エネ／施主の記録）に一覧表示する。
  URL を貼って「取得」を押すとチャンネル名・説明・アイコンを自動入力（YouTube チャンネルの
  URL のみ対応）。候補の業者・加盟団体と紐づけるとバッジから該当ページへ飛べる
- **区画シミュレーター**（`/site`、ヘッダのアイコン）: 大きな土地の一部を敷地にするとき、道路側（手前）と奥の
  どちらに区画を取るかを図の上で指で動かして比べる。奥に取ると道路までの通路（路地状部分）を
  敷地に含め、接道・残りの土地の接道・建ぺい率/容積率・外壁後退・南側の空きを判定する。手前に
  取っても奥の残りの土地（月極駐車場など）へ出入りできるよう、土地の端に道路から奥までの通路を
  空けておける（幅・左右を指定。区画はその帯にかからない）。土地は長方形で近似し、保存するのは
  寸法の数値だけ（二人で共有）
- **地図**: Google マップで見学した場所・予定の場所を表示。「地図 / 一覧」で切り替えられ
  （`/map?view=list`）、一覧では座標が出せず地図に載らない場所も理由つきで確認できる
- **用語集**: 断熱・耐震・お金・進め方などの用語 46 語と図解 14 点。検索・カテゴリで絞り込み、
  関連語バッジや候補カードの UA 値などの目安バッジから該当語へ飛べる
- **PWA**: manifest とアイコンを用意済み（新しいアプリアイコン）。ホーム画面に追加すると
  アプリのように起動できる（手順は「所有者の作業」を参照）

### 写真の仕様

- アップロード前に端末（ブラウザの Canvas）で表示用 1600px・サムネ 400px の JPEG（quality
  0.8）に縮小してから送信する。**元の画像はサーバーに保存しない**（スマホ側にそのまま残る）
- 1 回のアップロードは最大 20 枚、縮小後のファイルは 1 枚あたり 2MB まで
- 受け付ける形式は JPEG / PNG / WebP（マジックバイトで判定し、それ以外は拒否する）
- R2 バケットは非公開。配信は認証後に Worker がストリームする

### 業者の SNS リンク

公式サイト・SNS の URL は 1 行に 1 件で入力する。`http://` または `https://` で始まらない行は
保存時に無視される。ドメインから Instagram / X / YouTube / Facebook / TikTok / LINE / Threads /
note を自動判定してアイコン付きリンクを出し、それ以外は汎用リンクアイコンになる。

## 技術構成

| 領域           | 採用                                                |
| -------------- | --------------------------------------------------- |
| フレームワーク | TanStack Start (React 19) on Cloudflare Workers     |
| UI             | Mantine v9                                          |
| DB             | Cloudflare D1 + Drizzle ORM                         |
| ファイル       | Cloudflare R2（非公開バケット・Phase 2）            |
| 地図           | Google Maps JavaScript API（AdvancedMarker）        |
| 認証           | Cloudflare Access（Google IdP）＋アプリ側 allowlist |

## セットアップ

```bash
npm install
cp .dev.vars.example .dev.vars   # 二人のメール・表示名を自分たちの値に書き換える
npm run db:migrate:local
npm run dev                      # http://localhost:3000
```

ローカルには Cloudflare Access が無いため、`.dev.vars` の `ENVIRONMENT=development` と
`DEV_IDENTITY_EMAIL` で認証を代替する。`wrangler.jsonc` の既定は `production` なので、
設定漏れがあっても本番でこの開発用経路が有効になることはない。

## よく使うコマンド

| コマンド                          | 内容                                                   |
| --------------------------------- | ------------------------------------------------------ |
| `npm run dev`                     | 開発サーバー                                           |
| `npm run typecheck`               | 型チェック                                             |
| `npm run test:coverage`           | 純粋関数のテスト＋カバレッジ（`src/lib` は 100% 必須） |
| `npm run test:server`             | 実 Workers ランタイム＋D1 に対するサーバー層のテスト   |
| `npm run format` / `format:check` | Prettier 整形／整形チェック                            |
| `npm run check:pii`               | 実データの混入チェック（照合元は `.dev.vars`）         |
| `npm run db:generate`             | `src/db/schema.ts` からマイグレーション生成            |
| `npm run db:migrate:local`        | ローカル D1 へ適用                                     |
| `npm run db:migrate:remote`       | 本番 D1 へ適用                                         |
| `npm run deploy`                  | ビルドしてデプロイ                                     |

### メール受信のローカル確認

`wrangler dev` はメール投入用のエンドポイントを持つ（`npm run dev` の Vite 開発サーバーには無い）。

```bash
npm run build && npx wrangler dev --port 8787
# 別ターミナルで（fixture は架空の差出人・本文）
curl -X POST 'http://localhost:8787/cdn-cgi/handler/email?from=owner@example.com&to=news-xxxxxxxx@sumai-log.app' \
  -H 'Content-Type: message/rfc822' --data-binary @test/fixtures/mail-auto.eml
```

認可はエンベロープ送信者（`from=`）で行うので、`.dev.vars` の `ACCESS_ALLOWED_EMAILS`（または `MAIL_ALLOWED_SENDERS`）に
あるアドレスを使う（業者のアドレスを入れると `mail: rejected ...` になる）。

結果は `wrangler dev` のログ（`mail: imported ...`）と、設定ページの「メール取込」で確認する。

## 本番

デプロイ先: `https://sumai-log.saitotakuya0719.workers.dev`（Cloudflare Access の背後）。
カスタムドメイン `https://sumai-log.app`（`wrangler.jsonc` の `routes`）からも同じ内容が
開く。どちらも Access アプリの対象で、セッションはホスト名ごとに別（手順は「所有者の作業」
を参照）。Worker は Access 設定（`ACCESS_TEAM_DOMAIN` / `ACCESS_POLICY_AUD`）か allowlist secret が
欠けていると **必ず 403 を返す**（fail-closed）。以下は初回構築の手順（実施済み）と、
以後の運用手順。

### 前提

```bash
npx wrangler login       # 未ログインなら
npx wrangler whoami       # account id を確認
```

### 1. D1 と R2

```bash
npx wrangler d1 create sumai-log            # 出力の database_id を wrangler.jsonc に貼る
npx wrangler r2 bucket create sumai-log-photos
npm run db:migrate:remote                   # drizzle/migrations の全件を本番 D1 に適用
```

同名の資源が既にあれば `npx wrangler d1 list` / `npx wrangler r2 bucket list` で確認して使い回す
（重複作成しない）。

スキーマを変更したとき（`npm run db:generate` で新しいマイグレーションを生成したとき）は、
`npm run db:migrate:remote` を手動で本番 D1 に適用する（自動適用の仕組みは無い。マージの前後
どちらでもよいが、忘れると本番だけスキーマが古いままになる）。Phase 2 で追加した
`0002_add_vendor_social_urls` は適用済み。

### 2. 初回デプロイ（Access 設定前）

```bash
npm run deploy
curl -s -o /dev/null -w '%{http_code}\n' https://sumai-log.saitotakuya0719.workers.dev/
```

secret も Access 設定も無い状態なので `403` が返る。これは仕様どおり（拒否側に倒れている）。

### 3. Cloudflare Access アプリ

Zero Trust チームドメインは `https://odd-bush-1f0d.cloudflareaccess.com`（team `odd-bush-1f0d`）。
既存の Google IdP を使う。API（`POST /accounts/{account_id}/access/apps`、続けて
`POST /accounts/{account_id}/access/apps/{app_id}/policies`）で作成済み。ダッシュボードから
同じ設定をする場合の手順:

Zero Trust → Access → Applications → Add → Self-hosted:

- Application name: `sumai-log` ／ Session duration: **730h（約1ヶ月）**
- Application domain: `sumai-log.saitotakuya0719.workers.dev`
- Identity providers: 既設の Google だけを選ぶ（Auto-redirect to identity を有効化）
- Policy: Allow / Include → Emails → 利用者のアドレス（オーナーとパートナーの 2 人）
- 作成後の Overview で **Application Audience (AUD) Tag** をコピーし、`wrangler.jsonc` の
  `ACCESS_TEAM_DOMAIN` / `ACCESS_POLICY_AUD` に反映する（どちらも非秘密＝コミットしてよい）

### 3b. Google マップ（地図タブ）

地図タブと場所の詳細は Google Maps JavaScript API（AdvancedMarker）で描く（2026-09-19 に
地理院タイル + Leaflet から置き換え）。キーが無いと地図の代わりに案内文が出るだけで、他の
機能は動く。

1. [Google Cloud コンソール](https://console.cloud.google.com/) でプロジェクトを作り、
   **請求先アカウント**を紐づける（2025-03 改定後は Dynamic Maps が月 10,000 回まで無料。
   二人で使う分は無料枠に収まるが、カード登録は必須）
2. 「API とサービス」→「ライブラリ」で **Maps JavaScript API** を有効にする
3. 「認証情報」→「API キーを作成」→ 制限を設定:
   - アプリケーションの制限: **HTTP リファラー**。`https://sumai-log.app/*`、
     `https://sumai-log.saitotakuya0719.workers.dev/*`、`http://localhost:3000/*`
   - API の制限: **Maps JavaScript API** だけ
4. （任意）「地図管理」で Map ID を作ると Cloud スタイルが使える。作らなければ
   `DEMO_MAP_ID` で既定スタイルのまま動く
5. キーを secret に置く（リファラー制限つきの公開キーだが、public リポジトリに載せない）:

```bash
printf '%s' 'AIza...' | npx wrangler secret put GOOGLE_MAPS_API_KEY
# Map ID を作った場合だけ
printf '%s' 'xxxxxxxx' | npx wrangler secret put GOOGLE_MAPS_MAP_ID
```

`.dev.vars` の `GOOGLE_MAPS_API_KEY` にも同じ値を入れ、Keyway（§7）にも push する。

### 4. secret と `.dev.vars`

```bash
printf '%s' 'owner@example.com' | npx wrangler secret put ACCESS_ALLOWED_EMAILS
printf '%s' 'owner@example.com:名前:teal' | npx wrangler secret put MEMBERS
# メール取込の転送先アドレス（推測できない local part にする。下の「メール取込」を参照）
printf '%s' 'news-xxxxxxxx@sumai-log.app' | npx wrangler secret put MAIL_INBOX_ADDRESS
npx wrangler secret list        # 名前だけ確認できる。値の正しさはログインして確かめる
npm run deploy
```

`printf '%s'` を使う（`echo` だと末尾改行が値に混ざる）。引用符は値に含めない。
パートナーを追加するときは `ACCESS_ALLOWED_EMAILS` をカンマ区切りで、`MEMBERS` は
`email:表示名:Mantineの色名` をカンマ区切りで追記して同じコマンドで上書きする
（Access ポリシーの Include にもそのアドレスを追加すること）。

ローカル開発は `.dev.vars.example` を `.dev.vars` にコピーして実際の値を入れる
（gitignore 済み）。`npm run check:pii` で実データがコミット対象に混入していないか
毎回確認する。

Cloudflare の secret と Access ポリシーを更新したら、**Keyway vault も同時に更新して
古いままにしない**。手順:

```bash
# .dev.vars の ACCESS_ALLOWED_EMAILS / MEMBERS を上と同じカンマ区切りの新しい値に
# 書き換えてから
keyway push -e development -f .dev.vars -y

# 本番用の一時ファイルを作って push し、すぐ消す
printf 'ENVIRONMENT=production\nACCESS_ALLOWED_EMAILS=%s\nMEMBERS=%s\nGOOGLE_MAPS_API_KEY=%s\nMAIL_INBOX_ADDRESS=%s\n' \
  '<実値>' '<実値>' '<実値>' '<実値>' > .dev.vars.production
keyway push -e production -f .dev.vars.production -y
rm .dev.vars.production
```

### 5. 認証の確認

- シークレットウィンドウで `https://sumai-log.saitotakuya0719.workers.dev/` を開く →
  Access のログイン画面 → Google → ホームが出る
- `curl` で JWT なしにアクセスすると Access のログインへ `302` リダイレクトされる
  （Worker のアプリ HTML には直接到達できない）
- 許可外の Google アカウントでは Access が拒否する
- 設定ページで自分の表示名と色が `MEMBERS` どおりに出ることを確認する

例外: 静的アセット（クライアントバンドル・favicon・manifest・robots.txt）は Cloudflare
Workers Assets が直接配信し、アプリのコード（`src/start.ts` のミドルウェア）を経由しない。
Cloudflare Access の背後ではあるが、アプリ側 allowlist は通らない。写真のアップロード
（`POST /api/photos`）と配信（`GET /api/photos/<key>`）はこの経路に乗せず、
`src/routes/api.photos.$.tsx` の TanStack Start server route（＝ミドルウェアを通る経路）
として実装済み。

### メール取込（転送先アドレスは secret）

設計: `docs/superpowers/specs/2026-09-19-mail-import-design.md`。

転送先アドレスは **secret** `MAIL_INBOX_ADDRESS` に入れる（リポジトリには書かない）。
local part は推測できないランダムなものにする（例 `news-xxxxxxxx@sumai-log.app`）:
認可はエンベロープ送信者で行い、Email Routing が送信ドメインの DMARC ポリシーに従って
認証失敗メールを拒否するが、`gmail.com` は `p=none` なので偽装は通り得る。アドレスを
知られないこと自体が緩和策になる（設計 §3-3）。設定ページの「メール取込」には secret の
値がそのまま出る（未設定なら「未設定（secret MAIL_INBOX_ADDRESS）」）。

**デプロイ順**（この順でないとメールを取りこぼす）

1. `npm run db:migrate:remote` — migration 0009（`inbound_mails` / `vendor_news.mail_id` /
   `vendors.news_email_domain`）を本番 D1 に適用する
2. 転送先アドレスを secret に入れる:
   `printf '%s' 'news-xxxxxxxx@sumai-log.app' | npx wrangler secret put MAIL_INBOX_ADDRESS`
   （§4 と同じ手順で Keyway にも push する）
3. `npm run deploy`（または main への push で Workers Builds）
4. Email Routing の転送ルールを作る: そのアドレス → Worker `sumai-log`。**matcher のアドレスは
   secret と同じ文字列**にする（catch-all は drop のまま）
5. Gmail 側の設定（下の「初回設定」）へ

**ルールより前にメールが届いても Worker は受け取れないだけ**（Cloudflare 側で配送されず、
送信者にエラーが返るのでロスにはならない）。逆に **migration より前にルールを作ると、Worker が
受け取って捨てる**: `onEmail` は例外を飲み込む設計（バウンスの繰り返しを避けるため）なので、
残るのは `mail: failed ...` のログ 1 行だけで、そのメールは二度と来ない。

**初回設定（所有者）**

転送元の Gmail がログイン用のアドレスと別なら、そのアドレスを secret `MAIL_ALLOWED_SENDERS`（カンマ区切り）に入れる（`.dev.vars` と Keyway にも）。認可はログイン許可リストとこのリストの和で行う。

1. 候補 → 業者の編集で「メールの差出人ドメイン」を入れる（メルマガの差出人の `@` の右）
2. Gmail →「設定」→「メール転送と POP/IMAP」→ 転送先アドレスに secret と同じアドレスを追加
3. 設定ページ「メール取込」→ 直近の受信の「システム」行を開き、確認コードを Gmail に入力
   （この確認メールは 4 のルールができてから届く）
4. Gmail のフィルタ `from:(<業者Aのドメイン> OR <業者Bのドメイン>)` に「転送先: そのアドレス」を設定

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

### 6. 所有者の作業

自動化しない、人がやる一回きり／随時の作業。

- **ホーム画面に追加**（二人とも1回だけ）:
  - iPhone（Safari）: 下の共有アイコン → 「ホーム画面に追加」
  - Android（Chrome）: 右上のメニュー → 「ホーム画面に追加」
  - iOS のホーム画面アプリ（standalone）は Safari とログイン状態を共有しないため、ログインが
    繰り返し求められる場合は一度 Safari で本番 URL を開いてログインしてからホーム画面のアプリ
    に戻る
- ~~**妻の Gmail アドレスの追加**~~ ✅ 2026-09-18 に Access ポリシー・secret 2 つ・`.dev.vars`・Keyway へ反映済み
- **用語集の本番確認 4 点**:
  1. 用語集で検索 → 戻るボタンが 1 回で戻る
  2. 検索語を入れたまま関連語バッジを押すと該当語へ飛ぶ
  3. 候補カードの UA 値バッジ → 用語集の該当が開く
  4. 390×844 のライト/ダークで Setback と PaymentTimeline の図が読める
- **iPhone からの HEIC 写真アップロードと 20 枚同時の確認**: HEIC を選んで JPEG として保存
  できること・20 枚同時アップロードが通ることを実機で確認する（開発環境では確認できないため
  デプロイ後に行う）
- **業者のお知らせ機能をマージした後の一回きりの作業**（順番どおりに行う）:
  1. マイグレーションを本番 D1 に適用する: `npm run db:migrate:remote`（migration 0003
     `vendor_news` テーブルと 0004 `vendors.representative` / `affiliations` 列を反映する）
  2. 候補の工務店 4 社ぶんの UPDATE 文を本番 D1 に適用する:
     `npx wrangler d1 execute sumai-log --remote --file seed.local/out/vendors-news.sql -y`
     （お知らせ URL・取得方式・代表者名・加盟団体を入れる。ファイルは gitignore 済みの
     所有者データで、リポジトリには入らない）
  3. 設定ページ →「業者のお知らせ」→「今すぐ取得」を 1 回押し、ホームの「業者のお知らせ」
     ブロックに反映されることを確認する
  4. 翌朝 6 時（JST）以降に、設定ページの最終取得日時が更新されていることを確認する（Cron
     による自動取得）。ローカルで `wrangler dev --test-scheduled` を試す場合の注意:
     wrangler 4.131 では Workers Assets 構成だと `/__scheduled` へのリクエストが scheduled
     ハンドラまで届かなかった（確認済み）。ローカルで動作を見たいときはダッシュボードの
     当該 Worker → Triggers → Cron Triggers の「Trigger」ボタンを使う
  5. カスタムドメイン `https://sumai-log.app` が有効になっていることを確認する。Cloudflare
     Access のアプリは workers.dev とカスタムドメインの両方のホスト名をカバーしているが、
     セッションはホスト名ごとに別なので新しいドメインでは初回ログインが必要になる。ホーム
     画面に追加したアプリは新しいアイコンを自動では拾わないため、新しいドメインから改めて
     「ホーム画面に追加」をやり直す
- **業者の画像と情報収集ページをマージした後の一回きりの作業**（順番どおりに行う）:
  1. マイグレーションを本番 D1 に適用する: `npm run db:migrate:remote`
     （migration 0005 `vendors.representative_photo_key`/`favicon_key`、0006
     `vendors.affiliation_links`、0007 `sources` テーブルの 3 本を反映する）
  2. 構造塾マップの加盟団体リンクを本番 D1 に入れる:
     `npx wrangler d1 execute sumai-log --remote --file seed.local/out/vendors-kouzou.sql -y`
  3. 情報源 20 件を本番 D1 に入れる:
     `npx wrangler d1 execute sumai-log --remote --file seed.local/out/sources.sql -y`
     （どちらのファイルも gitignore 済みの所有者データで、importer の dry-run 出力から
     該当テーブルの行だけを抜いたもの。id は slug から決定的なので再実行しても冪等。
     `sources` は url を自然キーに `ON CONFLICT(url) DO UPDATE` で入れるため、本番で先に
     フォームから同じ URL の情報源を追加していても失敗せず、その行が seed の内容
     （id 含む）に上書きされる）
  4. 設定ページ →「候補のサイトアイコン」→「アイコンを取得」を押し、候補カードと業者詳細
     にアイコンが出ることを確認する（未取得の業者だけが対象。1 回で全社ぶん反映されない
     ことがあるため、反映されていない業者が残っていればもう一度押す。取り直したいときは
     「取り直す」）
  5. 候補 → 各業者の編集フォーム →「代表者の写真」から 4 社ぶんの顔写真をアップロードする
     （端末側で 800px/240px の JPEG に縮小してから送られる。URL 取り込みは縮小されないため
     大きい画像はファイル選択のほうを使う）
  6. `/sources`（ヘッダーの「情報収集」）を開き、20 件が 9 ジャンルに分かれて出ること・
     アバター画像が表示されること（CSP）を確認する
- **サイトアイコンの手動アップロード機能をマージした後の一回きりの作業**（順番どおりに行う）:
  1. マイグレーションを本番 D1 に適用する: `npm run db:migrate:remote`
     （migration 0008 `vendors.favicon_source` を反映する）
  2. 樹々匠建設のサイトアイコンを手動アップロードする: 候補 → 樹々匠建設の編集フォーム →
     「サイトのアイコン」→「画像を選ぶ」で `seed.local/photos/favicon-jyujyusho.png`
     （gitignore 済みの所有者データ）を選ぶ。候補カードと業者詳細にアイコンが出ることを
     確認する
  3. 設定ページの「業者のお知らせ」カードで樹々匠建設のエラーが「サイト側が Cloudflare
     からのアクセスを拒否（HTTP 403）」と表示されることを確認する

### 7. Keyway（secret のチーム共有）

```bash
keyway pull -e development -f .dev.vars -y   # 開発用の実値を取得
```

本番値は `production` 環境に入っている（`ACCESS_ALLOWED_EMAILS` / `MEMBERS` /
`ENVIRONMENT=production`）。Vault: https://app.keyway.sh/vaults/tktk7l9/sumai-log

本番の正本は Cloudflare の secret。Keyway の production 環境は新しい機械で復旧するための控え。

### 8. Workers Builds（GitHub 連携・ダッシュボード）

Workers & Pages → `sumai-log` → Settings → Build → Connect to GitHub:

- Repository: `tktk7l9/sumai-log` ／ Branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

接続後、空コミットを `main` に push して自動デプロイが動くことを確認する:

```bash
npx wrangler deployments list   # 先頭の Created が push 時刻（UTC）と一致するか確認
```

Workers Builds が無音で止まる既知の事故があるため（他プロジェクトで実例あり）、接続直後は
必ずこの突合をする。ずれていたら手元から `npm run deploy` で応急し、原因を調べる。

**✅ 接続済み。** `main` への push（PR マージ含む）で自動的にビルド・デプロイされる
（GitHub の PR チェックにも `Workers Builds: sumai-log` として出る）。

### 9. バックアップ

月次: `npm run db:export`（`backups/sumai-log-YYYYMMDD.sql` を出力・gitignore 済み）→
Google Drive の `backups/sumai-log` へコピー。

**R2 の写真は `db:export` の対象外。** D1 のバックアップとは別に、取込スクリプトが変換した
JPEG（`seed.local/out/*.jpg`・gitignore 済み）と、アプリから追加した写真を月次で同じ Drive
フォルダへコピーする。1 件だけ取り出す例:

```bash
npx wrangler r2 object get sumai-log-photos/photos/<visitId>/<photoId>-display.jpg \
  --file ./backups/<photoId>-display.jpg --remote
```
