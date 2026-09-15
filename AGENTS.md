# sumai-log — エージェント向け指示

夫婦二人だけが使う住まい検討の記録アプリ。**リポジトリは public**、データは D1 / R2 にしか無い。

## 絶対に守ること

1. **PII をコミットしない。** 二人のメール・表示名・見学先の実データ・住所・座標を
   コード／テスト／seed／コメント／ドキュメントに書かない。テストは `owner@example.com` `甲` `乙`
   `テスト市` などの架空値。コミット前に `npm run check:pii`（照合元は gitignore 済みの `.dev.vars`）。
2. **R2 バケットを公開設定にしない。** 配信は必ず認証後に Worker 経由でストリームする。
3. **認証を迂回できる経路を足さない。** 判定は `src/lib/access.ts` に集約し、
   `src/start.ts` のグローバルミドルウェアで全リクエストに適用する。fail closed。
   例外: 静的アセット（クライアントバンドル・favicon・manifest・robots.txt）は Workers Assets
   層が配信し `src/start.ts` を経由しない。Cloudflare Access の背後ではあるが、アプリ側
   allowlist は通らない。Phase 2 の写真配信（`/api/photos`）はこの例外に乗せず、必ず
   `src/server/` の server route（＝ミドルウェアを通る経路）として実装すること。
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
