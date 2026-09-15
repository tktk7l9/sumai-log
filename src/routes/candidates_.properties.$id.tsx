import { ActionIcon, Anchor, Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { ExternalLink, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { FormDrawer } from '../components/FormDrawer'
import { PageShell } from '../components/PageShell'
import { Row } from '../components/candidates/DetailRow'
import { PropertyForm } from '../components/candidates/PropertyForm'
import { StatusBadge } from '../components/candidates/StatusBadge'
import { PlaceForm } from '../components/places/PlaceForm'
import { PLACE_KIND_LABEL } from '../db/schema'
import { formatSqm, formatYen } from '../lib/format'
import { deleteProperty, getProperty } from '../server/candidates'
import { listLinkTargets } from '../server/places'

export const Route = createFileRoute('/candidates_/properties/$id')({
  component: Page,
  loader: async ({ params }) => {
    const [detail, targets] = await Promise.all([
      getProperty({ data: { id: params.id } }),
      listLinkTargets(),
    ])
    return { ...detail, targets }
  },
})

function Page() {
  const { property, places, targets } = Route.useLoaderData()
  const navigate = useNavigate()
  const remove = useServerFn(deleteProperty)
  const [editing, setEditing] = useState(false)
  const [addingPlace, setAddingPlace] = useState(false)

  async function handleDelete() {
    if (!window.confirm(`「${property.name}」を削除します。場所・予定・記録は残ります。`)) return
    try {
      await remove({ data: { id: property.id } })
      notifications.show({ message: '物件を削除しました' })
      navigate({ to: '/candidates', search: { tab: 'properties', coversHome: false } })
    } catch {
      notifications.show({ message: '削除できませんでした', color: 'red' })
    }
  }

  const stationValue =
    property.station && property.walkMinutes != null
      ? `${property.station} 徒歩${property.walkMinutes}分`
      : (property.station ??
        (property.walkMinutes != null ? `徒歩${property.walkMinutes}分` : null))

  const builtLabel =
    property.builtYear != null ? '築年' : property.completionDate ? '竣工予定' : '築年 / 竣工予定'
  const builtValue =
    property.builtYear != null ? `${property.builtYear}年` : property.completionDate

  return (
    <PageShell
      title={property.name}
      actions={
        <Group gap="xs">
          <StatusBadge status={property.status} />
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
          <Row label="所在地" value={property.address} />
          <Row label="駅・徒歩" value={stationValue} />
          <Row label="価格" value={formatYen(property.price)} />
          <Row label="専有面積" value={formatSqm(property.areaSqm)} />
          <Row label="間取り" value={property.layout} />
          <Row label={builtLabel} value={builtValue} />
          <Row
            label="管理費・修繕積立金"
            value={`${formatYen(property.managementFee)} / ${formatYen(property.repairReserve)}`}
          />
          {property.listingUrl ? (
            <Row
              label="掲載URL"
              value={
                <Anchor href={property.listingUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} aria-hidden /> 開く
                </Anchor>
              }
            />
          ) : null}
        </Stack>
      </Card>
      {property.note ? <Text style={{ whiteSpace: 'pre-wrap' }}>{property.note}</Text> : null}

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
            このマンションのギャラリー・現地はまだ登録されていません。
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

      <FormDrawer opened={editing} onClose={() => setEditing(false)} title="物件を編集">
        <PropertyForm property={property} onSaved={() => setEditing(false)} />
      </FormDrawer>
      <FormDrawer opened={addingPlace} onClose={() => setAddingPlace(false)} title="場所を追加">
        <PlaceForm
          place={null}
          targets={targets}
          defaults={{ propertyId: property.id }}
          onSaved={() => setAddingPlace(false)}
        />
      </FormDrawer>
    </PageShell>
  )
}
