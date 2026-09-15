import { dateKey } from './calendar'

/**
 * VisitForm の `defaults` に渡す、見学記録フォームの prefill 対象フィールド。
 * VisitForm 自体の内部型（server/visits.ts の VisitInput 由来）はもっと広い
 * （attendees・good・concerns 等も持つ）が、prefill で埋めるのはこの 5 つだけ。
 */
export type VisitFormValues = {
  eventId: string
  placeId: string | null
  vendorId: string | null
  propertyId: string | null
  visitedOn: string
}

type PrefillEvent = {
  placeId: string | null
  vendorId: string | null
  propertyId: string | null
  startsAt: string
}

/**
 * 予定タブの「記録を書く」（/records?fromEvent=...）から来たときの、見学記録
 * フォームの初期値を組み立てる。`src/routes/records.tsx` から切り出した純関数。
 *
 * event が無ければ（予定を指定していない、または 404 で読めなかった）undefined を
 * 返し、フォームは通常の空初期値のまま開く。
 *
 * 場所・業者・物件が未設定の予定では、それぞれ明示的に null を返す（`undefined` を
 * 返さない）。Mantine の useForm は初期値に無いキーを後から setFieldValue しても
 * 追跡しないため、ここで `?? undefined` にすると保存できなくなる実バグがあった
 * （P2-R8: 予定からの「記録を書く」で未設定の紐づけが undefined になり保存できない）。
 * 直すときはこの `?? null` を崩さないこと。
 */
export function buildVisitPrefill(
  search: { eventId?: string },
  event: PrefillEvent | null,
): Partial<VisitFormValues> | undefined {
  if (!event) return undefined
  return {
    eventId: search.eventId,
    placeId: event.placeId ?? null,
    vendorId: event.vendorId ?? null,
    propertyId: event.propertyId ?? null,
    visitedOn: dateKey(event.startsAt),
  }
}
