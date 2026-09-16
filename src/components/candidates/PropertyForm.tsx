import { Button, Group, NumberInput, Select, Stack, TextInput, Textarea } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'

import type { Property } from '../../db/schema'
import { CANDIDATE_STATUSES, STATUS_LABEL } from '../../lib/status'
import { saveProperty, type PropertyInput } from '../../server/candidates'

type Values = Omit<PropertyInput, 'id'>

const empty: Values = {
  name: '',
  address: null,
  station: null,
  walkMinutes: null,
  price: null,
  areaSqm: null,
  layout: null,
  builtYear: null,
  completionDate: null,
  managementFee: null,
  repairReserve: null,
  listingUrl: null,
  note: null,
  status: 'interested',
}

export function PropertyForm({
  property,
  onSaved,
  onDirtyChange,
}: {
  property: Property | null
  onSaved: (id: string) => void
  /** 候補ページの「追加」ドロワー（戸建て/マンションの切替）が、切替前に確認を挟むかの
   * 判定に使う。渡さなければ何もしない（既存の編集フォームは呼び出し元を増やさない） */
  onDirtyChange?: (dirty: boolean) => void
}) {
  const router = useRouter()
  const save = useServerFn(saveProperty)
  const [saving, setSaving] = useState(false)
  const form = useForm<Values>({
    initialValues: property ? { ...empty, ...property } : empty,
    validate: { name: (v) => (v.trim() ? null : '名前は必須です') },
  })

  useEffect(() => {
    onDirtyChange?.(form.isDirty())
  }, [form.values])

  async function submit(values: Values) {
    setSaving(true)
    try {
      const { id } = await save({ data: { ...(property ? { id: property.id } : {}), ...values } })
      await router.invalidate()
      notifications.show({ message: property ? '物件を更新しました' : '物件を追加しました' })
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
        <TextInput label="名前" required {...form.getInputProps('name')} />
        <Select
          label="状態"
          data={CANDIDATE_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          {...form.getInputProps('status')}
        />
        <TextInput
          label="所在地"
          {...form.getInputProps('address')}
          value={form.values.address ?? ''}
        />
        <Group grow>
          <TextInput
            label="駅"
            {...form.getInputProps('station')}
            value={form.values.station ?? ''}
          />
          <NumberInput label="徒歩（分）" min={0} {...form.getInputProps('walkMinutes')} />
        </Group>
        <NumberInput
          label="価格（円）"
          min={0}
          thousandSeparator=","
          suffix=" 円"
          {...form.getInputProps('price')}
        />
        <NumberInput
          label="専有面積（㎡）"
          min={0}
          decimalScale={2}
          {...form.getInputProps('areaSqm')}
        />
        <TextInput
          label="間取り"
          {...form.getInputProps('layout')}
          value={form.values.layout ?? ''}
        />
        <Group grow>
          <NumberInput label="築年" {...form.getInputProps('builtYear')} />
          <TextInput
            label="竣工予定"
            {...form.getInputProps('completionDate')}
            value={form.values.completionDate ?? ''}
          />
        </Group>
        <Group grow>
          <NumberInput
            label="管理費（円/月）"
            min={0}
            thousandSeparator=","
            suffix=" 円"
            {...form.getInputProps('managementFee')}
          />
          <NumberInput
            label="修繕積立金（円/月）"
            min={0}
            thousandSeparator=","
            suffix=" 円"
            {...form.getInputProps('repairReserve')}
          />
        </Group>
        <TextInput
          label="掲載 URL"
          type="url"
          {...form.getInputProps('listingUrl')}
          value={form.values.listingUrl ?? ''}
        />
        <Textarea
          label="メモ"
          autosize
          minRows={3}
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
