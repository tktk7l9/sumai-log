import { Anchor, Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core'
import { Link, createFileRoute, useNavigate, useRouter, notFound } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { ExternalLink, MapPin, Plus } from 'lucide-react'
import { useState } from 'react'

import { CommentThread } from '../components/comments/CommentThread'
import { RouteNotFoundState } from '../components/ErrorStates'
import { DeleteSection, EditButton } from '../components/DetailActions'
import { FormDrawer } from '../components/FormDrawer'
import { deleteWithUndo } from '../components/undoableDelete'
import { BackButton, PageShell } from '../components/PageShell'
import { Row } from '../components/candidates/DetailRow'
import { PropertyForm } from '../components/candidates/PropertyForm'
import { StatusBadge } from '../components/candidates/StatusBadge'
import { PlaceForm } from '../components/places/PlaceForm'
import { PLACE_KIND_LABEL } from '../db/schema'
import { formatSqm, formatYen } from '../lib/format'
import { deleteProperty, getProperty } from '../server/candidates'
import { listCommentsFor } from '../server/comments'
import { listLinkTargets } from '../server/places'
import { isIdLike } from '../lib/ids'

export const Route = createFileRoute('/candidates_/properties/$id')({
  component: Page,
  notFoundComponent: NotFound,
  loader: async ({ params }) => {
    // A malformed id can never exist; answer with the in-app 404 instead of a validator 500
    if (!isIdLike(params.id)) throw notFound()
    const [detail, targets, commentData] = await Promise.all([
      getProperty({ data: { id: params.id } }),
      listLinkTargets(),
      listCommentsFor({ data: { targetType: 'property', targetId: params.id } }),
    ])
    return { ...detail, targets, ...commentData }
  },
})

function Page() {
  const { property, places, targets, comments, me, members } = Route.useLoaderData()
  const navigate = useNavigate()
  const router = useRouter()
  const remove = useServerFn(deleteProperty)
  const [editing, setEditing] = useState(false)
  const [addingPlace, setAddingPlace] = useState(false)

  function handleDelete() {
    deleteWithUndo({
      id: property.id,
      message: `「${property.name}」を削除しました`,
      commit: async (fetch) => {
        await remove({ data: { id: property.id }, fetch })
        await router.invalidate()
      },
    })
    navigate({ to: '/candidates', search: { tab: 'properties' } })
  }

  const stationValue =
    property.station && property.walkMinutes != null
      ? `${property.station} 徒歩${property.walkMinutes}分`
      : (property.station ??
        (property.walkMinutes != null ? `徒歩${property.walkMinutes}分` : null))

  const builtLabel = property.builtYear != null ? '築年' : '竣工予定'
  const builtValue =
    property.builtYear != null ? `${property.builtYear}年` : property.completionDate

  // Monthly costs: show only the halves that are registered, with a label to match
  const fees = [
    property.managementFee != null ? { label: '管理費', value: property.managementFee } : null,
    property.repairReserve != null ? { label: '修繕積立金', value: property.repairReserve } : null,
  ].filter((f) => f !== null)

  // A value that is not registered drops its whole row instead of showing "—", and with no
  // row at all the card itself is left out (AGENTS.md; SHIG 1, 37)
  const facts: { label: string; value: React.ReactNode }[] = [
    { label: '所在地', value: property.address },
    { label: '駅・徒歩', value: stationValue },
    { label: '価格', value: property.price != null ? formatYen(property.price) : null },
    { label: '専有面積', value: property.areaSqm != null ? formatSqm(property.areaSqm) : null },
    { label: '間取り', value: property.layout },
    { label: builtLabel, value: builtValue },
    {
      label: fees.map((f) => f.label).join('・'),
      value: fees.length ? fees.map((f) => formatYen(f.value)).join(' / ') : null,
    },
    {
      label: '掲載URL',
      value: property.listingUrl ? (
        <Anchor href={property.listingUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={14} aria-hidden /> 開く
        </Anchor>
      ) : null,
    },
  ].filter((f) => f.value != null && f.value !== '')

  return (
    <PageShell
      back={
        <BackButton
          label="候補"
          renderLink={(p) => <Link {...p} to="/candidates" search={{ tab: 'properties' }} />}
        />
      }
      title={property.name}
      actions={
        <Group gap="xs">
          <StatusBadge status={property.status} />
          <EditButton onClick={() => setEditing(true)} />
        </Group>
      }
    >
      {facts.length ? (
        <Card withBorder padding="md">
          <Stack gap="xs">
            {facts.map((f) => (
              <Row key={f.label} label={f.label} value={f.value} />
            ))}
          </Stack>
        </Card>
      ) : null}
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

      <CommentThread
        targetType="property"
        targetId={property.id}
        comments={comments}
        me={me}
        members={members}
      />

      <DeleteSection label="この物件を削除" onDelete={handleDelete} />

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

function NotFound() {
  return (
    <RouteNotFoundState
      back={
        <BackButton
          label="候補"
          renderLink={(p) => <Link {...p} to={'/candidates'} search={{ tab: 'properties' }} />}
        />
      }
    />
  )
}
