import { Button, Select, Stack, Textarea } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import dayjs from 'dayjs'
import { useState } from 'react'

import type { Event, Visit } from '../../db/schema'
import { dateKey, formatDateWithWeekday } from '../../lib/calendar'
import { draftKey } from '../../lib/drafts'
import { CONFLICT_MESSAGE, DraftNotice } from '../DraftNotice'
import { useFormDraft } from '../useFormDraft'
import { saveVisit, type VisitInput } from '../../server/visits'
import type { PlaceWithLinks } from '../../server/repository'

type Targets = {
  vendors: { id: string; name: string }[]
  properties: { id: string; name: string }[]
}
type Options = { targets: Targets; places: PlaceWithLinks[]; events: Event[] }
type Values = Omit<VisitInput, 'id'>

// The default of visitedOn is "today", so it is calculated inside the component, not at
// module load (a Worker is long-lived and reused across isolates, so fixing it at module
// top level makes it stale)
const empty: Omit<Values, 'visitedOn'> = {
  eventId: null,
  placeId: null,
  vendorId: null,
  propertyId: null,
  good: null,
  concerns: null,
  qa: null,
  nextActions: null,
}

/** Takes only the form values out of a saved row (no id, author or timestamps) */
function pickValues(visit: Visit): Values {
  return {
    eventId: visit.eventId,
    placeId: visit.placeId,
    vendorId: visit.vendorId,
    propertyId: visit.propertyId,
    visitedOn: visit.visitedOn,
    attendees: visit.attendees,
    good: visit.good,
    concerns: visit.concerns,
    qa: visit.qa,
    nextActions: visit.nextActions,
  }
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
  const today = dayjs().format('YYYY-MM-DD')
  const initialValues: Values = visit
    ? pickValues(visit)
    : {
        ...empty,
        eventId: defaults?.eventId ?? null,
        placeId: defaults?.placeId ?? null,
        vendorId: defaults?.vendorId ?? null,
        propertyId: defaults?.propertyId ?? null,
        visitedOn: defaults?.visitedOn ?? today,
      }
  const form = useForm<Values>({
    initialValues,
    validate: {
      visitedOn: (v) => (v ? null : '日付は必須です'),
    },
  })
  // Keep the unfinished input on the device (a new entry is kept separately per event)
  const draft = useFormDraft(
    form,
    draftKey('visit', visit?.id, visit ? visit.updatedAt : (defaults?.eventId ?? undefined)),
    initialValues,
  )

  // When an event is chosen, match the date, place, vendor and property of that event
  // (they may still be changed by hand)
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
      const res = await save({
        data: {
          ...(visit ? { id: visit.id, expectedUpdatedAt: visit.updatedAt } : {}),
          ...normalized,
        },
      })
      if (res.conflict) {
        notifications.show({ message: CONFLICT_MESSAGE, color: 'orange', autoClose: 12_000 })
        // Reflect the other person's content on the screen (the next save is based on the
        // latest update time)
        await router.invalidate()
        return
      }
      draft.clear()
      await router.invalidate()
      notifications.show({ message: visit ? '記録を更新しました' : '記録を保存しました' })
      onSaved(res.id)
    } catch {
      notifications.show({ message: '保存できませんでした', color: 'red' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={form.onSubmit(submit)}>
      <Stack gap="md">
        {draft.restored ? <DraftNotice onDiscard={draft.discard} /> : null}
        <DateInput
          label="日付"
          required
          valueFormat="YYYY/MM/DD"
          value={form.values.visitedOn ? new Date(`${form.values.visitedOn}T00:00:00`) : null}
          onChange={(d) => form.setFieldValue('visitedOn', d ? dayjs(d).format('YYYY-MM-DD') : '')}
          error={form.errors.visitedOn}
        />
        {/* Do not show a field that has nothing to choose (an empty select carries no
            meaning) */}
        {options.events.length > 0 ? (
          <Select
            label="予定"
            clearable
            searchable
            placeholder="関連する予定を選ぶと日付・場所を補完します"
            data={options.events.map((e) => ({
              value: e.id,
              label: `${formatDateWithWeekday(dateKey(e.startsAt))} ${e.title}`,
            }))}
            value={form.values.eventId}
            onChange={onEventChange}
          />
        ) : null}
        {options.places.length > 0 ? (
          <Select
            label="場所"
            clearable
            searchable
            data={options.places.map((p) => ({ value: p.id, label: p.name }))}
            {...form.getInputProps('placeId')}
          />
        ) : null}
        <Select
          label="業者"
          clearable
          searchable
          data={options.targets.vendors.map((v) => ({ value: v.id, label: v.name }))}
          {...form.getInputProps('vendorId')}
        />
        {options.targets.properties.length > 0 ? (
          <Select
            label="マンション物件"
            clearable
            searchable
            data={options.targets.properties.map((p) => ({ value: p.id, label: p.name }))}
            {...form.getInputProps('propertyId')}
          />
        ) : null}
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
        <div className="form-actions">
          <Button type="submit" loading={saving} fullWidth>
            保存
          </Button>
        </div>
      </Stack>
    </form>
  )
}
