import { ActionIcon, Anchor, Badge, Card, Group, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { CommentThread } from '../components/comments/CommentThread'
import { FormDrawer } from '../components/FormDrawer'
import { PageShell } from '../components/PageShell'
import { Row } from '../components/candidates/DetailRow'
import { PlaceForm } from '../components/places/PlaceForm'
import { PlaceLocation } from '../components/places/PlaceLocation'
import { PLACE_KIND_LABEL } from '../db/schema'
import { listCommentsFor } from '../server/comments'
import { getMapConfig } from '../server/mapConfig'
import { deletePlace, getPlace, listLinkTargets } from '../server/places'

export const Route = createFileRoute('/places/$id')({
  component: Page,
  loader: async ({ params }) => {
    const [detail, targets, commentData, mapConfig] = await Promise.all([
      getPlace({ data: { id: params.id } }),
      listLinkTargets(),
      listCommentsFor({ data: { targetType: 'place', targetId: params.id } }),
      getMapConfig(),
    ])
    return { ...detail, targets, ...commentData, mapConfig }
  },
})

function Page() {
  const { place, vendor, property, visited, targets, comments, me, members, mapConfig } =
    Route.useLoaderData()
  const navigate = useNavigate()
  const remove = useServerFn(deletePlace)
  const [editing, setEditing] = useState(false)

  async function handleDelete() {
    if (!window.confirm(`「${place.name}」を削除します。`)) return
    const result = await remove({ data: { id: place.id } })
    if (!result.ok) {
      notifications.show({ message: '見学記録があるため消せません', color: 'red' })
      return
    }
    notifications.show({ message: '場所を削除しました' })
    navigate({ to: '/map' })
  }

  return (
    <PageShell
      title={place.name}
      actions={
        <Group gap="xs">
          <Badge variant="default">{PLACE_KIND_LABEL[place.kind]}</Badge>
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
          <Row label="住所" value={place.address} />
          {vendor ? (
            <Row
              label="業者"
              value={
                <Link to="/candidates/vendors/$id" params={{ id: vendor.id }}>
                  <Anchor component="span">{vendor.name}</Anchor>
                </Link>
              }
            />
          ) : null}
          {property ? (
            <Row
              label="マンション物件"
              value={
                <Link to="/candidates/properties/$id" params={{ id: property.id }}>
                  <Anchor component="span">{property.name}</Anchor>
                </Link>
              }
            />
          ) : null}
        </Stack>
      </Card>

      <PlaceLocation place={place} visited={visited} mapConfig={mapConfig} />

      {place.note ? <Text style={{ whiteSpace: 'pre-wrap' }}>{place.note}</Text> : null}

      <CommentThread
        targetType="place"
        targetId={place.id}
        comments={comments}
        me={me}
        members={members}
      />

      <FormDrawer opened={editing} onClose={() => setEditing(false)} title="場所を編集">
        <PlaceForm
          place={place}
          targets={targets}
          onSaved={() => {
            setEditing(false)
          }}
        />
      </FormDrawer>
    </PageShell>
  )
}
