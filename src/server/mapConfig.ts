import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'

export type MapConfig = { apiKey: string | null; mapId: string }

/**
 * Google Maps configuration. The API key is a public key with a referrer restriction (it may
 * be passed to the client), but it is read from secret / .dev.vars to keep it out of the
 * public repository. When unset it becomes null and a guidance text is shown instead of the
 * map. Map ID is required for AdvancedMarker. When unset it runs with Google's sample ID
 * (default style).
 */
export const getMapConfig = createServerFn().handler(async (): Promise<MapConfig> => ({
  apiKey: env.GOOGLE_MAPS_API_KEY || null,
  mapId: env.GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
}))
