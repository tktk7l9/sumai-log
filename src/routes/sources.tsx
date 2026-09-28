import { Chip, Group, Stack, Title } from '@mantine/core'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { EmptyState } from '../components/EmptyState'
import { Fab } from '../components/Fab'
import { FormDrawer } from '../components/FormDrawer'
import { PageShell } from '../components/PageShell'
import { deleteWithUndo, usePendingDeletes } from '../components/undoableDelete'
import { SourceForm } from '../components/sources/SourceForm'
import { SourceRow } from '../components/sources/SourceRow'
import { sourcesSearchSchema, type SourcesSearch } from '../components/sources/sourcesSearch'
import { SOURCE_GENRES } from '../content/sourceGenres'
import type { Source } from '../db/schema'
import { groupSourcesByGenre } from '../lib/sources'
import { deleteSource, listSources, sourceFormOptions } from '../server/sources'

/** Chip value for "no genre filter" (not a genre id) */
const ALL = 'all'

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
  const pendingDeletes = usePendingDeletes()

  const visible = sources.filter((s) => !pendingDeletes.has(s.id))
  const filtered = g ? visible.filter((s) => s.genre === g) : visible
  const groups = groupSourcesByGenre(filtered)

  function openAdd() {
    setEditing(null)
    setFormOpened(true)
  }

  function openEdit(source: Source) {
    setEditing(source)
    setFormOpened(true)
  }

  function handleDelete(source: Source) {
    deleteWithUndo({
      id: source.id,
      message: `「${source.name}」を削除しました`,
      // ok: false means "it was already gone" (the other device deleted it first). The row is
      // gone either way, so it is not reported as a failure
      commit: async () => {
        await remove({ data: { id: source.id } })
        await router.invalidate()
      },
    })
  }

  return (
    <PageShell title="情報収集" description="家づくりの情報源をジャンルごとに" fab>
      <Stack gap="lg">
        {/* 「すべて」 (All) first, the same as the candidates filter (SHIG 6) */}
        <Chip.Group
          value={g ?? ALL}
          onChange={(v) =>
            navigate({
              search: (s) => ({
                ...s,
                g: v === ALL ? undefined : (v as SourcesSearch['g']) || undefined,
              }),
              replace: true,
            })
          }
        >
          <Group gap={6}>
            <Chip value={ALL} size="xs">
              すべて
            </Chip>
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
                      onDelete={() => handleDelete(source)}
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
    </PageShell>
  )
}
