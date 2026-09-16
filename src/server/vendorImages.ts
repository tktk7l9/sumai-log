/**
 * 業者のサイトのファビコン取得・代表者の顔写真（URL 取り込み・削除）の createServerFn
 * ラッパー。実処理は vendorImagesFetcher.ts（ファイルを分けている理由はそちらのコメント
 * 参照）。クライアント（RepresentativePhotoField.tsx・settings.tsx）はここから import する。
 */

import { createServerFn } from '@tanstack/react-start'

import { getDb } from '../db/client'
import { listVendorsWithWebsite } from './repository'
import {
  deleteRepresentativePhotoObjects,
  importRepresentativePhotoFromUrlCore,
  refreshAllVendorFavicons,
} from './vendorImagesFetcher'
import {
  importRepresentativePhotoInput,
  refreshVendorFaviconsInput,
  vendorIdInput,
} from './vendorImages.schema'

/** 設定画面「候補のサイトアイコン」カード一覧。newsSources（src/server/news.ts）と同じ形 */
export const faviconSources = createServerFn().handler(async () => {
  const vendors = await listVendorsWithWebsite(getDb())
  return { vendors }
})

/** 設定画面「候補のサイトアイコン」の「アイコンを取得」/「取り直す」ボタン */
export const refreshVendorFavicons = createServerFn({ method: 'POST' })
  .validator(refreshVendorFaviconsInput)
  .handler(async ({ data }) => ({ results: await refreshAllVendorFavicons(getDb(), data) }))

/** 業者フォームの「URL から取り込む」 */
export const importRepresentativePhotoFromUrl = createServerFn({ method: 'POST' })
  .validator(importRepresentativePhotoInput)
  .handler(async ({ data }) =>
    importRepresentativePhotoFromUrlCore(getDb(), data.vendorId, data.url),
  )

/** 業者フォームの「削除」（代表者の顔写真） */
export const deleteRepresentativePhoto = createServerFn({ method: 'POST' })
  .validator(vendorIdInput)
  .handler(async ({ data }) => deleteRepresentativePhotoObjects(getDb(), data.vendorId))
