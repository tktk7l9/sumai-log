# sumai-log — 施工例の一覧（揃えて見る・ルームツアー動画の視聴チェック）設計仕様

2026-10-01 会話で設計を承認。この文書のレビュー待ち。

## 1. 背景と目的

検討中の業者 3 社（以下 業者 A・B・C）の施工例は各社のサイトにばらばらの形で載っており、
横並びで比べられない。ルームツアー動画もどれを見たかを覚えていられない。

- 3 社の施工例を**すべて** 1 つの一覧に出す（調査時点で A 28 件・B 36 件・C 29 件＝計 93 件）。
- 同じ項目立て（ポイント／家族構成／面積／間取り）に**揃えて**見られるようにする。
- ルームツアー動画をアプリ内で見たら、その施工例に**自動で**「視聴済み」が付く。

決めたこと（2026-10-01）:

| 論点 | 決定 |
| --- | --- |
| 視聴チェックの付き方 | アプリ内の埋め込み再生で自動。手動の付け外しもできる |
| チェックの単位 | 二人で 1 つ（どちらかが見たら視聴済み。誰が付けたかだけ残す） |
| 取り込み | 手元のスクリプトで SQL を生成し、本人が本番 D1 に流す（Cron は作らない） |
| 既存の「動画の記録」 | 別物として残す。施工例は専用テーブルに持つ |
| 外部 API（LLM 等） | 送らない |

やらないこと: Cron での自動取得、各社サイトの写真の表示・保存、施工例へのコメント、
既存 `videos`（動画の記録）との自動連動、一人ずつの視聴チェック。

## 2. 公開リポジトリとしての扱い

業者名・サイトの URL・施工例の名前や数値は実データなので、コード・テスト・コミット文・この文書に
書かない（AGENTS.md「Do not commit PII」。`check:pii` は業者名を検出できないので目で見る）。

- 取り込み対象のサイト（一覧 URL・パーサの種類・紐づける業者 id）は gitignore 済みの
  `seed.local/works-sites.json` に置く。
- パーサは業者名ではなく `siteA` `siteB` `siteC` と呼ぶ。テストの HTML は架空の値で作る。
- 生成した SQL は `seed.local/out/` に出す（gitignore 済み）。

## 3. データ

`works` テーブルを新設する（マイグレーション 1 本。`src/db/schema.ts` の既存の流儀＝日付は
ISO-8601 の TEXT・面積は小数・id は text に従う）。

| 列 | 型 | 内容 |
| --- | --- | --- |
| `id` | text PK | `crypto.randomUUID()` |
| `source_url` | text NOT NULL UNIQUE | 施工例の詳細ページ。取り込みの一致キー |
| `site` | text NOT NULL | `works-sites.json` のキー（`siteA` など） |
| `vendor_id` | text NULL | `vendors.id`（`ON DELETE SET NULL`） |
| `title` | text NOT NULL | 施工例の名前 |
| `category` | text NULL | 「新築」「リフォーム」など、サイトの表記のまま |
| `location` | text NULL | 市区町村まで（サイトに載っている粒度のまま） |
| `completed_on` | text NULL | `YYYY-MM` または `YYYY` |
| `points` | text(JSON) NOT NULL `'[]'` | 「ポイント」の行のリスト |
| `ua_value` | real NULL | UA 値 |
| `c_value` | real NULL | C 値 |
| `family` | text NULL | 家族構成（表記のまま） |
| `site_area_tsubo` | real NULL | 敷地面積（坪） |
| `floor_area_tsubo` | real NULL | 延床面積（坪） |
| `total_area_tsubo` | real NULL | 総施工面積（坪） |
| `layout` | text NULL | 間取り（表記のまま） |
| `youtube_video_id` | text NULL | ルームツアー動画の 11 文字の id |
| `video_source` | text NULL | `'auto' \| 'manual'`。null は `'auto'` 扱い |
| `watched_at` | text NULL | 視聴済みにした日時（ISO-8601）。null＝まだ見ていない |
| `watched_by` | text NULL | 視聴済みにした人の e-mail |
| `sort_order` | integer NOT NULL 0 | サイトの一覧に出てきた順 |
| `created_at` / `updated_at` | text | 既存の `timestamps` |

索引: `works_vendor_idx (vendor_id)`。

UA 値・C 値は「ポイント」の行の中にも文字として残す（貼られた形式を崩さない）。数値の列は
並べ替えと表の列のために別に持つ。

## 4. 取り込み（`scripts/import-works.ts`）

`npm run import:works` で実行する。既存の `import:mbox` と同じ「SQL を生成するだけ」の作り。

1. `seed.local/works-sites.json` を読む（無ければ、置き場所と書式を英語で出して終了）。
2. サイトごとに一覧ページを読み、ページ送りをたどって詳細 URL を集める。
3. 詳細ページを 1 件ずつ読む。**リクエストの間は 1 秒空け、同時には読まない**。
   取得した HTML は `seed.local/cache/works/` に置き、再実行ではそれを使う（`--refresh` で取り直す）。
