import { importLibrary, setOptions } from '@googlemaps/js-api-loader'
import { Text, useComputedColorScheme } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'

import { boundsOf, type MapMarker } from '../../lib/mapMarkers'

/** 座標のある場所が 1 件も無いときの初期表示（東京駅あたり・関東が入る縮尺） */
const DEFAULT_CENTER = { lat: 35.68, lng: 139.69 }
const DEFAULT_ZOOM = 9
const SINGLE_ZOOM = 15

let optionsApplied = false
/** API キーなどは 1 度しか設定できない（2 回目以降は無視される）ので、最初の 1 回だけ渡す */
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

/** ピンの DOM（見た目は src/styles.css の .place-pin）。AdvancedMarker は下端中央を座標に合わせる */
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
 * 場所のピンを Google マップ上に描く（Maps JavaScript API + AdvancedMarker）。
 * 地理院タイル + Leaflet から置き換えた（所有者の要望、2026-09-19）。
 *
 * window に依存するのでこのファイル自体を直接 import してはいけない。
 * SSR を跨ぐ呼び出しは PlacesMapLazy から行う。
 *
 * API キーは server fn（getMapConfig）から loader 経由で受け取る。リファラー制限つきの
 * 公開キーなのでクライアントに置いてよいが、リポジトリには書かない（secret / .dev.vars）。
 */
export function PlacesMap({
  markers,
  focusId = null,
  center,
  onSelect,
  apiKey,
  mapId,
  gesture = 'greedy',
}: {
  markers: MapMarker[]
  focusId?: string | null
  /** 現在地などへ地図を寄せたいときに渡す。変わるたびに寄せる */
  center?: { lat: number; lng: number }
  onSelect?: (id: string) => void
  /** 未設定（null）なら地図の代わりに案内文を出す */
  apiKey: string | null
  /** AdvancedMarker に必須。Cloud コンソールで作った Map ID か 'DEMO_MAP_ID' */
  mapId: string
  /** 'cooperative' はページの中に埋めた小さな地図用（1 本指のスクロールを地図が奪わない） */
  gesture?: 'greedy' | 'cooperative'
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

  // 地図の配色はアプリで選んだ配色（設定のライト／ダーク）に合わせる。端末の設定に
  // 従わせる（FOLLOW_SYSTEM）と、アプリをライトにしていても端末がダークなら地図だけ
  // ダークになっていた（所有者の報告、2026-09-24）。colorScheme は地図を作るときにしか
  // 渡せないので、切り替えたら作り直す
  const scheme = useComputedColorScheme('light')

  useEffect(() => {
    if (!apiKey || !elRef.current || gmRef.current) return
    let cancelled = false
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
        // 既定 UI（地図/航空写真の切替・ストリートビュー・全画面）は出さず、ズームだけ右上に。
        // 右下は FAB「場所を追加」が浮くので空けておく（置き換え前と同じ配置）
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
      for (const { marker } of layerRef.current.values()) marker.map = null
      layerRef.current.clear()
      gmRef.current = null
      setReady(false)
    }
  }, [apiKey, mapId, gesture, scheme])

  // マーカーを描き直し、表示範囲を合わせる。focusId はここでは見ない
  // （ピンをタップしただけで視点が戻ってしまうのを防ぐため、アクティブ表示は
  // 下の別 effect に分離している）。
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

  // アクティブなピンの見た目だけ差し替える。視点は動かさない。
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
      <div className="places-map sunken" role="region" aria-label="場所の地図">
        <Text size="sm" p="md">
          {failed
            ? 'Google マップを読み込めませんでした。API キーの制限（リファラー）を確認してください。'
            : 'Google マップの API キーが未設定です（README「Google マップ」の手順で設定）。'}
        </Text>
      </div>
    )
  }
  return <div ref={elRef} className="places-map" role="region" aria-label="場所の地図" />
}
