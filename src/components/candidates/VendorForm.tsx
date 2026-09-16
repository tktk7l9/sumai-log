import {
  Button,
  Checkbox,
  Group,
  MultiSelect,
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

import { AFFILIATIONS, type AffiliationId } from '../../content/affiliations'
import { NEWS_SOURCES, VENDOR_KINDS, VENDOR_KIND_LABEL, type Vendor } from '../../db/schema'
import { CANDIDATE_STATUSES, STATUS_LABEL } from '../../lib/status'
import { saveVendor, type VendorInput } from '../../server/candidates'

/**
 * socialUrls だけは Textarea 1 個で編集するので、フォーム上は改行区切りの文字列として持つ。
 * affiliations は MultiSelect が素の string[] で onChange を返すので、フォーム上は緩めた型にし、
 * 送信時に AffiliationId[] へ戻す（実際の選択肢は AFFILIATIONS の id に限られる）。
 */
type Values = Omit<VendorInput, 'id' | 'socialUrls' | 'affiliations'> & {
  socialUrls: string
  affiliations: string[]
}

const empty: Values = {
  name: '',
  kind: 'koumuten',
  hq: null,
  representative: null,
  serviceAreas: [],
  affiliations: [],
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
  newsUrl: null,
  newsSource: null,
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
          affiliations: values.affiliations as AffiliationId[],
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
        <MultiSelect
          label="加盟団体"
          data={AFFILIATIONS.map((a) => ({ value: a.id, label: `${a.name}（${a.shortName}）` }))}
          searchable={false}
          clearable
          {...form.getInputProps('affiliations')}
        />
        <TextInput label="本社" {...form.getInputProps('hq')} value={form.values.hq ?? ''} />
        <TextInput
          label="代表者名"
          description="工務店の場合に一覧へ出ます"
          {...form.getInputProps('representative')}
          value={form.values.representative ?? ''}
        />
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
        <TextInput
          label="お知らせの URL"
          description="毎朝自動で取得します。https:// のみ入力できます（未設定なら取得しません）"
          type="url"
          placeholder="https://example.com/feed/"
          {...form.getInputProps('newsUrl')}
          value={form.values.newsUrl ?? ''}
        />
        <Select
          label="取得方法"
          description="お知らせの URL を設定したときに選びます"
          data={NEWS_SOURCES.map((source) => ({
            value: source,
            label:
              source === 'rss'
                ? 'RSS/Atom フィード'
                : 'トップページの一覧（樹々匠のような RSS 無しの会社）',
          }))}
          clearable
          {...form.getInputProps('newsSource')}
          value={form.values.newsSource ?? null}
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
