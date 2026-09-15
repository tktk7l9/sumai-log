import {
  Button,
  Checkbox,
  Group,
  NumberInput,
  Select,
  Stack,
  TagsInput,
  TextInput,
  Textarea,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { VENDOR_KINDS, VENDOR_KIND_LABEL, type Vendor } from '../../db/schema'
import { CANDIDATE_STATUSES, STATUS_LABEL } from '../../lib/status'
import { saveVendor, type VendorInput } from '../../server/candidates'

/** socialUrls だけは Textarea 1 個で編集するので、フォーム上は改行区切りの文字列として持つ */
type Values = Omit<VendorInput, 'id' | 'socialUrls'> & { socialUrls: string }

const empty: Values = {
  name: '',
  kind: 'koumuten',
  hq: null,
  serviceAreas: [],
  uaValue: null,
  cValuePublished: false,
  seismicGrade: null,
  longTermCertified: false,
  pricePerTsuboMin: null,
  pricePerTsuboMax: null,
  structure: null,
  features: null,
  status: 'interested',
  sourceUrl: null,
  websiteUrl: null,
  socialUrls: '',
}

export function VendorForm({
  vendor,
  homeAreas,
  onSaved,
}: {
  vendor: Vendor | null
  homeAreas: string[]
  onSaved: (id: string) => void
}) {
  const router = useRouter()
  const save = useServerFn(saveVendor)
  const [saving, setSaving] = useState(false)
  const form = useForm<Values>({
    initialValues: vendor
      ? { ...empty, ...vendor, socialUrls: vendor.socialUrls.join('\n') }
      : empty,
    validate: { name: (v) => (v.trim() ? null : '名前は必須です') },
  })

  async function submit(values: Values) {
    setSaving(true)
    try {
      const { id } = await save({
        data: {
          ...(vendor ? { id: vendor.id } : {}),
          ...values,
          socialUrls: values.socialUrls.split('\n'),
        },
      })
      await router.invalidate()
      notifications.show({ message: vendor ? '業者を更新しました' : '業者を追加しました' })
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
          label="種別"
          data={VENDOR_KINDS.map((k) => ({ value: k, label: VENDOR_KIND_LABEL[k] }))}
          {...form.getInputProps('kind')}
        />
        <Select
          label="状態"
          data={CANDIDATE_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          {...form.getInputProps('status')}
        />
        <TagsInput
          label="施工エリア"
          description={
            homeAreas.length
              ? `建築予定地: ${homeAreas.join('、')}`
              : '設定で建築予定地を登録すると照合できます'
          }
          placeholder="市区町村名を入力して Enter"
          splitChars={[',', '、']}
          {...form.getInputProps('serviceAreas')}
        />
        <TextInput label="本社" {...form.getInputProps('hq')} value={form.values.hq ?? ''} />
        <Group grow>
          <NumberInput
            label="UA値"
            decimalScale={2}
            step={0.01}
            min={0}
            max={5}
            {...form.getInputProps('uaValue')}
          />
          <NumberInput label="耐震等級" min={1} max={3} {...form.getInputProps('seismicGrade')} />
        </Group>
        <Group>
          <Checkbox
            label="C値の実測を公開"
            {...form.getInputProps('cValuePublished', { type: 'checkbox' })}
          />
          <Checkbox
            label="長期優良住宅に対応"
            {...form.getInputProps('longTermCertified', { type: 'checkbox' })}
          />
        </Group>
        <Group grow>
          <NumberInput
            label="坪単価 下限（万円）"
            min={0}
            {...form.getInputProps('pricePerTsuboMin')}
          />
          <NumberInput
            label="坪単価 上限（万円）"
            min={0}
            {...form.getInputProps('pricePerTsuboMax')}
          />
        </Group>
        <TextInput
          label="構造"
          {...form.getInputProps('structure')}
          value={form.values.structure ?? ''}
        />
        <Textarea
          label="特徴・メモ"
          autosize
          minRows={3}
          {...form.getInputProps('features')}
          value={form.values.features ?? ''}
        />
        <TextInput
          label="公式サイト"
          type="url"
          {...form.getInputProps('websiteUrl')}
          value={form.values.websiteUrl ?? ''}
        />
        <TextInput
          label="参照 URL"
          type="url"
          {...form.getInputProps('sourceUrl')}
          value={form.values.sourceUrl ?? ''}
        />
        <Textarea
          label="SNS の URL（1 行に 1 つ）"
          description="Instagram / X / YouTube / Facebook / TikTok / LINE / Threads / note のプロフィール URL を 1 行に 1 つ"
          autosize
          minRows={2}
          {...form.getInputProps('socialUrls')}
        />
        <Button type="submit" loading={saving} fullWidth>
          保存
        </Button>
      </Stack>
    </form>
  )
}