4. `src/lib/works/` のパーサで `ParsedWork` にする。
5. `seed.local/out/works-YYYYMMDD.sql` を書く。本人が `!` で本番 D1 に流す。

SQL は 1 件 1 文の `INSERT … ON CONFLICT(source_url) DO UPDATE`。更新するのはサイト由来の列
だけで、次は**上書きしない**:

- `watched_at` `watched_by`（視聴チェック）
- `youtube_video_id`（`video_source = 'manual'` の行。`'auto'`/null の行はサイトの値で更新する）
- `id` `created_at`

サイトから消えた施工例は削除しない（視聴の記録が消えるため）。件数と、読み取れなかった項目の数を
サイト別に標準出力へ出す（英語）。1 サイトが取得に失敗しても他のサイトの分は出力し、失敗した
サイトを最後に列挙して終了コード 1 で終わる。

### パーサ（`src/lib/works/`・純粋関数・100% カバレッジ対象）

| ファイル | 役割 |
| --- | --- |
| `types.ts` | `ParsedWork`・`WorkListEntry` |
| `siteA.ts` | 一覧: 相対リンクの詳細 URL と、同じ枠にある動画リンク。詳細: 「Data」欄（ポイント／家族構成／面積／間取り） |
| `siteB.ts` | 一覧: ページ送りと詳細 URL・種別。詳細: 名前と竣工年月（仕様欄は無い） |
| `siteC.ts` | 一覧: ページ送りと詳細 URL。詳細: 所在地・延べ床面積（㎡）・UA 値・C 値・埋め込み動画 |
| `area.ts` | `sqmToTsubo`（㎡ ÷ 3.305785、小数 2 桁）・「50.50坪」「120㎡」の読み取り |
| `sql.ts` | `ParsedWork` → upsert 文。文字列のエスケープはここだけ |

動画の id は既存の `parseYouTubeId`、サムネイルは `youtubeThumbnailUrl`（どちらも
`src/lib/youtube.ts`）を使い、同じ処理を増やさない。

HTML の読み取りは正規表現とタグ除去で行い、依存を増やさない。読み取れない項目は null にして
先へ進む（1 項目の失敗で 1 件を捨てない）。

サイト別の見込み（調査時点）:

- **A**: 全項目がほぼ埋まる。動画は 28 件中 20 件。
- **B**: 名前・種別・竣工年月だけ。サイト上に動画リンクも仕様欄も無い → 動画は画面から手で貼る。
- **C**: 所在地・延床・UA 値・C 値・動画。家族構成と間取りは本文中にしか無いので取らない。

## 5. 画面（`/works`「施工例」）

`src/routes/works.tsx`。下タブには入れず、`AppLayout.tsx` の `MoreMenu` と PC の左ナビに
「施工例」を足す。`PageShell` を使う。

### 絞り込みと並び

- 業者（すべて／A／B／C）・「動画あり」・「まだ見ていない」。既定は全件（SHIG 20）。
- 並びは 業者 → `sort_order`。
- 絞り込みの状態は URL の search params に持つ（戻っても保たれる・SHIG 59）。
- 見出しの下に「93 件中 12 件を視聴済み」のように件数を文字で出す。

### 表示の切り替え（2 つ）

**一覧**（既定）: カード。名前・業者・主要 3 値（延床・UA 値・C 値）・視聴の状態・動画の
サムネイル（動画がある件だけ YouTube のサムネイル。他は画像なし）。

**揃えて見る**: 全件を次の順の同じ枠に入れる。貼られた形式と同じ見出し・同じ順にする。

```
ポイント
  （行のリスト）
家族構成    …
面積
  敷地面積 …坪
  延床面積 …坪
  総施工面積 …坪
間取り      …
```

- PC は表（行＝施工例、列＝ポイント／家族構成／敷地／延床／総施工／間取り）。見出し行と
  名前の列を固定する。
- スマホは同じ順の定義リストを 1 件ずつ縦に並べる（横スクロールの表にしない）。
- 値の無い項目は「—」を出さず、行ごと消す（SHIG 47・AGENTS.md の取り決め）。
- ㎡ から換算した坪は小数 2 桁で出す。

### 1 件の操作

- 名前 → 元のページを新しいタブで開く。
- 「動画を見る」→ その場で埋め込みプレーヤーを開く（§6）。
- 「視聴済みにする／視聴済みを取り消す」→ 1 タップ。YouTube アプリで見た分のため。
- 動画が無い件には「動画の URL を貼る」。貼ると `video_source = 'manual'`。YouTube の
  URL として読めなければ、その場で理由を出す（SHIG 50/46: watch・youtu.be・embed・shorts を
  受け付けて id に正規化する）。

視聴の状態は色だけにしない。チェックのアイコンと「視聴済み」の文字で示す（SHIG 96/70）。
タップ対象は 44px 以上（SHIG 78）。空の状態は既存の `EmptyState` で「取り込みがまだ」を
説明する（SHIG 33）。

