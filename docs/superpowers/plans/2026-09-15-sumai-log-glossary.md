# sumai-log 用語集（図解つき）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 家づくり・マンション購入でよく出てくる用語を、一言定義・目安の数値・「我が家への効き方」・図解で説明する `/glossary` ページを追加し、候補カードの UA値/C値/耐震等級のチップからも引けるようにする。

**Architecture:** 用語は DB に入れず、型付きの静的コンテンツ `src/content/glossary.ts` に持つ（検索・分類・関連語は純粋関数 `src/lib/glossary.ts` で処理し 100% ゲート）。図解は依存を増やさず、`src/components/glossary/diagrams/*.tsx` のインライン SVG（`currentColor` とテーマ変数で明暗両対応）。ページは `/glossary`（`?q=` 検索・`?c=` 分類・`#term-<id>` アンカー）。ヘッダの「設定」の隣に「用語集」を置く（下タブは 5 つのまま）。

**Tech Stack:** TanStack Start + React 19 + Mantine v9（`Accordion` `Chip` `TextInput`）+ inline SVG。新規依存なし。

**Spec:** `docs/superpowers/specs/2026-09-15-sumai-log-design.md`（追加要望: 2026-09-15 用語集）

## Global Constraints

- 公開リポジトリ。用語集の本文に **個人情報・実在の業者名・地名（建築予定地の市名）を書かない**。例示は「6地域（関東の平地など）」のような一般表現にする
- 数値は現行制度の代表値を書き、「目安」「地域区分で変わる」と断る。断定できないものは書かない。出典 URL は書かない（本文は自分の言葉で。引用しない）
- `src/lib/` は純粋関数のみ・100%。`src/content/` はデータのみ（関数を持たない）
- UI の文言は日本語。Prettier `semi:false singleQuote:true printWidth:100 trailingComma:'all'`
- 図解 SVG: `viewBox` 固定・`width="100%"`・`role="img"` + `aria-label`（何の図か）・線は `stroke="currentColor"`・塗りは `var(--mantine-color-clay-3)` 等のテーマ変数・文字は `font-size` 12〜14・日本語ラベルは `<text>`（`textContent`）
- 完了基準: `format:check` `typecheck` `test:coverage` `test:server` `test:scripts` `build` `check:pii` green

---

### Task 1: 用語データと純粋関数

**Files:** Create `src/content/glossary.ts` `src/lib/glossary.ts` `src/lib/glossary.test.ts`

**Interfaces:**
- `src/content/glossary.ts`: `GLOSSARY_CATEGORIES = [{ id:'performance', label:'性能' }, { id:'land', label:'土地・法規' }, { id:'structure', label:'構造・工法' }, { id:'money', label:'お金' }, { id:'process', label:'進め方' }, { id:'condo', label:'マンション' }] as const`；`type GlossaryTerm = { id: string; term: string; reading?: string; category: CategoryId; summary: string（一言定義・60字以内）; body: string[]（段落。2〜4 段落）; numbers?: { label: string; value: string }[]（目安の数値）; forUs?: string（「我が家への効き方」1〜2文）; related?: string[]（term id）; diagram?: DiagramId; aliases?: string[]（検索用の別名・英語） }`；`GLOSSARY: GlossaryTerm[]`
- `src/lib/glossary.ts`: `searchGlossary(terms, query): GlossaryTerm[]`（NFKC・小文字化・かな/カナ同一視・`term`/`reading`/`aliases`/`summary` の部分一致・空クエリは全件）／`groupByCategory(terms)`／`findTerm(terms, id)`／`relatedTerms(terms, term)`／`termIdForMetric(metric: 'ua' | 'c' | 'seismic' | 'longTerm'): string`（候補カードのチップ用）

- [ ] Step 1: `glossary.test.ts` を先に書く（検索の正規化・分類・関連語・不明 id）→ FAIL → 実装 → PASS → 100%

- [ ] Step 2: `src/content/glossary.ts` に **以下 44 語**を書く（各 `summary`・`body`・`numbers`（あれば）・`forUs`・`related`・`diagram`（あれば））。数値の代表値は次を使う:

