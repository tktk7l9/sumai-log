import { Chip, Group, SegmentedControl, SimpleGrid, Stack, Switch } from '@mantine/core'
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
import { CANDIDATE_STATUSES, STATUS_LABEL } from '../lib/status'
import { listCandidates } from '../server/candidates'

const search = z.object({
  tab: z.enum(['vendors', 'properties']).default('vendors'),
  coversHome: z.boolean().default(false),
  status: z.enum(CANDIDATE_STATUSES).optional(),
})

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

  return (
    <PageShell title="候補">
      <Stack gap="md">
        <SegmentedControl
          fullWidth
          value={tab}
          onChange={(v) =>
            navigate({ search: (s) => ({ ...s, tab: v as 'vendors' | 'properties' }) })
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
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              {shownVendors.map((v) => (
                <VendorCard key={v.id} vendor={v} />
              ))}
            </SimpleGrid>
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
