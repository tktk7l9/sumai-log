import { Button, Chip, Group, Modal, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { EmptyState } from '../components/EmptyState'
import { Fab } from '../components/Fab'
import { FormDrawer } from '../components/FormDrawer'
import { PageShell } from '../components/PageShell'
import { SourceForm } from '../components/sources/SourceForm'
import { SourceRow } from '../components/sources/SourceRow'
import { sourcesSearchSchema, type SourcesSearch } from '../components/sources/sourcesSearch'
import { SOURCE_GENRES } from '../content/sourceGenres'
import type { Source } from '../db/schema'
import { groupSourcesByGenre } from '../lib/sources'
import { deleteSource, listSources, sourceFormOptions } from '../server/sources'

export const Route = createFileRoute('/sources')({
  component: Page,
  validateSearch: (s) => sourcesSearchSchema.parse(s),
  loader: async () => {
    const [sources, options] = await Promise.all([listSources(), sourceFormOptions()])
    return { sources, options }
  },
})

function Page() {
  const { sources, options } = Route.useLoaderData()
  const { g } = Route.useSearch()
  const navigate = useNavigate({ from: '/sources' })
  const router = useRouter()
  const remove = useServerFn(deleteSource)

  const [formOpened, setFormOpened] = useState(false)
  const [editing, setEditing] = useState<Source | null>(null)
  const [deleting, setDeleting] = useState<Source | null>(null)
  const [removing, setRemoving] = useState(false)

  const filtered = g ? sources.filter((s) => s.genre === g) : sources
  const groups = groupSourcesByGenre(filtered)

  function openAdd() {
    setEditing(null)
    setFormOpened(true)
  }

  function openEdit(source: Source) {
    setEditing(source)
    setFormOpened(true)
  }

  async function handleDelete() {
    if (!deleting) return
    setRemoving(true)
    try {
      const result = await remove({ data: { id: deleting.id } })
      await router.invalidate()
      // ok: false は「既に消えていた」（もう一方の端末が先に削除した等）。行はどのみち
      // 無いので一覧側は router.invalidate() で正しい状態になる。文言だけ変える
      notifications.show({
        message: result.ok ? '情報源を削除しました' : '既に削除されていました',
        color: result.ok ? undefined : 'yellow',
      })
      setDeleting(null)
    } catch {
      notifications.show({ message: '削除できませんでした', color: 'red' })
    } finally {
      setRemoving(false)
    }
  }

  return (
    <PageShell title="情報収集" description="家づくりの情報源をジャンルごとに" fab>
      <Stack gap="lg">
        <Chip.Group
          value={g ?? null}
          onChange={(v) =>
            navigate({
              search: (s) => ({ ...s, g: (v as SourcesSearch['g']) || undefined }),
              replace: true,
            })
          }
        >
          <Group gap={6}>
            {SOURCE_GENRES.map((genre) => (
              <Chip key={genre.id} value={genre.id} size="xs">
                {genre.label}
              </Chip>
            ))}
          </Group>
        </Chip.Group>

        {groups.length === 0 ? (
          <EmptyState
            emoji="📺"
            title="情報源がありません"
            description="右下の追加から登録できます。"
          />
        ) : (
          <Stack gap="lg">
            {groups.map((group) => (
              <Stack key={group.genre.id} gap="sm">
                <Title order={2}>
                  {group.genre.label}（{group.items.length}）
                </Title>
                <Stack gap="md">
                  {group.items.map((source) => (
                    <SourceRow
                      key={source.id}
                      source={source}
                      vendorName={source.vendorName}
                      onEdit={() => openEdit(source)}
                      onDelete={() => setDeleting(source)}
                    />
                  ))}
                </Stack>
              </Stack>
            ))}
          </Stack>
        )}
      </Stack>

      <Fab label="情報源を追加" onClick={openAdd} />
      <FormDrawer
        opened={formOpened}
        onClose={() => setFormOpened(false)}
        title={editing ? '情報源を編集' : '情報源を追加'}
      >
        <SourceForm
          initial={editing ?? undefined}
          options={options}
          onSaved={() => setFormOpened(false)}
          onCancel={() => setFormOpened(false)}
        />
      </FormDrawer>

      <Modal opened={deleting !== null} onClose={() => setDeleting(null)} title="削除の確認">
        <Stack gap="md">
          <Text size="sm">
            {deleting ? `「${deleting.name}」を削除します。元に戻せません。` : ''}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleting(null)}>
              キャンセル
            </Button>
            <Button color="red" loading={removing} onClick={handleDelete}>
              削除する
            </Button>
          </Group>
        </Stack>
      </Modal>
    </PageShell>
  )
}
