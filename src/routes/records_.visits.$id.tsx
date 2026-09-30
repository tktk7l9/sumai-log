import { Anchor, Card, Group, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Link, createFileRoute, useNavigate, useRouter, notFound } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { CommentThread } from '../components/comments/CommentThread'
import { NextActionsChecklist } from '../components/visits/NextActionsChecklist'
import { RouteNotFoundState } from '../components/ErrorStates'
import { DeleteSection, EditButton } from '../components/DetailActions'
import { FormDrawer } from '../components/FormDrawer'
import { deleteWithUndo, usePendingDeletes } from '../components/undoableDelete'
import { BackButton, PageShell } from '../components/PageShell'
import { Row } from '../components/candidates/DetailRow'
import { PhotoGrid } from '../components/visits/PhotoGrid'
import { PhotoUploader } from '../components/visits/PhotoUploader'
import { VisitForm } from '../components/visits/VisitForm'
import type { Photo } from '../db/schema'
import { formatDateWithWeekday } from '../lib/calendar'
import { visitSummary } from '../lib/visitSummary'
import { listCommentsFor } from '../server/comments'
import {
  deletePhoto,
  deleteVisit,
  getVisit,
  reorderPhotos,
  visitFormOptions,
} from '../server/visits'
import { isIdLike } from '../lib/ids'

export const Route = createFileRoute('/records_/visits/$id')({
  component: Page,
  notFoundComponent: NotFound,
  loader: async ({ params }) => {
    // A malformed id can never exist; answer with the in-app 404 instead of a validator 500
    if (!isIdLike(params.id)) throw notFound()
    const [detail, options, commentData] = await Promise.all([
      getVisit({ data: { id: params.id } }),
      visitFormOptions(),
      listCommentsFor({ data: { targetType: 'visit', targetId: params.id } }),
    ])
    return { ...detail, options, ...commentData }
  },
})

// "次にやること" (Next actions) is shown by the checklist below (NextActionsChecklist)
const BLOCKS: { key: 'good' | 'concerns' | 'qa'; label: string }[] = [
  { key: 'good', label: '良かった点' },
  { key: 'concerns', label: '気になった点' },
  { key: 'qa', label: '聞いたことと答え' },
]

function Page() {
  const { visit, place, vendor, property, event, photos, options, comments, me, members } =
    Route.useLoaderData()
  const navigate = useNavigate()
  const router = useRouter()
  const removeVisit = useServerFn(deleteVisit)
  const removePhoto = useServerFn(deletePhoto)
  const reorder = useServerFn(reorderPhotos)
  const [editing, setEditing] = useState(false)

  const pendingDeletes = usePendingDeletes()

  function handleDeleteVisit() {
    deleteWithUndo({
      id: visit.id,
      message: '見学記録を削除しました',
      commit: async (fetch) => {
        await removeVisit({ data: { id: visit.id }, fetch })
        await router.invalidate()
      },
    })
    navigate({ to: '/records', search: { tab: 'visits' } })
  }

  function handleDeletePhoto(photo: Photo) {
    deleteWithUndo({
      id: photo.id,
      message: '写真を削除しました',
      commit: async (fetch) => {
        await removePhoto({ data: { id: photo.id }, fetch })
        await router.invalidate()
      },
    })
  }

  async function handleReorderPhotos(photoIds: string[]) {
    const { ok } = await reorder({ data: { visitId: visit.id, photoIds } })
    if (!ok) {
      notifications.show({ message: '並び替えを保存できませんでした', color: 'red' })
      return
    }
    await router.invalidate()
  }

  return (
    <PageShell
      back={
        <BackButton
          label="記録"
          renderLink={(p) => <Link {...p} to="/records" search={{ tab: 'visits' }} />}
        />
      }
      title={
        visitSummary({
          placeName: place?.name ?? null,
          vendorName: vendor?.name ?? null,
          propertyName: property?.name ?? null,
          good: null,
        }).title
      }
      description={formatDateWithWeekday(visit.visitedOn)}
      actions={
        <Group gap="xs">
          <EditButton onClick={() => setEditing(true)} />
        </Group>
      }
    >
      {/* With no place, vendor, property or event linked the card would be an empty frame;
          leave it out (SHIG 1) */}
      {place || vendor || property || event ? (
        <Card withBorder padding="md">
          <Stack gap="xs">
            {place ? (
              <Row
                label="場所"
                value={
                  <Link to="/places/$id" params={{ id: place.id }}>
                    <Anchor component="span">{place.name}</Anchor>
                  </Link>
                }
              />
            ) : null}
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
            {event ? <Row label="予定" value={event.title} /> : null}
          </Stack>
        </Card>
      ) : null}

      {/* Blocks left empty are not shown as 「—」 (SHIG 1, 37) */}
      {BLOCKS.filter((b) => visit[b.key]?.trim()).map((b) => (
        <Stack key={b.key} gap={4}>
          <Title order={2} size="h3">
            {b.label}
          </Title>
          <Text className="breakable" style={{ whiteSpace: 'pre-wrap' }}>
            {visit[b.key]}
          </Text>
        </Stack>
      ))}

      <NextActionsChecklist
        visitId={visit.id}
        nextActions={visit.nextActions}
        updatedAt={visit.updatedAt}
      />

      <Stack gap="xs">
        <Title order={2}>写真</Title>
        <PhotoUploader visitId={visit.id} onUploaded={() => router.invalidate()} />
        <PhotoGrid
          photos={photos.filter((p) => !pendingDeletes.has(p.id))}
          onDelete={handleDeletePhoto}
          onReorder={handleReorderPhotos}
        />
      </Stack>

      <CommentThread
        targetType="visit"
        targetId={visit.id}
        comments={comments}
        me={me}
        members={members}
      />

      <DeleteSection label="この見学記録を削除" onDelete={handleDeleteVisit} />

      <FormDrawer opened={editing} onClose={() => setEditing(false)} title="見学記録を編集">
        <VisitForm visit={visit} options={options} onSaved={() => setEditing(false)} />
      </FormDrawer>
    </PageShell>
  )
}

function NotFound() {
  return (
    <RouteNotFoundState
      back={
        <BackButton
          label="記録"
          renderLink={(p) => <Link {...p} to={'/records'} search={{ tab: 'visits' }} />}
        />
      }
    />
  )
}
