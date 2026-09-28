import {
  Avatar,
  Button,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { AFFILIATIONS, type AffiliationId } from '../../content/affiliations'
import { SOURCE_GENRES, type SourceGenreId } from '../../content/sourceGenres'
import type { Source } from '../../db/schema'
import { extractErrorMessage, extractFormError } from '../../lib/formError'
import { DUPLICATE_URL_ERROR } from '../../lib/sources'
import { resolveSource, saveSource, type SourceInput } from '../../server/sources'
import { draftKey } from '../../lib/drafts'
import { DraftNotice } from '../DraftNotice'
import { useFormDraft } from '../useFormDraft'

const RESOLVE_EMPTY_MESSAGE = 'このページからは情報を取得できませんでした。手で入力してください'

type Options = { vendors: { id: string; name: string }[] }
type Values = Omit<SourceInput, 'id'>

const empty: Values = {
  url: '',
  name: '',
  genre: SOURCE_GENRES[0].id,
  description: null,
  handle: null,
  channelId: null,
  avatarUrl: null,
  vendorId: null,
  affiliation: null,
  sortOrder: 0,
}

export function SourceForm({
  initial,
  options,
  onSaved,
  onCancel,
}: {
  initial?: Source
  options: Options
  onSaved: (id: string) => void
  onCancel?: () => void
}) {
  const router = useRouter()
  const save = useServerFn(saveSource)
  const resolve = useServerFn(resolveSource)
  const [saving, setSaving] = useState(false)
  const [resolving, setResolving] = useState(false)

  const initialValues: Values = initial
    ? {
        ...empty,
        ...initial,
        // sources.genre/affiliation are plain text columns in db/schema.ts with no drizzle
        // enum constraint (because genres are driven by a data file). Narrowing to
        // SourceGenreId/AffiliationId is already validated by zod (sources.schema.ts) on
        // save, so the cast here only makes the types match
        genre: initial.genre as SourceGenreId,
        affiliation: initial.affiliation as AffiliationId | null,
      }
    : empty
  const form = useForm<Values>({
    initialValues,
    validate: {
      url: (v) => (v.trim() ? null : 'URL は必須です'),
      name: (v) => (v.trim() ? null : '名前は必須です'),
    },
  })
  // Keep the unfinished input on the device (it survives closing the Drawer)
  const draft = useFormDraft(
    form,
    draftKey('source', initial?.id, initial?.updatedAt),
    initialValues,
  )

  async function handleResolve() {
    const url = form.values.url.trim()
    if (!url) {
      form.setFieldError('url', 'URL は必須です')
      return
    }
    setResolving(true)
    try {
      const result = await resolve({ data: { url } })
      if (!result.ok) {
        notifications.show({ message: result.error, color: 'red' })
        return
      }
      const { fields } = result
      // When nothing at all could be fetched (a page without og tags etc.), do not lie
      // with "取得しました" (Fetched).
      // Values already entered/saved (avatarUrl/handle/channelId etc. of the row being
      // edited) are also not overwritten for items that could not be fetched = not erased
      // with an empty value (all 3 items follow "replace only when there is a value")
      const allEmpty = Object.values(fields).every((v) => v === null)
      if (allEmpty) {
        notifications.show({ message: RESOLVE_EMPTY_MESSAGE, color: 'yellow' })
        return
      }
      form.setValues({
        ...(fields.name ? { name: fields.name } : {}),
        ...(fields.description ? { description: fields.description } : {}),
        ...(fields.avatarUrl ? { avatarUrl: fields.avatarUrl } : {}),
        ...(fields.handle ? { handle: fields.handle } : {}),
        ...(fields.channelId ? { channelId: fields.channelId } : {}),
      })
      notifications.show({ message: '取得しました' })
    } catch (error) {
      notifications.show({ message: extractErrorMessage(error), color: 'red' })
    } finally {
      setResolving(false)
    }
  }

  async function submit(values: Values) {
    setSaving(true)
    try {
      const { id } = await save({ data: { ...(initial ? { id: initial.id } : {}), ...values } })
      await router.invalidate()
      notifications.show({ message: initial ? '情報源を更新しました' : '情報源を追加しました' })
      draft.clear()
      onSaved(id)
    } catch (error) {
      const { message, path } = extractFormError(error)
      notifications.show({ message, color: 'red' })
      // A duplicate URL (a violation of the D1 UNIQUE constraint, rephrased by
      // repository/sources.ts) is not a server-side zod issue, so it has no path. Detect
      // it by message and show it on the url field
      if (path) form.setFieldError(path, message)
      else if (message === DUPLICATE_URL_ERROR) form.setFieldError('url', message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={form.onSubmit(submit)}>
      <Stack gap="md">
        {draft.restored ? <DraftNotice onDiscard={draft.discard} /> : null}
        <Group gap="xs" align="flex-end" wrap="nowrap">
          <TextInput
            label="URL"
            required
            placeholder="https://www.youtube.com/@channel"
            style={{ flex: 1 }}
            value={form.values.url}
            error={form.errors.url}
            onChange={(e) => form.setFieldValue('url', e.currentTarget.value)}
          />
          <Button
            variant="default"
            onClick={handleResolve}
            loading={resolving}
            leftSection={resolving ? <Loader size="xs" /> : null}
          >
            取得
          </Button>
        </Group>
        {form.values.avatarUrl || form.values.handle ? (
          <Group gap="xs" align="center">
            <Avatar src={form.values.avatarUrl} size={32} radius="xl" color="gray" alt="">
              {form.values.name.charAt(0)}
            </Avatar>
            {form.values.handle ? (
              <Text size="sm" c="dimmed">
                {form.values.handle}
              </Text>
            ) : null}
          </Group>
        ) : null}
        <TextInput label="名前" required {...form.getInputProps('name')} />
        <Select
          label="ジャンル"
          data={SOURCE_GENRES.map((g) => ({ value: g.id, label: g.label }))}
          value={form.values.genre}
          onChange={(v) => v && form.setFieldValue('genre', v as SourceGenreId)}
        />
        <Textarea
          label="説明"
          autosize
          minRows={2}
          maxLength={200}
          value={form.values.description ?? ''}
          onChange={(e) => form.setFieldValue('description', e.currentTarget.value || null)}
        />
        <Select
          label="候補の会社"
          description="候補（/candidates）に登録済みの業者と紐づけます"
          clearable
          searchable
          data={options.vendors.map((v) => ({ value: v.id, label: v.name }))}
          value={form.values.vendorId}
          onChange={(v) => form.setFieldValue('vendorId', v)}
        />
        <Select
          label="加盟団体"
          clearable
          data={AFFILIATIONS.map((a) => ({ value: a.id, label: `${a.name}（${a.shortName}）` }))}
          value={form.values.affiliation}
          onChange={(v) => form.setFieldValue('affiliation', v as AffiliationId | null)}
        />
        <NumberInput
          label="並び順"
          description="同じジャンル内での表示順（小さいほど先）"
          value={form.values.sortOrder}
          onChange={(v) => form.setFieldValue('sortOrder', typeof v === 'number' ? v : 0)}
        />
        <Group grow className="form-actions">
          {onCancel ? (
            <Button type="button" variant="default" onClick={onCancel}>
              キャンセル
            </Button>
          ) : null}
          <Button type="submit" loading={saving}>
            情報源を保存
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
