import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'

export type MapConfig = { apiKey: string | null; mapId: string }

/**
 * Google マップの設定。API キーはリファラー制限つきの公開キー（クライアントに渡してよい）
 * だが、public リポジトリに載せないため secret / .dev.vars から読む。未設定なら null にして
 * 地図の代わりに案内文を出す。Map ID は AdvancedMarker に必須。未設定なら Google の
 * サンプル用 ID で動かす（既定スタイル）。
 */
export const getMapConfig = createServerFn().handler(async (): Promise<MapConfig> => ({
  apiKey: env.GOOGLE_MAPS_API_KEY || null,
  mapId: env.GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
}))
