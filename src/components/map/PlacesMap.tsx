import { importLibrary, setOptions } from '@googlemaps/js-api-loader'
import { Button, Stack, Text, useComputedColorScheme } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'

import { boundsOf, type MapMarker } from '../../lib/mapMarkers'

/** Initial view when no place has coordinates (around Tokyo Station, at a scale that fits
 * the Kanto region) */
const DEFAULT_CENTER = { lat: 35.68, lng: 139.69 }
const DEFAULT_ZOOM = 9
const SINGLE_ZOOM = 15

let optionsApplied = false
/** If the map is still not ready after waiting this long, switch to the guidance text (ms) */
const MAP_LOAD_TIMEOUT_MS = 15_000

/** The API key and other options can be set only once (later calls are ignored), so pass
 * them only the first time */
function ensureOptions(apiKey: string) {
  if (optionsApplied) return
  setOptions({ key: apiKey, v: 'weekly', language: 'ja', region: 'JP' })
  optionsApplied = true
}

type Gm = {
  map: google.maps.Map
  Marker: typeof google.maps.marker.AdvancedMarkerElement
  LatLngBounds: typeof google.maps.LatLngBounds
}
type Layer = { marker: google.maps.marker.AdvancedMarkerElement; pin: HTMLDivElement }

/** DOM of the pin (the look is .place-pin in src/styles.css). AdvancedMarker aligns the
 * bottom center to the coordinates */
function pinElement(
  visited: boolean,
  active: boolean,
): { wrap: HTMLDivElement; pin: HTMLDivElement } {
  const wrap = document.createElement('div')
  wrap.className = 'place-pin-wrap'
  const pin = document.createElement('div')
  pin.className = `place-pin${visited ? ' visited' : ''}${active ? ' active' : ''}`
  wrap.appendChild(pin)
  return { wrap, pin }
}

/**
 * Draws the place pins on Google Maps (Maps JavaScript API + AdvancedMarker).
 * Replaced GSI tiles + Leaflet (owner's request, 2026-09-19).
 *
 * It depends on window, so this file itself must not be imported directly.
 * Calls that cross SSR go through PlacesMapLazy.
 *
 * The API key is received from the server fn (getMapConfig) via the loader. It is a public
 * key with a referrer restriction, so it may live on the client, but it is not written in
 * the repository (secret / .dev.vars).
 */