性能: `ua-value` UA値（外皮平均熱貫流率・小さいほど断熱が良い。6地域の目安: 等級4=0.87／等級5(ZEH水準)=0.60／等級6=0.46／等級7=0.26 W/㎡K。図解 `envelope-heat`）／`c-value` C値（相当隙間面積・小さいほど気密。目安: 1.0 以下で高気密、0.5 以下で優秀、測定は完成時の実測。図解 `airtight-leaks`）／`insulation-grade` 断熱等級（1〜7。2025年から新築は等級4が最低・2030年に等級5義務化の予定。UA値と対応）／`seismic-grade` 耐震等級（1=建築基準法・2=1.25倍・3=1.5倍。3は消防署等と同等。図解 `seismic-scale`）／`allowable-stress` 許容応力度計算（部材ごとに力を計算する構造計算。壁量計算より厳密。2階建て木造でも任せられる会社が高性能志向の目安）／`long-term-housing` 長期優良住宅（認定で税優遇・ローン控除枠・維持保全計画）／`ventilation-type1` 第一種換気／第三種換気（給気・排気を機械で行うか、排気だけか。熱交換。図解 `ventilation`）／`window-spec` 樹脂サッシ・トリプルガラス（熱は窓から最も逃げる。Uw値。図解 `window-heat`）／`zeh` ZEH（断熱等級5相当＋一次エネ削減＋太陽光で正味ゼロ）／`passive-design` パッシブ設計（日射取得・遮蔽・通風で設備に頼らない。図解 `sun-eave`）／`airtight-test` 気密測定（完成時にファンで減圧して測る。実測公開の有無が会社を見る指標）

土地・法規: `zoning` 用途地域（建てられる建物の種類と規模を市が決める。住居系/商業系/工業系）／`bcr-far` 建ぺい率・容積率（敷地に対する建築面積／延床面積の上限。図解 `bcr-far`）／`road-access` 接道義務（幅員4m以上の道路に2m以上接する）／`setback` セットバック（4m未満の道路は中心線から2m下がる。図解 `setback`）／`fire-zone` 防火地域・準防火地域（延焼ラインの開口部に防火設備など仕様が上がる。木造でも可）／`height-shadow` 斜線制限・日影規制（北側斜線・道路斜線。平屋は余裕）／`hazard-map` ハザードマップ（洪水・土砂・内水。内水は新しい想定が出ていないか市で確認）／`land-survey` 地盤調査・地盤改良（スウェーデン式サウンディング。改良費は数十万〜百数十万の幅）／`subdivision` 分筆・分割（登記上分けるか、敷地として分けるか。担保設定に効く）／`mortgage-collateral` 担保提供（親の土地に建てるとき、土地所有者の同意で抵当権を付ける）

構造・工法: `foundation` ベタ基礎・布基礎（面で支えるか線で支えるか。図解 `foundation`）／`ext-vs-fill` 外断熱・充填断熱・付加断熱（柱の外／柱の間／両方。図解 `wall-section`）／`vent-layer` 通気層（外壁の中の空気の通り道。湿気を逃がす。図解 `wall-section`）／`eaves` 軒・庇（夏の高い日射を遮り冬の低い日射を入れる。図解 `sun-eave`）／`floor-areas` 延床面積・建築面積・施工面積（何を足すかで坪単価が変わる。図解 `floor-areas`）／`tsubo` 坪（約3.3㎡。30坪≒99㎡）

お金: `tsubo-price` 坪単価（本体工事÷延床。何を含むかが会社で違う）／`extra-costs` 付帯工事・諸費用（外構・地盤・給排水引込・登記・保険・税。本体の2〜3割が目安）／`design-fee` 設計料・監理料（設計事務所方式なら工事費の10〜15%が目安）／`mortgage-deduction` 住宅ローン控除（年末残高×0.7%を最長13年。長期優良・ZEH で上限枠が上がる）／`bridge-loan` つなぎ融資（土地代・着工金・中間金を建物完成前に払うための短期融資）／`payment-schedule` 契約金・着工金・中間金・最終金（支払いのタイミング。図解 `payment-timeline`）／`gift-tax-housing` 住宅取得等資金の贈与非課税（親からの資金。省エネ住宅で枠が上がる）／`property-taxes` 固定資産税・不動産取得税・登録免許税（取得後・取得時にかかる税）／`insurance-home` 火災保険・地震保険（建物は再調達価額で。水災補償の要否はハザードで判断）

進め方: `design-build-split` 設計施工分離（設計事務所が設計・監理、工務店が施工）／`supervision` 監理（設計者が現場を図面どおりか確認する。回数と誰が来るか）／`open-house` 完成見学会・構造見学会（構造見学会は断熱・気密の施工が見える）／`model-house` モデルハウス・住宅展示場（豪華仕様になりやすい。標準仕様との差を聞く）／`handover-warranty` 引き渡し・保証・アフター（10年の瑕疵担保、定期点検の内容）

マンション: `exclusive-area` 専有面積・壁芯・内法（登記は内法で小さくなる。図解 `wall-core`）／`mgmt-repair` 管理費・修繕積立金（毎月の固定費。積立金は段階的に上がる計画が多い）／`long-term-repair-plan` 長期修繕計画（30年程度の計画。積立不足なら値上げ or 一時金）／`new-seismic` 新耐震基準（1981年6月以降の建築確認。2000年基準も）／`condo-vs-house` マンションと戸建ての固定費（管理費+積立金 vs 修繕を自分で積む。図解 `cost-compare`）

