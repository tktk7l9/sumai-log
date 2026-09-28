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
import { resolveEventTitle, suggestEventTitle } from '../../lib/eventTitle'
import { draftKey } from '../../lib/drafts'
import { saveEvent, type EventInput } from '../../server/events'
import type { EventWithLinks, PlaceWithLinks } from '../../server/repository'
import { CONFLICT_MESSAGE, DraftNotice } from '../DraftNotice'
import { useFormDraft } from '../useFormDraft'

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
  defaults?: Partial<
    Pick<Values, 'date' | 'placeId' | 'vendorId' | 'propertyId' | 'title' | 'note'>
  >
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
        title: defaults?.title ?? '',
        kind: 'visit',
        date: defaults?.date ?? dayjs().format('YYYY-MM-DD'),
        allDay: false,
        startTime: '10:00',
        endTime: null,
        placeId: defaults?.placeId ?? null,
        vendorId: defaults?.vendorId ?? null,
        propertyId: defaults?.propertyId ?? null,
        note: defaults?.note ?? null,
      }
  function titleSuggestion(values: Values): string {
    return suggestEventTitle({
      kindLabel: EVENT_KIND_LABEL[values.kind],
      vendorName: targets.vendors.find((v) => v.id === values.vendorId)?.name,
      propertyName: targets.properties.find((p) => p.id === values.propertyId)?.name,
      placeName: places.find((p) => p.id === values.placeId)?.name,
    })
  }

  const form = useForm<Values>({
    initialValues: initial,
    validate: {
      title: (v, values) =>
        resolveEventTitle(v, titleSuggestion(values))
          ? null
          : 'タイトルか、業者・場所を入れてください',
      startTime: (v, values) => (!values.allDay && !v ? '開始時刻を入れてください' : null),
    },
  })
  // Keep the unfinished input on the device. New entries are separated by "where it was
  // opened from" (date, vendor, place)
  const draft = useFormDraft(
    form,
    draftKey(
      'event',
      event?.id,
      event
        ? event.updatedAt
        : [defaults?.date, defaults?.vendorId, defaults?.placeId].filter(Boolean).join('|'),
    ),
    initial,
  )

  async function submit(values: Values) {
    setSaving(true)
    try {
      const normalized = {
        ...values,
        title: resolveEventTitle(values.title, titleSuggestion(values)),
        startTime: values.startTime || null,
        endTime: values.endTime || null,
        note: values.note || null,
      }
      const res = await save({
        data: {
          ...(event ? { id: event.id, expectedUpdatedAt: event.updatedAt } : {}),
          ...normalized,
        },
      })
      if (res.conflict) {
        notifications.show({ message: CONFLICT_MESSAGE, color: 'orange', autoClose: 12_000 })
        // Reflect the partner's content on screen (the next save is based on the latest updated
        // time)
        await router.invalidate()
        return
      }
      draft.clear()
      await router.invalidate()
      notifications.show({ message: event ? '予定を更新しました' : '予定を追加しました' })
      onSaved(res.id)
    } catch {
      notifications.show({ message: '保存できませんでした', color: 'red' })
    } finally {
      setSaving(false)
    }
  }

  // When a place is chosen, the vendor/property of that place is set automatically (it
  // can still be changed by hand)
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
        {draft.restored ? <DraftNotice onDiscard={draft.discard} /> : null}
        {/* What and with whom first, then when, then the title that can be derived from them
            (SHIG 40 a form with a story, 14 pre-computation) */}
        <Select
          label="種別"
          data={EVENT_KINDS.map((k) => ({ value: k, label: EVENT_KIND_LABEL[k] }))}
          {...form.getInputProps('kind')}
        />
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
        <DateInput
          label="日付"
          required
          valueFormat="YYYY/MM/DD"
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
        {/* Optional: left empty, it becomes 「<業者> 見学」 (<vendor> visit) from the choices above */}
        <TextInput
          label="タイトル"
          description="空欄なら、選んだ業者・場所と種別から付けます"
          placeholder={titleSuggestion(form.values) || '例: 打合せ'}
          {...form.getInputProps('title')}
        />
        <Textarea
          label="メモ"
          autosize
          minRows={2}
          {...form.getInputProps('note')}
          value={form.values.note ?? ''}
        />
        <div className="form-actions">
          <Button type="submit" loading={saving} fullWidth>
            予定を保存
          </Button>
        </div>
      </Stack>
    </form>
  )
}
