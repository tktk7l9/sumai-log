import { ActionIcon, Anchor, Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { ExternalLink, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { FormDrawer } from '../components/FormDrawer'
import { PageShell } from '../components/PageShell'
import { Row } from '../components/candidates/DetailRow'
import { StatusBadge } from '../components/candidates/StatusBadge'
import { VendorForm } from '../components/candidates/VendorForm'
import { PlaceForm } from '../components/places/PlaceForm'
import { PLACE_KIND_LABEL, VENDOR_KIND_LABEL } from '../db/schema'
import { formatTsubo } from '../lib/format'
import { deleteVendor, getVendor } from '../server/candidates'
import { listLinkTargets } from '../server/places'
import { getHomeAreas } from '../server/settings'

export const Route = createFileRoute('/candidates_/vendors/$id')({
  component: Page,
  loader: async ({ params }) => {
    const [detail, homeAreas, targets] = await Promise.all([
      getVendor({ data: { id: params.id } }),
      getHomeAreas(),
      listLinkTargets(),
    ])
    return { ...detail, homeAreas, targets }
  },
})

function Page() {
  const { vendor, places, coversHome, homeAreas, targets } = Route.useLoaderData()
  const navigate = useNavigate()
  const remove = useServerFn(deleteVendor)
  const [editing, setEditing] = useState(false)
  const [addingPlace, setAddingPlace] = useState(false)

  async function handleDelete() {
    if (!window.confirm(`「${vendor.name}」を削除します。場所・予定・記録は残ります。`)) return
    try {
      await remove({ data: { id: vendor.id } })
      notifications.show({ message: '業者を削除しました' })
      navigate({ to: '/candidates', search: { tab: 'vendors', coversHome: false } })
    } catch {
      notifications.show({ message: '削除できませんでした', color: 'red' })
    }
  }

  return (
    <PageShell
      title={vendor.name}
      actions={
        <Group gap="xs">
          <StatusBadge status={vendor.status} />
          <Badge variant="default">{VENDOR_KIND_LABEL[vendor.kind]}</Badge>
          {coversHome ? (
            <Badge color="teal" variant="light">
              建築予定地が施工エリア内
            </Badge>
          ) : null}
          <ActionIcon variant="default" aria-label="編集" onClick={() => setEditing(true)}>
            <Pencil size={16} />
          </ActionIcon>
          <ActionIcon variant="default" color="red" aria-label="削除" onClick={handleDelete}>
            <Trash2 size={16} />
          </ActionIcon>
        </Group>
      }
    >
      <Card withBorder padding="md">
        <Stack gap="xs">
          <Row label="本社" value={vendor.hq} />
          <Row
            label="施工エリア"
            value={vendor.serviceAreas.length ? vendor.serviceAreas.join('、') : '未登録'}
          />
          <Row
            label="UA値 / C値"
            value={`${vendor.uaValue ?? '—'} / ${vendor.cValuePublished ? '実測公開' : '非公開'}`}
          />
          <Row
            label="耐震等級 / 長期優良"
            value={`${vendor.seismicGrade ?? '—'} / ${vendor.longTermCertified ? '対応' : '—'}`}
          />
          <Row
            label="坪単価"
            value={formatTsubo(vendor.pricePerTsuboMin, vendor.pricePerTsuboMax)}
          />
          <Row label="構造" value={vendor.structure} />
          {vendor.websiteUrl ? (
            <Row
              label="公式"
              value={
                <Anchor href={vendor.websiteUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} aria-hidden /> 開く
                </Anchor>
              }
            />
          ) : null}
          {vendor.sourceUrl ? (
            <Row
              label="参照 URL"
              value={
                <Anchor href={vendor.sourceUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} aria-hidden /> 開く
                </Anchor>
              }
            />
          ) : null}
        </Stack>
      </Card>
      {vendor.features ? <Text style={{ whiteSpace: 'pre-wrap' }}>{vendor.features}</Text> : null}

      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Title order={2}>場所</Title>
          <Button
            variant="default"
            size="xs"
            leftSection={<Plus size={14} aria-hidden />}
            onClick={() => setAddingPlace(true)}
          >
            場所を追加
          </Button>
        </Group>
        {places.length === 0 ? (
          <Text size="sm" c="dimmed">
            この業者の展示場・モデルハウスはまだ登録されていません。
          </Text>
        ) : (
          places.map((p) => (
            <Link
              key={p.id}
              to="/places/$id"
              params={{ id: p.id }}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <Card withBorder padding="sm">
                <Group gap="xs" wrap="nowrap">
                  <MapPin size={16} aria-hidden />
                  <Text fw={600} lineClamp={1}>
                    {p.name}
                  </Text>
                  <Badge variant="default" size="xs">
                    {PLACE_KIND_LABEL[p.kind]}
                  </Badge>
                </Group>
              </Card>
            </Link>
          ))
        )}
      </Stack>

      <FormDrawer opened={editing} onClose={() => setEditing(false)} title="業者を編集">
        <VendorForm vendor={vendor} homeAreas={homeAreas} onSaved={() => setEditing(false)} />
      </FormDrawer>
      <FormDrawer opened={addingPlace} onClose={() => setAddingPlace(false)} title="場所を追加">
        <PlaceForm
          place={null}
          targets={targets}
          defaults={{ vendorId: vendor.id }}
          onSaved={() => setAddingPlace(false)}
        />
      </FormDrawer>
    </PageShell>
  )
}
