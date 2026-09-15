import { Button, SegmentedControl, Select, Stack, Textarea } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import dayjs from 'dayjs'
import { useState } from 'react'

import { ATTENDEES, ATTENDEES_LABEL, type Event, type Visit } from '../../db/schema'
import { dateKey } from '../../lib/calendar'
import { saveVisit, type VisitInput } from '../../server/visits'
import type { PlaceWithLinks } from '../../server/repository'

type Targets = {
  vendors: { id: string; name: string }[]
  properties: { id: string; name: string }[]
}
type Options = { targets: Targets; places: PlaceWithLinks[]; events: Event[] }
type Values = Omit<VisitInput, 'id'>

const empty: Values = {
  eventId: null,
  placeId: null,
  vendorId: null,
  propertyId: null,
  visitedOn: dayjs().format('YYYY-MM-DD'),
  attendees: 'both',
  good: null,
  concerns: null,
  qa: null,
  nextActions: null,
}

export function VisitForm({
  visit,
  options,
  defaults,
  onSaved,
}: {
  visit: Visit | null
  options: Options
  defaults?: {
    eventId?: string
    placeId?: string | null
    vendorId?: string | null
    propertyId?: string | null
    visitedOn?: string
  }
  onSaved: (id: string) => void
}) {
  const router = useRouter()
  const save = useServerFn(saveVisit)
  const [saving, setSaving] = useState(false)
  const form = useForm<Values>({
    initialValues: visit
      ? { ...empty, ...visit }
      : {
          ...empty,
          eventId: defaults?.eventId ?? null,
          placeId: defaults?.placeId ?? null,
          vendorId: defaults?.vendorId ?? null,
          propertyId: defaults?.propertyId ?? null,
          visitedOn: defaults?.visitedOn ?? empty.visitedOn,
        },
    validate: {
      visitedOn: (v) => (v ? null : '日付は必須です'),
    },
  })

  // 予定を選んだら、その予定の日付・場所・業者・物件を合わせる（手で変えてもよい）
  function onEventChange(eventId: string | null) {
    const e = eventId ? options.events.find((x) => x.id === eventId) : undefined
    form.setValues({
      eventId,
      ...(e
        ? {
            placeId: e.placeId,
            vendorId: e.vendorId,
            propertyId: e.propertyId,
            visitedOn: dateKey(e.startsAt),
          }
        : {}),
    })
  }

  async function submit(values: Values) {
    setSaving(true)
    try {
      const normalized = {
        ...values,
        good: values.good || null,
        concerns: values.concerns || null,
        qa: values.qa || null,
        nextActions: values.nextActions || null,
      }
      const { id } = await save({ data: { ...(visit ? { id: visit.id } : {}), ...normalized } })
      await router.invalidate()
      notifications.show({ message: visit ? '記録を更新しました' : '記録を保存しました' })
      onSaved(id)
    } catch {
      notifications.show({ message: '保存できませんでした', color: 'red' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={form.onSubmit(submit)}>
      <Stack gap="md">
        <DateInput
          label="日付"
          required
          valueFormat="YYYY-MM-DD"
          value={form.values.visitedOn ? new Date(`${form.values.visitedOn}T00:00:00`) : null}
          onChange={(d) => form.setFieldValue('visitedOn', d ? dayjs(d).format('YYYY-MM-DD') : '')}
          error={form.errors.visitedOn}
        />
        <SegmentedControl
          fullWidth
          data={ATTENDEES.map((a) => ({ value: a, label: ATTENDEES_LABEL[a] }))}
          {...form.getInputProps('attendees')}
        />
        <Select
          label="予定"
          clearable
          searchable
          placeholder="関連する予定を選ぶと日付・場所を補完します"
          data={options.events.map((e) => ({
            value: e.id,
            label: `${dateKey(e.startsAt)} ${e.title}`,
          }))}
          value={form.values.eventId}
          onChange={onEventChange}
        />
        <Select
          label="場所"
          clearable
          searchable
          data={options.places.map((p) => ({ value: p.id, label: p.name }))}
          {...form.getInputProps('placeId')}
        />
        <Select
          label="業者"
          clearable
          searchable
          data={options.targets.vendors.map((v) => ({ value: v.id, label: v.name }))}
          {...form.getInputProps('vendorId')}
        />
        <Select
          label="マンション物件"
          clearable
          searchable
          data={options.targets.properties.map((p) => ({ value: p.id, label: p.name }))}
          {...form.getInputProps('propertyId')}
        />
        <Textarea
          label="良かった点"
          autosize
          minRows={3}
          {...form.getInputProps('good')}
          value={form.values.good ?? ''}
        />
        <Textarea
          label="気になった点"
          autosize
          minRows={3}
          {...form.getInputProps('concerns')}
          value={form.values.concerns ?? ''}
        />
        <Textarea
          label="聞いたことと答え"
          autosize
          minRows={3}
          {...form.getInputProps('qa')}
          value={form.values.qa ?? ''}
        />
        <Textarea
          label="次にやること"
          autosize
          minRows={3}
          {...form.getInputProps('nextActions')}
          value={form.values.nextActions ?? ''}
        />
        <Button type="submit" loading={saving} fullWidth>
          保存
        </Button>
      </Stack>
    </form>
  )
}
