import { ActionIcon, Anchor, Badge, Card, Group, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { CommentThread } from '../components/comments/CommentThread'
import { FormDrawer } from '../components/FormDrawer'
import { PageShell } from '../components/PageShell'
import { Row } from '../components/candidates/DetailRow'
import { PhotoGrid } from '../components/visits/PhotoGrid'
import { PhotoUploader } from '../components/visits/PhotoUploader'
import { VisitForm } from '../components/visits/VisitForm'
import { ATTENDEES_LABEL, type Photo } from '../db/schema'
import { listCommentsFor } from '../server/comments'
import { deletePhoto, deleteVisit, getVisit, visitFormOptions } from '../server/visits'

export const Route = createFileRoute('/records_/visits/$id')({
  component: Page,
  loader: async ({ params }) => {
    const [detail, options, commentData] = await Promise.all([
      getVisit({ data: { id: params.id } }),
      visitFormOptions(),
      listCommentsFor({ data: { targetType: 'visit', targetId: params.id } }),
    ])
    return { ...detail, options, ...commentData }
  },
})

const BLOCKS: { key: 'good' | 'concerns' | 'qa' | 'nextActions'; label: string }[] = [
  { key: 'good', label: '良かった点' },
  { key: 'concerns', label: '気になった点' },
  { key: 'qa', label: '聞いたことと答え' },
  { key: 'nextActions', label: '次にやること' },
]

function Page() {
  const { visit, place, vendor, property, event, photos, options, comments, me, members } =
    Route.useLoaderData()
  const navigate = useNavigate()
  const router = useRouter()
  const removeVisit = useServerFn(deleteVisit)
  const removePhoto = useServerFn(deletePhoto)
  const [editing, setEditing] = useState(false)

  async function handleDeleteVisit() {
    if (!window.confirm('見学記録と写真を削除します')) return
    try {
      await removeVisit({ data: { id: visit.id } })
      notifications.show({ message: '見学記録を削除しました' })
      navigate({ to: '/records', search: { tab: 'visits' } })
    } catch {
      notifications.show({ message: '削除できませんでした', color: 'red' })
    }
  }

  async function handleDeletePhoto(photo: Photo) {
    if (!window.confirm('この写真を削除します')) return
    try {
      await removePhoto({ data: { id: photo.id } })
      await router.invalidate()
      notifications.show({ message: '写真を削除しました' })
    } catch {
      notifications.show({ message: '削除できませんでした', color: 'red' })
    }
  }

  return (
    <PageShell
      title={visit.visitedOn}
      actions={
        <Group gap="xs">
          <Badge variant="default">{ATTENDEES_LABEL[visit.attendees]}</Badge>
          <ActionIcon variant="default" aria-label="編集" onClick={() => setEditing(true)}>
            <Pencil size={16} />
          </ActionIcon>
          <ActionIcon variant="default" color="red" aria-label="削除" onClick={handleDeleteVisit}>
            <Trash2 size={16} />
          </ActionIcon>
        </Group>
      }
    >
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

      {BLOCKS.map((b) => (
        <Stack key={b.key} gap={4}>
          <Title order={2} size="h3">
            {b.label}
          </Title>
          <Text className="breakable" style={{ whiteSpace: 'pre-wrap' }}>
            {visit[b.key] || '—'}
          </Text>
        </Stack>
      ))}

      <Stack gap="xs">
        <Title order={2}>写真</Title>
        <PhotoUploader visitId={visit.id} onUploaded={() => router.invalidate()} />
        <PhotoGrid photos={photos} onDelete={handleDeletePhoto} />
      </Stack>

      <CommentThread
        targetType="visit"
        targetId={visit.id}
        comments={comments}
        me={me}
        members={members}
      />

      <FormDrawer opened={editing} onClose={() => setEditing(false)} title="見学記録を編集">
        <VisitForm visit={visit} options={options} onSaved={() => setEditing(false)} />
      </FormDrawer>
    </PageShell>
  )
}
