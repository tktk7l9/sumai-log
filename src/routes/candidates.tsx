import { Button, Chip, Group, SegmentedControl, SimpleGrid, Stack, Title } from '@mantine/core'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Columns3 } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'

import { EmptyState } from '../components/EmptyState'
import { Fab } from '../components/Fab'
import { FormDrawer } from '../components/FormDrawer'
import { usePendingDeletes } from '../components/undoableDelete'
import { PageShell } from '../components/PageShell'
import { PropertyCard } from '../components/candidates/PropertyCard'
import { PropertyForm } from '../components/candidates/PropertyForm'
import { VendorCard } from '../components/candidates/VendorCard'
import { VendorForm } from '../components/candidates/VendorForm'
import { VENDOR_KINDS, VENDOR_KIND_LABEL } from '../db/schema'
import { CANDIDATE_STATUSES, STATUS_LABEL } from '../lib/status'
import { listCandidates } from '../server/candidates'

const search = z.object({
  tab: z.enum(['vendors', 'properties']).default('vendors'),
  status: z.enum(CANDIDATE_STATUSES).optional(),
})

type VendorKind = (typeof VENDOR_KINDS)[number]
type CandidateKind = 'vendors' | 'properties'

/**
 * Shows the cards of the candidates list split into builders and house makers (owner's request).
 * Builder / house maker / design office get a heading with their own name; everything else
 * (developers and so on, even if more are added) is gathered under "その他" (Other). A group
 * with 0 items is not shown (the same goes for a group emptied by the filter).
 */
const VENDOR_GROUPS: { label: string; match: (kind: VendorKind) => boolean }[] = [
  { label: VENDOR_KIND_LABEL.koumuten, match: (k) => k === 'koumuten' },
  { label: VENDOR_KIND_LABEL.hm, match: (k) => k === 'hm' },
  { label: VENDOR_KIND_LABEL.sekkei, match: (k) => k === 'sekkei' },
  { label: 'その他', match: (k) => k !== 'koumuten' && k !== 'hm' && k !== 'sekkei' },
]

export const Route = createFileRoute('/candidates')({
  component: Page,
  validateSearch: search,
  loader: () => listCandidates(),
})

