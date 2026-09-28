import { Anchor, Badge, Card, Group, Stack, Text } from '@mantine/core'
import { Link, createFileRoute, useNavigate, useRouter, notFound } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { CommentThread } from '../components/comments/CommentThread'
import { RouteNotFoundState } from '../components/ErrorStates'
import { DeleteSection, EditButton } from '../components/DetailActions'
import { FormDrawer } from '../components/FormDrawer'
import { deleteWithUndo } from '../components/undoableDelete'
import { BackButton, PageShell } from '../components/PageShell'
import { Row } from '../components/candidates/DetailRow'
import { PlaceForm } from '../components/places/PlaceForm'
import { PlaceLocation } from '../components/places/PlaceLocation'
import { PLACE_KIND_LABEL } from '../db/schema'
import { listCommentsFor } from '../server/comments'
import { getMapConfig } from '../server/mapConfig'
import { deletePlace, getPlace, listLinkTargets } from '../server/places'
import { isIdLike } from '../lib/ids'

export const Route = createFileRoute('/places/$id')({
  component: Page,
  notFoundComponent: NotFound,
  loader: async ({ params }) => {
    // A malformed id can never exist; answer with the in-app 404 instead of a validator 500
    if (!isIdLike(params.id)) throw notFound()
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
  const router = useRouter()
  const remove = useServerFn(deletePlace)
  const [editing, setEditing] = useState(false)

  function handleDelete() {
    deleteWithUndo({
      id: place.id,
      message: `「${place.name}」を削除しました`,
      failureMessage: '見学記録があるため消せません',
      commit: async (fetch) => {
        const result = await remove({ data: { id: place.id }, fetch })
        await router.invalidate()
        return result.ok
      },
    })
    navigate({ to: '/map', search: { view: 'list' } })
  }

  return (
    <PageShell
      back={
        <BackButton
          label="地図"
          renderLink={(p) => <Link {...p} to="/map" search={{ view: 'list' }} />}
        />
      }
      title={place.name}
      actions={
        <Group gap="xs">
          <Badge variant="default">{PLACE_KIND_LABEL[place.kind]}</Badge>
          <EditButton onClick={() => setEditing(true)} />
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

      <DeleteSection
        label="この場所を削除"
        onDelete={handleDelete}
        blockedReason={
          visited ? '見学記録がある場所は削除できません。先に見学記録を削除してください。' : null
        }
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

function NotFound() {
  return (
    <RouteNotFoundState
      back={
        <BackButton
          label="地図"
          renderLink={(p) => <Link {...p} to={'/map'} search={{ view: 'list' }} />}
        />
      }
    />
  )
}