## 6. 視聴の自動チェック

- 埋め込みは `https://www.youtube-nocookie.com/embed/<id>?enablejsapi=1&playsinline=1`。
- **YouTube のスクリプト（IFrame Player API）は読み込まない**。iframe の `load` 後に
  `{"event":"listening"}` を `postMessage` し、返ってくる `infoDelivery`（`currentTime`
  `duration` `playerState`）を `message` イベントで受ける。`event.origin` が
  `https://www.youtube-nocookie.com` のものだけを扱う。
- CSP（`src/lib/securityHeaders.ts`）には今 `frame-src` が無く、iframe の読み込み先は
  制限されていない。この機会に `frame-src https://www.youtube-nocookie.com` を足して
  埋め込み先をこの 1 ホストに絞る（今より厳しくなる。アプリ内に他の iframe が無いことを
  実装時に確かめる）。`script-src` は足さない。サムネイルの `i.ytimg.com` は `img-src` に
  すでにある。
- 判定は純粋関数 `shouldMarkWatched({ currentTime, duration, playerState })`
  （`src/lib/works/watch.ts`）: **`playerState === 0`（終了）または
  `duration > 0 && currentTime / duration >= 0.9`**。
- 満たしたら 1 回だけ `markWorkWatched` を呼ぶ。確認ダイアログは出さず、
  「視聴済みにしました」＋「取り消す」の通知を出す（SHIG 57/54）。
- すでに視聴済みの件を再生しても何も書かない。
- メッセージが来ない（ブラウザやネットワークの都合）ときは自動では付かない。手動のボタンが
  常に出ているので、それで付けられる。

## 7. サーバ

既存の分け方に従う。

| ファイル | 内容 |
| --- | --- |
| `src/server/repository/works.ts` | `listWorks`・`setWorkWatched`・`setWorkVideo`。`repository/index.ts` から再輸出 |
| `src/server/works.schema.ts` | zod: `{ id, watched: boolean }`・`{ id, url: string \| null }` |
| `src/server/works.ts` | `createServerFn` の包み。認証は既存のミドルウェア（`src/start.ts`）に任せ、迂回路を作らない |

- `setWorkWatched(id, true)` は `watched_at = now`・`watched_by = ログイン中の e-mail`。
  `false` は両方 null。どちらも `updated_at` を進める。
- 二人が同時に付けても結果は同じなので、`expectedUpdatedAt` の衝突検出は入れない。
- `setWorkVideo` は URL を id に正規化して保存し `video_source = 'manual'`。null を渡すと
  動画を外して `video_source = null` に戻す（次の取り込みでサイトの値が入る）。
- 一覧は 100 件前後なので 1 回で全件を返し、絞り込みは画面側の純粋関数
  `filterWorks`（`src/lib/works/filter.ts`）で行う。

## 8. エラー時

| 起きること | 扱い |
| --- | --- |
| 取り込み: サイトが応答しない／形が変わった | そのサイトだけ失敗として列挙。他のサイトの SQL は出す |
| 取り込み: 項目が読めない | null のまま。件数を標準出力に出す |
| 画面: 保存に失敗 | 既存の `formError` の流儀で通知。表示は元の状態に戻す |
| 画面: 動画が削除済み・埋め込み不可 | プレーヤーが YouTube 側のエラーを出す。「YouTube で開く」のリンクを併せて出す |
| 画面: `works` が 0 件 | `EmptyState` |

## 9. テスト

- `src/lib/works/*`（パーサ・坪換算・SQL 生成・絞り込み・視聴判定）: 架空の HTML と値で
  100%（既存のカバレッジゲート）。SQL 生成は引用符・改行を含む値と、上書きしない列を確かめる。
- `src/server/works.schema.ts`: `*.worker-test.ts` から schema を直接読む（既存の取り決め）。
- `src/server/repository/works.ts`: workers テストで、視聴の付け外し・手動の動画が取り込みの
  upsert で消えないこと・`vendors` 削除で `vendor_id` が null になること。
- 画面: 実ブラウザで、動画を 9 割まで進めると通知が出て一覧に反映されること、スマホ幅で
  横スクロールが出ないこと、ライト／ダークを確かめる。
- コミット前に `npm run check:pii`・`npm test`・`npm run typecheck`・`npm run format:check`。

## 10. 出す順

1. `works` テーブル・パーサ・取り込みスクリプト（ここまでで SQL を目で確かめられる）
2. `/works` の一覧と「揃えて見る」・絞り込み・手動の視聴チェック
3. 埋め込み再生と自動チェック・CSP・動画 URL を貼る欄

1 本の PR にまとめる。PR の説明に SHIG の番号（20, 33, 46, 47, 50, 54, 57, 59, 60, 70, 78, 82, 96）を
添える。マイグレーションの本番適用と SQL の投入は本人が行う。
