import { Button, Checkbox, Group, Select, Stack, TextInput, Textarea } from '@mantine/core'
import { DateInput, TimeInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import dayjs from 'dayjs'
import { useState } from 'react'

import { EVENT_KINDS, EVENT_KIND_LABEL } from '../../db/schema'
import { splitStartsAt } from '../../lib/calendar'
import { saveEvent, type EventInput } from '../../server/events'
import type { EventWithLinks, PlaceWithLinks } from '../../server/repository'

type Targets = {
  vendors: { id: string; name: string }[]
  properties: { id: string; name: string }[]
}
type Values = Omit<EventInput, 'id'>

export function EventForm({
  event,
  defaults,
  targets,
  places,
  onSaved,
}: {
  event: EventWithLinks | null
  defaults?: Partial<Pick<Values, 'date' | 'placeId' | 'vendorId' | 'propertyId'>>
  targets: Targets
  places: PlaceWithLinks[]
  onSaved: (id: string) => void
}) {
  const router = useRouter()
  const save = useServerFn(saveEvent)
  const [saving, setSaving] = useState(false)
  const initial: Values = event
    ? {
        title: event.title,
        kind: event.kind,
        date: splitStartsAt(event.startsAt).date,
        allDay: event.allDay,
        startTime: splitStartsAt(event.startsAt).time,
        endTime: event.endsAt ? splitStartsAt(event.endsAt).time : null,
        placeId: event.placeId,
        vendorId: event.vendorId,
        propertyId: event.propertyId,
        note: event.note,
      }
    : {
        title: '',
        kind: 'visit',
        date: defaults?.date ?? dayjs().format('YYYY-MM-DD'),
        allDay: false,
        startTime: '10:00',
        endTime: null,
        placeId: defaults?.placeId ?? null,
        vendorId: defaults?.vendorId ?? null,
        propertyId: defaults?.propertyId ?? null,
        note: null,
      }
  const form = useForm<Values>({
    initialValues: initial,
    validate: {
      title: (v) => (v.trim() ? null : 'タイトルは必須です'),
      startTime: (v, values) => (!values.allDay && !v ? '開始時刻を入れてください' : null),
    },
  })

  async function submit(values: Values) {
    setSaving(true)
    try {
      const normalized = {
        ...values,
        startTime: values.startTime || null,
        endTime: values.endTime || null,
        note: values.note || null,
      }
      const { id } = await save({ data: { ...(event ? { id: event.id } : {}), ...normalized } })
      await router.invalidate()
      notifications.show({ message: event ? '予定を更新しました' : '予定を追加しました' })
      onSaved(id)
    } catch {
      notifications.show({ message: '保存できませんでした', color: 'red' })
    } finally {
      setSaving(false)
    }
  }

  // 場所を選んだら、その場所の業者/物件を自動で合わせる（手で変えてもよい）
  function onPlaceChange(placeId: string | null) {
    form.setFieldValue('placeId', placeId)
    const p = places.find((x) => x.id === placeId)
    if (p) {
      form.setFieldValue('vendorId', p.vendorId)
      form.setFieldValue('propertyId', p.propertyId)
    }
  }

  return (
    <form onSubmit={form.onSubmit(submit)}>
      <Stack gap="md">
        <TextInput label="タイトル" required {...form.getInputProps('title')} />
        <Select
          label="種別"
          data={EVENT_KINDS.map((k) => ({ value: k, label: EVENT_KIND_LABEL[k] }))}
          {...form.getInputProps('kind')}
        />
        <DateInput
          label="日付"
          required
          valueFormat="YYYY-MM-DD"
          value={form.values.date ? new Date(`${form.values.date}T00:00:00`) : null}
          onChange={(d) => form.setFieldValue('date', d ? dayjs(d).format('YYYY-MM-DD') : '')}
        />
        <Checkbox label="終日" {...form.getInputProps('allDay', { type: 'checkbox' })} />
        {!form.values.allDay ? (
          <Group grow>
            <TimeInput
              label="開始"
              {...form.getInputProps('startTime')}
              value={form.values.startTime ?? ''}
            />
            <TimeInput
              label="終了"
              {...form.getInputProps('endTime')}
              value={form.values.endTime ?? ''}
              onChange={(e) => form.setFieldValue('endTime', e.currentTarget.value || null)}
            />
          </Group>
        ) : null}
        <Select
          label="場所"
          clearable
          searchable
          data={places.map((p) => ({ value: p.id, label: p.name }))}
          value={form.values.placeId}
          onChange={onPlaceChange}
        />
        <Select
          label="業者"
          clearable
          searchable
          data={targets.vendors.map((v) => ({ value: v.id, label: v.name }))}
          {...form.getInputProps('vendorId')}
        />
        <Select
          label="マンション物件"
          clearable
          searchable
          data={targets.properties.map((p) => ({ value: p.id, label: p.name }))}
          {...form.getInputProps('propertyId')}
        />
        <Textarea
          label="メモ"
          autosize
          minRows={2}
          {...form.getInputProps('note')}
          value={form.values.note ?? ''}
        />
        <Button type="submit" loading={saving} fullWidth>
          保存
        </Button>
      </Stack>
    </form>
  )
}
