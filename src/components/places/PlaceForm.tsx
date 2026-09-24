import { Alert, Button, Select, Stack, Text, TextInput, Textarea } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Crosshair, Search } from 'lucide-react'
import { useState } from 'react'

import { PLACE_KINDS, PLACE_KIND_LABEL, type Place } from '../../db/schema'
import { formatLatLng, parseCoordinate } from '../../lib/coords'
import { savePlace, type PlaceInput } from '../../server/places'
import { draftKey } from '../../lib/drafts'
import { DraftNotice } from '../DraftNotice'
import { useFormDraft } from '../useFormDraft'

type Values = Omit<PlaceInput, 'id'>
type Targets = {
  vendors: { id: string; name: string }[]
  properties: { id: string; name: string }[]
}

const empty: Values = {
  name: '',
  kind: 'model_house',
  address: null,
  lat: null,
  lng: null,
  coordsText: null,
  geocodeSource: null,
  vendorId: null,
  propertyId: null,
  note: null,
}

export function PlaceForm({
  place,
  targets,
  defaults,
  onSaved,
}: {
  place: Place | null
  targets: Targets
  defaults?: Partial<Pick<Values, 'vendorId' | 'propertyId'>>
  onSaved: (id: string) => void
}) {
  const router = useRouter()
  const save = useServerFn(savePlace)
  const [saving, setSaving] = useState(false)
  const [lookup, setLookup] = useState<{
    state: 'idle' | 'busy' | 'hit' | 'miss'
    title?: string | null
  }>({ state: 'idle' })
  const initialValues: Values = place ? { ...empty, ...place } : { ...empty, ...defaults }
  const form = useForm<Values>({
    initialValues,
    validate: {
      name: (v) => (v.trim() ? null : '名前は必須です'),
      coordsText: (v) =>
        v && !parseCoordinate(v) ? '座標の形式が読めません（例: 35.123456, 139.123456）' : null,
    },
  })
  // 書きかけを端末に残す（Drawer を閉じても消えない）
  const draft = useFormDraft(
    form,
    draftKey(
      'place',
      place?.id,
      place
        ? place.updatedAt
        : [defaults?.vendorId, defaults?.propertyId].filter(Boolean).join('|'),
    ),
    initialValues,
  )

  async function geocode() {
    const address = form.values.address?.trim()
    if (!address) return
    setLookup({ state: 'busy' })
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`)
    if (res.ok) {
      const hit = (await res.json()) as { lat: number; lng: number; title: string | null }
      form.setValues({ lat: hit.lat, lng: hit.lng, geocodeSource: 'gsi', coordsText: null })
      setLookup({ state: 'hit', title: hit.title })
    } else {
      setLookup({ state: 'miss' })
    }
  }

  async function submit(values: Values) {
    setSaving(true)
    try {
      const { id } = await save({ data: { ...(place ? { id: place.id } : {}), ...values } })
      await router.invalidate()
      notifications.show({ message: place ? '場所を更新しました' : '場所を追加しました' })
      draft.clear()
      onSaved(id)
    } catch {
      notifications.show({ message: '保存できませんでした', color: 'red' })
    } finally {
      setSaving(false)
    }
  }

  const resolved = form.values.coordsText
    ? parseCoordinate(form.values.coordsText)
    : form.values.lat != null && form.values.lng != null
      ? { lat: form.values.lat, lng: form.values.lng }
      : null

  return (
    <form onSubmit={form.onSubmit(submit)}>
      <Stack gap="md">
        {draft.restored ? <DraftNotice onDiscard={draft.discard} /> : null}
        <TextInput label="名前" required {...form.getInputProps('name')} />
        <Select
          label="種別"
          data={PLACE_KINDS.map((k) => ({ value: k, label: PLACE_KIND_LABEL[k] }))}
          {...form.getInputProps('kind')}
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
        <TextInput
          label="住所"
          placeholder="都道府県から。番地まで無くても町名で引けます"
          {...form.getInputProps('address')}
          value={form.values.address ?? ''}
          onChange={(event) => {
            form.setFieldValue('address', event.currentTarget.value)
            if (form.values.geocodeSource === 'gsi') {
              form.setValues({ lat: null, lng: null, geocodeSource: null })
            }
            setLookup({ state: 'idle' })
          }}
        />
        {form.values.geocodeSource === 'gsi' && lookup.state !== 'hit' ? (
          <Text size="xs" c="dimmed">
            座標は前回の住所検索の結果です。住所を変えたら引き直してください。
          </Text>
        ) : null}
        <Button
          variant="default"
          leftSection={<Search size={16} aria-hidden />}
          loading={lookup.state === 'busy'}
          onClick={geocode}
          disabled={!form.values.address}
        >
          住所から座標を引く
        </Button>
        {lookup.state === 'hit' ? (
          <Alert color="teal" variant="light">
            この住所で引きました: {lookup.title ?? '（名称なし）'}
            。ずれていれば下に座標を貼って上書きできます。
          </Alert>
        ) : null}
        {lookup.state === 'miss' ? (
          <Alert color="orange" variant="light">
            見つかりませんでした。Google
            マップで場所を長押し→座標をコピーして、下の欄に貼ってください。
          </Alert>
        ) : null}
        <TextInput
          label="座標を手貼り（任意）"
          placeholder="35.123456, 139.123456"
          leftSection={<Crosshair size={16} aria-hidden />}
          {...form.getInputProps('coordsText')}
          value={form.values.coordsText ?? ''}
        />
        <Text size="xs" c="dimmed">
          {resolved
            ? `地図に出す位置: ${formatLatLng(resolved)}`
            : '座標が無いので地図には出ません（一覧と詳細には出ます）'}
        </Text>
        <Textarea
          label="メモ"
          autosize
          minRows={2}
          {...form.getInputProps('note')}
          value={form.values.note ?? ''}
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
