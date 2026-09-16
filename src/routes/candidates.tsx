import { Chip, Group, SegmentedControl, SimpleGrid, Stack, Switch, Title } from '@mantine/core'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'

import { EmptyState } from '../components/EmptyState'
import { Fab } from '../components/Fab'
import { FormDrawer } from '../components/FormDrawer'
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
  coversHome: z.boolean().default(false),
  status: z.enum(CANDIDATE_STATUSES).optional(),
})

type VendorKind = (typeof VENDOR_KINDS)[number]

/**
 * 候補一覧のカードを工務店とハウスメーカーで分けて表示する（所有者の要望）。
 * 工務店／ハウスメーカー／設計事務所は名前どおりの見出し、それ以外
 * （デベロッパー等、増えても）は「その他」にまとめる。0 件の分類は出さない
 * （フィルタで絞って空になった分類も同様）。
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
  const { vendors, properties, homeAreas } = Route.useLoaderData()
  const { tab, coversHome, status } = Route.useSearch()
  const navigate = useNavigate({ from: '/candidates' })
  const [opened, setOpened] = useState(false)

  const shownVendors = vendors.filter(
    (v) => (!coversHome || v.coversHome) && (!status || v.status === status),
  )
  const shownProperties = properties.filter((p) => !status || p.status === status)
  const vendorGroups = VENDOR_GROUPS.map((g) => ({
    label: g.label,
    vendors: shownVendors.filter((v) => g.match(v.kind)),
  })).filter((g) => g.vendors.length > 0)

  return (
    <PageShell title="候補" fab>
      <Stack gap="md">
        <SegmentedControl
          fullWidth
          aria-label="表示の切替"
          value={tab}
          onChange={(v) =>
            navigate({
              search: (s) => ({ ...s, tab: v as 'vendors' | 'properties' }),
              replace: true,
            })
          }
          data={[
            { value: 'vendors', label: `戸建て業者 ${vendors.length}` },
            { value: 'properties', label: `マンション ${properties.length}` },
          ]}
        />
        <Group gap="xs">
          {tab === 'vendors' ? (
            <Switch
              label="建築予定地が施工エリア内"
              checked={coversHome}
              disabled={homeAreas.length === 0}
              onChange={(e) =>
                navigate({ search: (s) => ({ ...s, coversHome: e.currentTarget.checked }) })
              }
            />
          ) : null}
          <Chip.Group
            value={status ?? null}
            onChange={(v) =>
              navigate({ search: (s) => ({ ...s, status: (v as typeof status) || undefined }) })
            }
          >
            <Group gap={6}>
              {CANDIDATE_STATUSES.map((s) => (
                <Chip key={s} value={s} size="xs">
                  {STATUS_LABEL[s]}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
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
      <FormDrawer
        opened={opened}
        onClose={() => setOpened(false)}
        title={tab === 'vendors' ? '業者を追加' : '物件を追加'}
      >
        {tab === 'vendors' ? (
          <VendorForm
            vendor={null}
            homeAreas={homeAreas}
            onSaved={(id) => {
              setOpened(false)
              navigate({ to: '/candidates/vendors/$id', params: { id } })
            }}
          />
        ) : (
          <PropertyForm
            property={null}
            onSaved={(id) => {
              setOpened(false)
              navigate({ to: '/candidates/properties/$id', params: { id } })
            }}
          />
        )}
      </FormDrawer>
    </PageShell>
  )
}
