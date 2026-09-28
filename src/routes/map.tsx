import {
  ActionIcon,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Title,
  UnstyledButton,
  VisuallyHidden,
} from '@mantine/core'
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
import { usePendingDeletes } from '../components/undoableDelete'
import { toMarkers } from '../lib/mapMarkers'
import { getMapConfig } from '../server/mapConfig'
import { listLinkTargets, listPlaces } from '../server/places'

// The map / list switch is kept in the URL (it survives reload, sharing and back).
// When omitted or broken the value is the map (it is optional, with no default in the schema,
// so that links to `/map` without `?view` keep working as is)
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
  const { places: loadedPlaces, targets, mapConfig } = Route.useLoaderData()
  // Places whose deletion can still be undone are hidden at once
  const pendingDeletes = usePendingDeletes()
  const places = useMemo(
    () => loadedPlaces.filter((p) => !pendingDeletes.has(p.id)),
    [loadedPlaces, pendingDeletes],
  )
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

  // List view (owner's request, 2026-09-21). With the same filter as the map, places are
  // stacked vertically, including the ones without coordinates. The map is 1 sheet that fits
  // the height exactly, so it does not use PageShell, but the list is built as a normal page
  // like the other tabs
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
      {/* The map fills the screen, so the page heading exists only for assistive technology
          (same as PageShell's titleHidden) */}
      <VisuallyHidden>
        <Title order={1}>地図</Title>
      </VisuallyHidden>
      <PlacesMapLazy
        markers={markers}
        focusId={sheetId}
        center={center}
        onSelect={setSheetId}
        apiKey={mapConfig.apiKey}
        mapId={mapConfig.mapId}
        onShowList={() => setView('list')}
      />

      <Stack gap={6} style={{ position: 'absolute', top: 8, left: 8, right: 56, zIndex: 1000 }}>
        {/* Only the FAB has a shadow. Panels over the map stand out through border and surface colour */}
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
          // The list view is where to check why a place cannot be shown. The whole panel is
          // pressable and switches to it
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
        // The Google Maps zoom control (INLINE_END_BLOCK_START in PlacesMap) sits at the top
        // right with a height of about 81px + a top margin of 10px, so this is placed below it
        // to avoid overlap. The top-left panel grew one row taller for the view switch, but it
        // does not overlap in width, so this is fine as is
        style={{ position: 'absolute', top: 100, right: 8, zIndex: 1000 }}
      >
        <LocateFixed size={18} aria-hidden />
      </ActionIcon>

      {addForm}

      <PlaceSheet place={sheetPlace} onClose={() => setSheetId(null)} />
    </div>
  )
}
