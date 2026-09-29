/**
 * Stand-in for src/components/map/PlacesMap.tsx (Google Maps cannot run in jsdom). It shows the
 * markers it was given as buttons, so a test can check what reaches the map and "tap" a pin.
 */
import type { MapMarker } from '../../src/lib/mapMarkers'

export function PlacesMap({
  markers,
  focusId = null,
  onSelect,
  onShowList,
}: {
  markers: MapMarker[]
  focusId?: string | null
  onSelect?: (id: string) => void
  onShowList?: () => void
}) {
  return (
    <div role="region" aria-label="地図（テスト用）">
      {markers.map((m) => (
        <button
          key={m.id}
          type="button"
          aria-pressed={m.id === focusId}
          onClick={() => onSelect?.(m.id)}
        >
          {`ピン: ${m.name}${m.visited ? '（見学済み）' : ''}`}
        </button>
      ))}
      {onShowList ? (
        <button type="button" onClick={onShowList}>
          地図の代わりに一覧
        </button>
      ) : null}
    </div>
  )
}
