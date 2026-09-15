import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'

import { boundsOf, type MapMarker } from '../../lib/mapMarkers'

const GSI_PALE = 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'
const ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>'

function pinIcon(visited: boolean, active: boolean): L.DivIcon {
  return L.divIcon({
    className: 'place-pin-wrap',
    html: `<div class="place-pin${visited ? ' visited' : ''}${active ? ' active' : ''}"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
  })
}

/**
 * 場所のピンを地理院タイル上に描く Leaflet 地図。
 *
 * window に依存するのでこのファイル自体を直接 import してはいけない。
 * SSR を跨ぐ呼び出しは PlacesMapLazy から行う。
 */
export function PlacesMap({
  markers,
  focusId = null,
  center,
  onSelect,
}: {
  markers: MapMarker[]
  focusId?: string | null
  /** 現在地などへ地図を寄せたいときに渡す。変わるたびに setView する */
  center?: { lat: number; lng: number }
  onSelect?: (id: string) => void
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<Map<string, { marker: L.Marker; visited: boolean }>>(new Map())
  const onSelectRef = useRef(onSelect)
  const focusIdRef = useRef(focusId)
  useEffect(() => {
    onSelectRef.current = onSelect
    focusIdRef.current = focusId
  })

  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    const map = L.map(elRef.current, { zoomControl: false, minZoom: 4, maxZoom: 18 })
    // 地図タブの FAB「場所を追加」は右下(bottom-right)に浮くため、そこにズームコント
    // ロールを置くと重なる（実測: 390×844 で約 28×39px 重複）。右上に移す
    L.control.zoom({ position: 'topright' }).addTo(map)
    L.tileLayer(GSI_PALE, { maxZoom: 18, maxNativeZoom: 18, attribution: ATTRIBUTION }).addTo(map)
    mapRef.current = map
    const t = setTimeout(() => map.invalidateSize(), 0)
    return () => {
      clearTimeout(t)
      map.remove()
      mapRef.current = null
      layerRef.current.clear()
    }
  }, [])

  // マーカーを描き直し、表示範囲を合わせる。focusId はここでは見ない
  // （ピンをタップしただけで視点が戻ってしまうのを防ぐため、アイコンの
  // アクティブ表示は下の別 effect に分離している）。
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    for (const { marker } of layerRef.current.values()) marker.remove()
    layerRef.current.clear()
    for (const m of markers) {
      const marker = L.marker([m.lat, m.lng], {
        icon: pinIcon(m.visited, m.id === focusIdRef.current),
      }).addTo(map)
      const label = document.createElement('span')
      label.textContent = m.name
      marker.bindTooltip(label, { direction: 'top', offset: [0, -20] })
      marker.on('click', () => onSelectRef.current?.(m.id))
      layerRef.current.set(m.id, { marker, visited: m.visited })
    }
    const b = boundsOf(markers)
    if (!b) map.setView([35.68, 139.69], 9)
    else if (markers.length === 1) map.setView(b[0], 15)
    else map.fitBounds(b, { padding: [24, 24] })
  }, [markers])

  // アクティブなピンのアイコンだけ差し替える。視点（bounds/center）は動かさない。
  useEffect(() => {
    for (const [id, { marker, visited }] of layerRef.current) {
      marker.setIcon(pinIcon(visited, id === focusId))
    }
  }, [focusId])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !center) return
    map.setView([center.lat, center.lng], 15)
  }, [center])

  return <div ref={elRef} className="places-map" role="region" aria-label="場所の地図" />
}
