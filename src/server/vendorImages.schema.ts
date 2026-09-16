import { z } from 'zod'

import { idField } from './zod'

/**
 * vendorImages.ts から分離した理由: news.schema.ts と同じ（詳細はそちらのコメント参照）。
 * vendorImages.ts の createServerFn ラッパー（importRepresentativePhotoFromUrl 等）は
 * TanStack Start のサーバーランタイムが無い素の vitest workers テストから直接呼ぶと
 * 「No Start context found」で落ちるため、ここに置く純粋な zod スキーマだけを
 * vendorImages.worker-test.ts から直接検証する。
 */

/** 代表者の顔写真を URL から取り込む（POST /vendorImages importRepresentativePhotoFromUrl）。
 * https 限定 + isAllowedRemoteUrl（SSRF 対策）は実際に fetch する直前にも二重で見るが、
 * フォーム側で早めに弾けるようここでも同じ形（https:// で始まる）だけチェックする。 */
export const importRepresentativePhotoInput = z.object({
  vendorId: idField,
  url: z
    .string()
    .trim()
    .min(1, 'URL は必須です')
    .max(1000)
    .refine((v) => /^https:\/\//.test(v), 'URL は https:// で始めてください'),
})
export type ImportRepresentativePhotoInput = z.input<typeof importRepresentativePhotoInput>

/** 設定画面「候補のサイトアイコン」の取得ボタン。force=true で「取り直す」（既に favicon_key がある業者も対象にする） */
export const refreshVendorFaviconsInput = z.object({ force: z.boolean().default(false) })
export type RefreshVendorFaviconsInput = z.input<typeof refreshVendorFaviconsInput>

export const vendorIdInput = z.object({ vendorId: idField })
export type VendorIdInput = z.input<typeof vendorIdInput>