export function PlacesMap({
  markers,
  focusId = null,
  center,
  onSelect,
  apiKey,
  mapId,
  gesture = 'greedy',
  onShowList,
}: {
  markers: MapMarker[]
  focusId?: string | null
  /** Pass this to move the map to the current location etc. It moves on every change */
  center?: { lat: number; lng: number }
  onSelect?: (id: string) => void
  /** When not set (null), show the guidance text instead of the map */
  apiKey: string | null
  /** Required by AdvancedMarker. A Map ID created in the Cloud console, or 'DEMO_MAP_ID' */
  mapId: string
  /** 'cooperative' is for a small map embedded in a page (the map does not steal
   * one-finger scrolling) */
  gesture?: 'greedy' | 'cooperative'
  /** When given, the fallback offers 「一覧で見る」 (View as list) as the way on (SHIG 55) */
  onShowList?: () => void
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const gmRef = useRef<Gm | null>(null)
  const layerRef = useRef<Map<string, Layer>>(new Map())
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const onSelectRef = useRef(onSelect)
  const focusIdRef = useRef(focusId)
  useEffect(() => {
    onSelectRef.current = onSelect
    focusIdRef.current = focusId
  })

  // The map color scheme follows the scheme chosen in the app (light/dark in settings).
  // When it followed the device setting (FOLLOW_SYSTEM), only the map became dark if the
  // device was dark even with the app set to light (owner's report, 2026-09-24).
  // colorScheme can only be passed when the map is created, so recreate the map on switch
  const scheme = useComputedColorScheme('light')

  useEffect(() => {
    if (!apiKey || !elRef.current || gmRef.current) return
    let cancelled = false
    // Do not stay blank even when loading never returns (silent because of a bad
    // connection or a key restriction)
    const timer = setTimeout(() => {
      if (!cancelled && !gmRef.current) setFailed(true)
    }, MAP_LOAD_TIMEOUT_MS)
    ;(async () => {
      ensureOptions(apiKey)
      const [core, maps, marker] = await Promise.all([
        importLibrary('core'),
        importLibrary('maps'),
        importLibrary('marker'),
      ])
      if (cancelled || !elRef.current) return
      const map = new maps.Map(elRef.current, {
        mapId,
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        minZoom: 4,
        maxZoom: 18,
        // Do not show the default UI (map/satellite switch, Street View, fullscreen); only
        // zoom, at the top right. The bottom right is kept free because the FAB
        // "場所を追加" (Add a place) floats there (same layout as before the replacement)
        disableDefaultUI: true,
        zoomControl: true,
        zoomControlOptions: { position: core.ControlPosition.INLINE_END_BLOCK_START },
        gestureHandling: gesture,
        clickableIcons: false,
        colorScheme: scheme === 'dark' ? core.ColorScheme.DARK : core.ColorScheme.LIGHT,
      })
      gmRef.current = { map, Marker: marker.AdvancedMarkerElement, LatLngBounds: core.LatLngBounds }
      setReady(true)
    })().catch(() => {
      if (!cancelled) setFailed(true)
    })
    return () => {
      cancelled = true
      clearTimeout(timer)
      for (const { marker } of layerRef.current.values()) marker.map = null
      layerRef.current.clear()
      gmRef.current = null
      setReady(false)
    }
  }, [apiKey, mapId, gesture, scheme])

  // Redraw the markers and fit the visible range. focusId is not read here
  // (to keep the viewpoint from resetting just because a pin was tapped, the active
  // display is split into the separate effect below).
  useEffect(() => {
    const gm = gmRef.current
    if (!ready || !gm) return
    for (const { marker } of layerRef.current.values()) marker.map = null
    layerRef.current.clear()
    for (const m of markers) {
      const { wrap, pin } = pinElement(m.visited, m.id === focusIdRef.current)
      const marker = new gm.Marker({
        map: gm.map,
        position: { lat: m.lat, lng: m.lng },
        content: wrap,
        title: m.name,
        gmpClickable: true,
      })
      marker.addListener('gmp-click', () => onSelectRef.current?.(m.id))
      layerRef.current.set(m.id, { marker, pin })
    }
    const b = boundsOf(markers)
    if (!b) {
      gm.map.setCenter(DEFAULT_CENTER)
      gm.map.setZoom(DEFAULT_ZOOM)
    } else if (markers.length === 1) {
      gm.map.setCenter({ lat: b[0][0], lng: b[0][1] })
      gm.map.setZoom(SINGLE_ZOOM)
    } else {
      const bounds = new gm.LatLngBounds(
        { lat: b[0][0], lng: b[0][1] },
        { lat: b[1][0], lng: b[1][1] },
      )
      gm.map.fitBounds(bounds, 24)
    }
  }, [markers, ready])

  // Swap only the look of the active pin. Do not move the viewpoint.
  useEffect(() => {
    if (!ready) return
    for (const [id, { marker, pin }] of layerRef.current) {
      const active = id === focusId
      pin.classList.toggle('active', active)
      marker.zIndex = active ? 1 : 0
    }
  }, [focusId, ready])

  useEffect(() => {
    const gm = gmRef.current
    if (!ready || !gm || !center) return
    gm.map.panTo(center)
    gm.map.setZoom(SINGLE_ZOOM)
  }, [center, ready])

  if (!apiKey || failed) {
    return (
      // Centred in the frame, not at the top left where the floating panels of /map cover it
      // (SHIG 55, 59; "never show an empty frame")
      <div className="places-map places-map-fallback sunken" role="region" aria-label="場所の地図">
        <Stack gap="sm" align="center" maw={360} p="md">
          <Text size="sm" ta="center">
            {failed
              ? 'Google マップを読み込めませんでした。通信状況か API キーの制限（リファラー）を確認してください。場所は「一覧」からも見られます。'
              : 'Google マップの API キーが未設定です（README「Google マップ」の手順で設定）。'}
          </Text>
          {onShowList ? (
            <Button variant="default" onClick={onShowList}>
              一覧で見る
            </Button>
          ) : null}
        </Stack>
      </div>
    )
  }
  return <div ref={elRef} className="places-map" role="region" aria-label="場所の地図" />
}
