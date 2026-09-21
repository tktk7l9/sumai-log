import { ActionIcon, Paper, SegmentedControl, Stack, Text, UnstyledButton } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { LocateFixed } from 'lucide-react'
import { useMemo, useState } from 'react'
import { z } from 'zod'

import { Fab } from '../components/Fab'
import { FormDrawer } from '../components/FormDrawer'
import { PageShell } from '../components/PageShell'
import { PlaceList } from '../components/map/PlaceList'
import { PlaceSheet } from '../components/map/PlaceSheet'
import { PlacesMapLazy } from '../components/map/PlacesMapLazy'
import { PlaceForm } from '../components/places/PlaceForm'
import { toMarkers } from '../lib/mapMarkers'
import { getMapConfig } from '../server/mapConfig'
import { listLinkTargets, listPlaces } from '../server/places'

// 地図と一覧の切替は URL に持たせる（リロード・共有・戻るで保たれる）。
// 省略時・壊れた値は地図（`?view` の無い `/map` へのリンクをそのまま使えるよう、
// 既定値をスキーマに持たせず optional にしている）
const search = z.object({
  view: z.enum(['map', 'list']).optional().catch(undefined),
})

export const Route = createFileRoute('/map')({
  component: Page,
  validateSearch: (s) => search.parse(s),
  loader: async () => {
    const [places, targets, mapConfig] = await Promise.all([
      listPlaces(),
      listLinkTargets(),
      getMapConfig(),
    ])
    return { places, targets, mapConfig }
  },
})

type Filter = 'all' | 'visited' | 'planned'

const FILTER_DATA = [
  { value: 'all', label: 'すべて' },
  { value: 'visited', label: '行った' },
  { value: 'planned', label: '予定だけ' },
]

const VIEW_DATA = [
  { value: 'map', label: '地図' },
  { value: 'list', label: '一覧' },
]

function Page() {
  const { places, targets, mapConfig } = Route.useLoaderData()
  const view = Route.useSearch().view ?? 'map'
  const navigate = useNavigate({ from: '/map' })
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

  function setView(next: string) {
    navigate({ search: () => ({ view: next as 'map' | 'list' }), replace: true })
  }

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

  const addForm = (
    <>
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
    </>
  )

  // 一覧表示（所有者の要望、2026-09-21）。地図と同じ絞り込みのまま、座標の無い場所も
  // 含めて縦に並べる。地図は高さぴったりの 1 枚なので PageShell を使わないが、
  // 一覧は他のタブと同じ普通のページとして組む
  if (view === 'list') {
    return (
      <PageShell title="地図" titleHidden fab>
        <Stack gap="md">
          <SegmentedControl
            fullWidth
            aria-label="表示の切替"
            value={view}
            onChange={setView}
            data={VIEW_DATA}
          />
          <SegmentedControl
            fullWidth
            size="xs"
            aria-label="絞り込み"
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            data={FILTER_DATA}
          />
          <PlaceList places={shownPlaces} />
        </Stack>
        {addForm}
      </PageShell>
    )
  }

  return (
    <div className="map-page" style={{ position: 'relative' }}>
      <PlacesMapLazy
        markers={markers}
        focusId={sheetId}
        center={center}
        onSelect={setSheetId}
        apiKey={mapConfig.apiKey}
        mapId={mapConfig.mapId}
      />

      <Stack gap={6} style={{ position: 'absolute', top: 8, left: 8, right: 56, zIndex: 1000 }}>
        {/* 影を持つのは FAB だけ。地図の上の板は罫線と面の色で浮かせる */}
        <Paper withBorder p={6}>
          <Stack gap={6}>
            <SegmentedControl
              fullWidth
              size="xs"
              aria-label="表示の切替"
              value={view}
              onChange={setView}
              data={VIEW_DATA}
            />
            <SegmentedControl
              fullWidth
              size="xs"
              aria-label="絞り込み"
              value={filter}
              onChange={(v) => setFilter(v as Filter)}
              data={FILTER_DATA}
            />
          </Stack>
        </Paper>
        {missingCount > 0 ? (
          // 出せない理由の確認先は一覧表示。板ごと押せるようにして切り替える
          <UnstyledButton onClick={() => setView('list')} w="100%">
            <Paper withBorder p={6} ta="left">
              <Text size="xs" c="dimmed">
                地図に出せない場所が {missingCount} 件（押すと一覧表示）
              </Text>
            </Paper>
          </UnstyledButton>
        ) : null}
      </Stack>

      <ActionIcon
        variant="default"
        size="lg"
        radius="xl"
        aria-label="現在地"
        onClick={locateMe}
        // 右上には Google マップのズームコントロール（PlacesMap で INLINE_END_BLOCK_START）が
        // 高さ約 81px + 上マージン 10px で乗るため、その下に配置して重なりを避ける。
        // 左上の板は表示切替ぶん一段高くなったが、幅で重ならないのでこのままでよい
        style={{ position: 'absolute', top: 100, right: 8, zIndex: 1000 }}
      >
        <LocateFixed size={18} aria-hidden />
      </ActionIcon>

      {addForm}

      <PlaceSheet place={sheetPlace} onClose={() => setSheetId(null)} />
    </div>
  )
}
