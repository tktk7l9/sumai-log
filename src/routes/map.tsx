import { ActionIcon, Paper, SegmentedControl, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { LocateFixed } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Fab } from '../components/Fab'
import { FormDrawer } from '../components/FormDrawer'
import { PlaceSheet } from '../components/map/PlaceSheet'
import { PlacesMapLazy } from '../components/map/PlacesMapLazy'
import { PlaceForm } from '../components/places/PlaceForm'
import { toMarkers } from '../lib/mapMarkers'
import { listLinkTargets, listPlaces } from '../server/places'

export const Route = createFileRoute('/map')({
  component: Page,
  loader: async () => {
    const [places, targets] = await Promise.all([listPlaces(), listLinkTargets()])
    return { places, targets }
  },
})

type Filter = 'all' | 'visited' | 'planned'

function Page() {
  const { places, targets } = Route.useLoaderData()
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('all')
  const [sheetId, setSheetId] = useState<string | null>(null)
  const [formOpened, setFormOpened] = useState(false)
  const [center, setCenter] = useState<{ lat: number; lng: number } | undefined>(undefined)

  const shownPlaces = useMemo(
    () => places.filter((p) => filter === 'all' || (filter === 'visited') === p.visited),
    [places, filter],
  )
  const markers = useMemo(() => toMarkers(shownPlaces), [shownPlaces])
  const missingCount = places.filter((p) => p.lat == null || p.lng == null).length
  const sheetPlace = sheetId ? (places.find((p) => p.id === sheetId) ?? null) : null

  function locateMe() {
    if (!navigator.geolocation) {
      notifications.show({ message: '現在地を取得できませんでした', color: 'red' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => notifications.show({ message: '現在地を取得できませんでした', color: 'red' }),
    )
  }

  return (
    <div className="map-page" style={{ position: 'relative' }}>
      <PlacesMapLazy markers={markers} focusId={sheetId} center={center} onSelect={setSheetId} />

      <Stack gap={6} style={{ position: 'absolute', top: 8, left: 8, right: 56, zIndex: 1000 }}>
        {/* 影を持つのは FAB だけ。地図の上の板は罫線と面の色で浮かせる */}
        <Paper withBorder p={6}>
          <SegmentedControl
            fullWidth
            size="xs"
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            data={[
              { value: 'all', label: 'すべて' },
              { value: 'visited', label: '行った' },
              { value: 'planned', label: '予定だけ' },
            ]}
          />
        </Paper>
        {missingCount > 0 ? (
          <Paper withBorder p={6}>
            <Text size="xs" c="dimmed">
              地図に出せない場所が {missingCount} 件（一覧で確認）
            </Text>
          </Paper>
        ) : null}
      </Stack>

      <ActionIcon
        variant="default"
        size="lg"
        radius="xl"
        aria-label="現在地"
        onClick={locateMe}
        // 右上には Leaflet のズームコントロール（PlacesMap で position: 'topright'）が
        // 高さ約 64px + 上マージン 10px で乗るため、その下に配置して重なりを避ける
        style={{ position: 'absolute', top: 82, right: 8, zIndex: 1000 }}
      >
        <LocateFixed size={18} aria-hidden />
      </ActionIcon>

      <Fab label="場所を追加" onClick={() => setFormOpened(true)} />
      <FormDrawer
        opened={formOpened}
        onClose={() => setFormOpened(false)}
        title="場所を追加"
        zIndex={1300}
      >
        <PlaceForm
          place={null}
          targets={targets}
          onSaved={async () => {
            setFormOpened(false)
            await router.invalidate()
          }}
        />
      </FormDrawer>

      <PlaceSheet place={sheetPlace} onClose={() => setSheetId(null)} />
    </div>
  )
}
