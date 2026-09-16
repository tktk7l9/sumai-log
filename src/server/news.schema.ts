import { z } from 'zod'

import { dateField, idField } from './zod'

/**
 * news.ts から分離した理由: events.schema.ts / videos.schema.ts と同じ
 * （詳細はそちらのコメント参照）。news.ts は planVisitFromNews の中で
 * currentActorEmail（`@tanstack/react-start/server` の getRequest を静的 import）を
 * 使っており、素の vitest workers テストから news.ts を import 経由で読み込むと
 * TanStack Start の Vite プラグインが用意する virtual specifier の解決に失敗して
 * 落ちる。ここに置くスキーマは D1 も members も要らない純粋な zod スキーマなので、
 * news.worker-test.ts はこちらから import する（news.ts は再エクスポートするだけで、
 * 公開している import パス・挙動は変えない）。
 */

export const listVendorNewsInput = z.object({
  vendorId: idField.optional(),
  // 公開日（published_on）の期間で絞り込む。/news の月ごとのアジェンダ（fix round 1）が
  // その月の初日/末日を渡す。どちらも省略すれば期間の絞り込み無し（ホームの最新 N 件は
  // 期間を意識しない呼び出しのまま）。newsEventsBetweenInput と違い両方 optional
  // （片方だけ・両方無し、のどれも呼び出し側の都合であり得るため）。
  from: dateField.optional(),
  to: dateField.optional(),
  // 1 か月ぶんの安全上限。「もっと見る」ページング（旧: 表示上限 +1 件を問い合わせて
  // hasMore を判定するトリック）は fix round 1 で /news から無くなったため、
  // 上限は素直に 200 にした（以前の 201 はそのトリック専用だった）。
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
})
export type ListVendorNewsInput = z.input<typeof listVendorNewsInput>

/**
 * カレンダーの情報レイヤー用（月をまたぐ表示範囲）。カレンダー画面の月表示は前後の週が
 * はみ出すぶん広めに取る（src/routes/calendar.tsx の visibleRange）ため、月単位で
 * 区切らず、こちらで実際の表示範囲そのものを渡す。
 */
export const newsEventsBetweenInput = z.object({ from: dateField, to: dateField })
export type NewsEventsBetweenInput = z.input<typeof newsEventsBetweenInput>

export const planVisitInput = z.object({ newsId: idField })
export type PlanVisitInput = z.input<typeof planVisitInput>
