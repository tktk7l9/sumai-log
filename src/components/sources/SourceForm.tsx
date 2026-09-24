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
        // sources.genre/affiliation は db/schema.ts では drizzle の enum 制約を付けていない
        // プレーンな text 列（ジャンルはデータファイル駆動のため）。SourceGenreId/
        // AffiliationId への絞り込みは zod（sources.schema.ts）が保存時に検証済みなので、
        // ここでは型を合わせるためだけの cast
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
  // 書きかけを端末に残す（Drawer を閉じても消えない）
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
      // 何ひとつ取れなかったとき（og タグが無いページ等）は「取得しました」と嘘をつかない。
      // 既に入力・保存済みの値（編集中の行の avatarUrl/handle/channelId 等）も、
      // 取れなかった項目は上書きしない＝空値で消さない（3項目とも「値があれば差し替え」に揃える）
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
      // 重複 URL（D1 の UNIQUE 制約違反、repository/sources.ts が言い換えたもの）はサーバー
      // 側の zod issue ではないため path が付かない。message で判別して url 欄に出す
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
            保存
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