- [ ] Step 3: コミット `feat(glossary): 用語データと検索/分類の純粋関数`

### Task 2: 図解 SVG（12 種）

**Files:** Create `src/components/glossary/diagrams/index.tsx`（`DIAGRAMS: Record<DiagramId, React.FC>`）と各図 1 ファイル。`DiagramId = 'envelope-heat' | 'airtight-leaks' | 'seismic-scale' | 'ventilation' | 'window-heat' | 'sun-eave' | 'bcr-far' | 'setback' | 'foundation' | 'wall-section' | 'floor-areas' | 'payment-timeline' | 'wall-core' | 'cost-compare'`

各図の内容（`viewBox="0 0 320 200"`、日本語ラベル、矢印は `<marker>`）:
- `envelope-heat`: 家の断面（屋根・壁・床・窓）と外へ出る熱の矢印。矢印の太さで「窓が最も大きい」。UA値=矢印の合計÷外皮面積、の式をラベルで
- `airtight-leaks`: 同じ断面で隙間から入る風の矢印（コンセント・配管まわり・サッシ）。C値=隙間の合計÷床面積
- `seismic-scale`: 等級1/2/3 を柱の高さで 1.0/1.25/1.5 に並べる棒グラフ
- `ventilation`: 左=第三種（排気ファンだけ・給気口から冷気）、右=第一種熱交換（給気と排気が熱交換器を通る）
- `window-heat`: アルミ単板／アルミ樹脂複合ペア／樹脂トリプル の3窓を並べ、熱の矢印を太→細
- `sun-eave`: 夏の高い太陽（軒で遮る）と冬の低い太陽（窓に入る）
- `bcr-far`: 敷地の矩形に建築面積（塗り）と、その上に2階分の延床（点線の積み上げ）。建ぺい率60%/容積率200% のラベル
- `setback`: 幅3mの道路、中心線、2m の後退線、その内側に建てる
- `foundation`: ベタ基礎（面）と布基礎（逆T字の線）の断面
- `wall-section`: 外壁の断面（外装材・通気層・透湿防水シート・付加断熱・構造用面材・柱＋充填断熱・気密シート・石膏ボード）を層で
- `floor-areas`: 平面図で「建築面積（外周）」「延床（各階の合計）」「施工面積（バルコニー・玄関ポーチも足す）」を色分け
- `payment-timeline`: 契約→着工→上棟→完成→引渡しの線上に、契約金/着工金/中間金/最終金 とつなぎ融資の期間
- `wall-core`: 壁の中心線で測る「壁芯」と内側で測る「内法」
- `cost-compare`: 30年の帯グラフで、マンション=管理費+積立金の階段、戸建て=自分で積む修繕費（波）

- [ ] Step 1: `index.tsx` と 14 図（`role="img" aria-label`、`currentColor`、テーマ色変数）。ダークモードで見えることを Playwright で確認
- [ ] Step 2: コミット `feat(glossary): 図解 SVG 14 点`

### Task 3: ページとリンク

**Files:** Create `src/routes/glossary.tsx` `src/components/glossary/TermCard.tsx`; Modify `src/components/AppLayout.tsx`（ヘッダに「用語集」`BookOpen` リンク）、`src/components/candidates/VendorCard.tsx` と `candidates_.vendors.$id.tsx`（UA値/C値/耐震等級/長期優良のバッジを `/glossary#term-<id>` へのリンクに。`termIdForMetric` を使う）

- `/glossary`: `PageShell title="用語集" description="家づくりとマンション購入でよく出てくる言葉を、一言と図で"`。上に `TextInput`（検索・`?q=`）と分類 `Chip.Group`（`?c=`）。本体は分類ごとの `Accordion`（`multiple`、`variant="separated"`）。各 `TermCard`: 見出し（`id="term-<id>"`）・読み・一言定義・図解（あれば）・本文段落・「目安」（`numbers` を `Table` で）・「我が家への効き方」（`Alert variant="light"`）・関連語（`Chip` リンク）。URL の `#term-…` で該当を開いてスクロール（`useEffect` で hash を見て `Accordion` の `value` に足す）
- 検索は `searchGlossary`；0件なら `EmptyState`
- 動作確認（390×844・ダーク/ライト）: 44 語が 6 分類に出る／「UA」で検索→UA値・ZEH など／候補カードの UA値チップ→用語集の該当が開く／図が明暗どちらでも読める

- [ ] コミット `feat(glossary): 用語集ページと候補からのリンク`

### Task 4: レビュー観点（本文の正確さ）
- 数値（UA値の等級対応・耐震等級の倍率・ローン控除の率と年数・接道 2m/4m・坪≒3.3㎡）を最終レビューで再確認。制度が変わりうるものには「〜年時点の目安」を付ける