function Page() {
  const { vendors: loadedVendors, properties: loadedProperties, homeAreas } = Route.useLoaderData()
  // Rows whose deletion can still be undone are hidden at once
  const pendingDeletes = usePendingDeletes()
  const vendors = loadedVendors.filter((v) => !pendingDeletes.has(v.id))
  const properties = loadedProperties.filter((p) => !pendingDeletes.has(p.id))
  const { tab, status } = Route.useSearch()
  const navigate = useNavigate({ from: '/candidates' })
  const [opened, setOpened] = useState(false)

  const shownVendors = vendors.filter((v) => !status || v.status === status)
  const shownProperties = properties.filter((p) => !status || p.status === status)
  const vendorGroups = VENDOR_GROUPS.map((g) => ({
    label: g.label,
    vendors: shownVendors.filter((v) => g.match(v.kind)),
  })).filter((g) => g.vendors.length > 0)

  // When there is not even 1 condominium (property), the detached house / condominium switch
  // tabs themselves are not shown (owner's request). Opening ?tab=properties directly is
  // respected as is, and the list below and the initial selection of the add drawer use the
  // value of tab as is (only the tabs are absent; the behaviour does not change)
  const showTabs = properties.length > 0

  return (
    <PageShell title="候補" titleHidden fab>
      <Stack gap="md">
        {showTabs ? (
          <SegmentedControl
            fullWidth
            aria-label="表示の切替"
            value={tab}
            onChange={(v) =>
              navigate({
                search: (s) => ({ ...s, tab: v as CandidateKind }),
                replace: true,
              })
            }
            data={[
              { value: 'vendors', label: `戸建て ${vendors.length}` },
              { value: 'properties', label: `マンション ${properties.length}` },
            ]}
          />
        ) : null}
        <Group gap="xs" justify="space-between" align="center">
          {/* Always keep exactly 1 selected (nothing selected = all items is not visible at a
              glance). "すべて" (All) is not a status value, so it is not kept in search */}
          <Chip.Group
            value={status ?? 'all'}
            onChange={(v) =>
              navigate({
                search: (s) => ({ ...s, status: v === 'all' ? undefined : (v as typeof status) }),
              })
            }
          >
            <Group gap={6}>
              <Chip value="all" size="xs">
                すべて
              </Chip>
              {CANDIDATE_STATUSES.map((s) => (
                <Chip key={s} value={s} size="xs">
                  {STATUS_LABEL[s]}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
          {/* Link to the comparison table only with 2 or more vendors (1 has nothing to compare) */}
          {tab === 'vendors' && vendors.length >= 2 ? (
            <Button
              component={Link}
              to="/candidates/compare"
              variant="default"
              size="xs"
              leftSection={<Columns3 size={14} aria-hidden />}
            >
              比較表
            </Button>
          ) : null}
        </Group>

        {tab === 'vendors' ? (
          shownVendors.length ? (
            <Stack gap="lg">
              {vendorGroups.map((g) => (
                <Stack key={g.label} gap="sm">
                  <Title order={2}>
                    {g.label}（{g.vendors.length}）
                  </Title>
                  <SimpleGrid cols={{ base: 1, md: 2 }}>
                    {g.vendors.map((v) => (
                      <VendorCard key={v.id} vendor={v} />
                    ))}
                  </SimpleGrid>
                </Stack>
              ))}
            </Stack>
          ) : (
            <EmptyState title="業者がありません" description="右下の追加から登録できます。" />
          )
        ) : shownProperties.length ? (
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {shownProperties.map((p) => (
              <PropertyCard key={p.id} property={p} />
            ))}
          </SimpleGrid>
        ) : (
          <EmptyState title="物件がありません" description="右下の追加から登録できます。" />
        )}
      </Stack>

      <Fab
        label={tab === 'vendors' ? '業者を追加' : '物件を追加'}
        onClick={() => setOpened(true)}
      />
      <FormDrawer opened={opened} onClose={() => setOpened(false)} title="追加">
        <CandidateAddForm
          initialKind={tab}
          homeAreas={homeAreas}
          onSaved={(kind, id) => {
            setOpened(false)
            if (kind === 'vendors') navigate({ to: '/candidates/vendors/$id', params: { id } })
            else navigate({ to: '/candidates/properties/$id', params: { id } })
          }}
        />
      </FormDrawer>
    </PageShell>
  )
}

/**
 * The contents of the "追加" (Add) drawer. A SegmentedControl for detached house (vendor) /
 * condominium (property) sits on top, and one of the two forms is shown below (owner's request:
 * unify "業者を追加" (Add vendor) and "物件を追加" (Add property) into "追加", and let the form
 * side choose the kind). Switching rebuilds the whole form through `key`. No confirmation:
 * each kind keeps its own draft on the device (useFormDraft), so switching back restores what
 * was typed (SHIG 57, 7; the drafts agreement of 2026-09-24).
 */
function CandidateAddForm({
  initialKind,
  homeAreas,
  onSaved,
}: {
  initialKind: CandidateKind
  homeAreas: string[]
  onSaved: (kind: CandidateKind, id: string) => void
}) {
  const [kind, setKind] = useState<CandidateKind>(initialKind)

  return (
    <Stack gap="md">
      <SegmentedControl
        fullWidth
        aria-label="追加する種別"
        value={kind}
        onChange={(next) => setKind(next as CandidateKind)}
        data={[
          { value: 'vendors', label: '戸建て（業者）' },
          { value: 'properties', label: 'マンション（物件）' },
        ]}
      />
      {kind === 'vendors' ? (
        <VendorForm
          key="vendor"
          vendor={null}
          homeAreas={homeAreas}
          onSaved={(id) => onSaved('vendors', id)}
        />
      ) : (
        <PropertyForm key="property" property={null} onSaved={(id) => onSaved('properties', id)} />
      )}
    </Stack>
  )
}
