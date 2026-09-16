import { z } from 'zod'

import { monthKeys } from '../lib/calendar'
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
  // 上限は 201: /news の「もっと見る」は表示上限 200 件ぶんに 1 件足して問い合わせ、
  // その 1 件が実際に返ってきたかどうかで「まだ先があるか」を判定する
  // （src/routes/news.tsx）。ぴったり 200 件で終わる空振りクリックを避けるため。
  limit: z.number().int().min(1).max(201).default(50),
  offset: z.number().int().min(0).default(0),
})
export type ListVendorNewsInput = z.input<typeof listVendorNewsInput>

/** 'YYYY-MM' を月初〜月末の範囲（'YYYY-MM-DD'）に直す。カレンダーの情報レイヤー用。 */
export const newsEventsForMonthInput = z
  .object({
    // 月は 01〜12 だけを許す（例: 13 や 00 を通すと monthKeys が '2026-13-01' のような
    // 空の結果を静かに作ってしまう）。
    ym: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, '年月は YYYY-MM の形式で指定してください'),
  })
  .transform(({ ym }) => {
    const [year, month] = ym.split('-').map(Number)
    const days = monthKeys(year, month)
    return { from: days[0], to: days[days.length - 1] }
  })
export type NewsEventsForMonthInput = z.input<typeof newsEventsForMonthInput>

/**
 * カレンダーの情報レイヤー用（月をまたぐ表示範囲）。カレンダー画面の月表示は前後の週が
 * はみ出すぶん広めに取る（src/routes/calendar.tsx の visibleRange）ため、月境界で
 * 切ってしまう newsEventsForMonth ではなく、こちらで実際の表示範囲そのものを渡す。
 */
export const newsEventsBetweenInput = z.object({ from: dateField, to: dateField })
export type NewsEventsBetweenInput = z.input<typeof newsEventsBetweenInput>

export const planVisitInput = z.object({ newsId: idField })
export type PlanVisitInput = z.input<typeof planVisitInput>
