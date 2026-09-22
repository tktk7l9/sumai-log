import { ActionIcon, Button, Group, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import dayjs from 'dayjs'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { extractFormError } from '../../lib/formError'
import {
  RESEARCH_FACT_KEYS,
  RESEARCH_FACT_LABEL,
  emptyResearch,
  type VendorResearch,
} from '../../lib/research'
import { saveVendorResearch } from '../../server/research'

/**
 * 調査メモの編集フォーム。日付・一言・事実（キーごとの短文）・節（見出し＋本文）・出典。
 * 節と出典は行の追加/削除ができる。保存は saveVendorResearch（research 列だけを差し替え、
 * 業者フォームの他の項目には触らない）。
 */
export function ResearchForm({
  vendorId,
  research,
  onSaved,
}: {
  vendorId: string
  research: VendorResearch | null
  onSaved: () => void
}) {
  const router = useRouter()
  const save = useServerFn(saveVendorResearch)
  const [saving, setSaving] = useState(false)
  // 新規作成時の調査日は「今日」。VisitForm と同じ理由でコンポーネント内で計算する
  const today = dayjs().format('YYYY-MM-DD')
  const form = useForm<VendorResearch>({
    initialValues: research ?? emptyResearch(today),
    validate: {
      researchedOn: (v) => (v ? null : '調査日は必須です'),
      sections: {
        title: (v) => (v.trim() ? null : '見出しは必須です'),
        body: (v) => (v.trim() ? null : '本文は必須です'),
      },
      sources: {
        label: (v) => (v.trim() ? null : '出典名は必須です'),
        url: (v) => (/^https:\/\//.test(v.trim()) ? null : 'URL は https:// で始めてください'),
      },
    },
  })

  async function submit(values: VendorResearch) {
    setSaving(true)
    try {
      await save({ data: { id: vendorId, research: values } })
      await router.invalidate()
      notifications.show({ message: '調査メモを保存しました' })
      onSaved()
    } catch (error) {
      const { message, path } = extractFormError(error)
      notifications.show({ message, color: 'red' })
      if (path) form.setFieldError(path, message)
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!window.confirm('調査メモを削除します。業者の他の情報は残ります。')) return
    setSaving(true)
    try {
      await save({ data: { id: vendorId, research: null } })
      await router.invalidate()
      notifications.show({ message: '調査メモを削除しました' })
      onSaved()
    } catch {
      notifications.show({ message: '削除できませんでした', color: 'red' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={form.onSubmit(submit)}>
      <Stack gap="md">
        <DateInput
          label="調査日"
          required
          valueFormat="YYYY/MM/DD"
          value={form.values.researchedOn ? new Date(`${form.values.researchedOn}T00:00:00`) : null}
          onChange={(d) =>
            form.setFieldValue('researchedOn', d ? dayjs(d).format('YYYY-MM-DD') : '')
          }
          error={form.errors.researchedOn}
        />
        <Textarea
          label="一言で"
          description="比較表の見出しの下にも出ます"
          autosize
          minRows={2}
          maxLength={300}
          {...form.getInputProps('summary')}
        />

        <Stack gap="xs">
          <Text fw={600}>比較表に出す事実</Text>
          <Text size="xs" c="dimmed">
            短く。空欄の項目は表に出ません。
          </Text>
          {RESEARCH_FACT_KEYS.map((key) => (
            <Textarea
              key={key}
              label={RESEARCH_FACT_LABEL[key]}
              autosize
              minRows={1}
              maxLength={1000}
              value={form.values.facts[key] ?? ''}
              onChange={(e) =>
                form.setFieldValue('facts', { ...form.values.facts, [key]: e.currentTarget.value })
              }
            />
          ))}
        </Stack>

        <Stack gap="xs">
          <Group justify="space-between" align="center">
            <Text fw={600}>読み物</Text>
            <Button
              variant="default"
              size="xs"
              leftSection={<Plus size={14} aria-hidden />}
              onClick={() => form.insertListItem('sections', { title: '', body: '' })}
            >
              節を追加
            </Button>
          </Group>
          {form.values.sections.map((_, i) => (
            <Stack
              key={i}
              gap="xs"
              pl="md"
              style={{ borderLeft: '2px solid var(--mantine-color-default-border)' }}
            >
              <Group gap="xs" wrap="nowrap" align="flex-end">
                <TextInput
                  label="見出し"
                  maxLength={60}
                  style={{ flex: 1 }}
                  {...form.getInputProps(`sections.${i}.title`)}
                />
                <ActionIcon
                  variant="default"
                  color="red"
                  aria-label="この節を削除"
                  onClick={() => form.removeListItem('sections', i)}
                >
                  <Trash2 size={16} />
                </ActionIcon>
              </Group>
              <Textarea
                label="本文"
                autosize
                minRows={3}
                maxLength={6000}
                {...form.getInputProps(`sections.${i}.body`)}
              />
            </Stack>
          ))}
        </Stack>

        <Stack gap="xs">
          <Group justify="space-between" align="center">
            <Text fw={600}>出典</Text>
            <Button
              variant="default"
              size="xs"
              leftSection={<Plus size={14} aria-hidden />}
              onClick={() => form.insertListItem('sources', { label: '', url: '' })}
            >
              出典を追加
            </Button>
          </Group>
          {form.values.sources.map((_, i) => (
            <Group key={i} gap="xs" wrap="nowrap" align="flex-end">
              <TextInput
                label="出典名"
                maxLength={120}
                style={{ flex: 1 }}
                {...form.getInputProps(`sources.${i}.label`)}
              />
              <TextInput
                label="URL"
                type="url"
                placeholder="https://"
                style={{ flex: 2 }}
                {...form.getInputProps(`sources.${i}.url`)}
              />
              <ActionIcon
                variant="default"
                color="red"
                aria-label="この出典を削除"
                onClick={() => form.removeListItem('sources', i)}
              >
                <Trash2 size={16} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>

        <Button type="submit" loading={saving} fullWidth>
          保存
        </Button>
        {research ? (
          <Button color="red" variant="light" fullWidth onClick={remove} loading={saving}>
            調査メモを削除
          </Button>
        ) : null}
      </Stack>
    </form>
  )
}
