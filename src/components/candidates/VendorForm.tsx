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
import { useEffect, useState } from 'react'

import { AFFILIATIONS, type AffiliationId } from '../../content/affiliations'
import { NEWS_SOURCES, VENDOR_KINDS, VENDOR_KIND_LABEL, type Vendor } from '../../db/schema'
import { extractFormError } from '../../lib/formError'
import { isAllowedNewsUrl } from '../../lib/news/url'
import { CANDIDATE_STATUSES, STATUS_LABEL } from '../../lib/status'
import { saveVendor, type VendorInput } from '../../server/candidates'
import { FaviconField } from './FaviconField'
import { RepresentativePhotoField } from './RepresentativePhotoField'

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
  affiliationLinks: {},
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
  newsEmailDomain: null,
}

export function VendorForm({
  vendor,
  homeAreas,
  onSaved,
  onDirtyChange,
}: {
  vendor: Vendor | null
  homeAreas: string[]
  onSaved: (id: string) => void
  /** 候補ページの「追加」ドロワー（戸建て/マンションの切替）が、切替前に確認を挟むかの
   * 判定に使う。渡さなければ何もしない（既存の編集フォームは呼び出し元を増やさない） */
  onDirtyChange?: (dirty: boolean) => void
}) {
  const router = useRouter()
  const save = useServerFn(saveVendor)
  const [saving, setSaving] = useState(false)
  const form = useForm<Values>({
    initialValues: vendor
      ? { ...empty, ...vendor, socialUrls: vendor.socialUrls.join('\n') }
      : empty,
    validate: {
      name: (v) => (v.trim() ? null : '名前は必須です'),
      // サーバー側（optionalHttpsUrl）と同じ判定を先に見せる。送信してから
      // 一般的なエラー文言だけ返ってくるより、どこが・なぜ悪いかをその場で伝える。
      newsUrl: (v) => {
        if (!v) return null
        if (!/^https:\/\//.test(v)) return 'URL は https:// で始めてください'
        return isAllowedNewsUrl(v) ? null : 'URL が許可されていません'
      },
    },
  })

  // 候補ページの「追加」ドロワーが切替確認に使うだけの軽い通知。form.isDirty() は
  // 呼ぶたびに initialValues と比較するだけなので、依存は values の変化だけで十分
  useEffect(() => {
    onDirtyChange?.(form.isDirty())
  }, [form.values])

  async function submit(values: Values) {
    setSaving(true)
    try {
      // affiliationLinks は選んでいない団体の分・URL 未入力の分を送らない（zod は
      // キーがあれば url を必須にしているため、空欄のまま送ると弾かれる）
      const affiliationLinks = Object.fromEntries(
        Object.entries(values.affiliationLinks)
          .filter(([id, link]) => values.affiliations.includes(id) && link.url.trim() !== '')
          .map(([id, link]) => [
            id,
            { url: link.url.trim(), ...(link.note?.trim() ? { note: link.note.trim() } : {}) },
          ]),
      )
      const { id } = await save({
        data: {
          ...(vendor ? { id: vendor.id } : {}),
          ...values,
          socialUrls: values.socialUrls.split('\n'),
          affiliations: values.affiliations as AffiliationId[],
          affiliationLinks,
        },
      })
      await router.invalidate()
      notifications.show({ message: vendor ? '業者を更新しました' : '業者を追加しました' })
      onSaved(id)
    } catch (error) {
      // サーバー側の zod（optionalHttpsUrl 等）で拒否された場合、汎用の
      // 「保存できませんでした」ではなく実際の理由を出す（src/components/videos/VideoForm.tsx
      // と同じパターン）。対象フィールドが分かれば setFieldError でその場に出す。
      const { message, path } = extractFormError(error)
      notifications.show({ message, color: 'red' })
      if (path) form.setFieldError(path, message)
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
        {form.values.affiliations.map((affId) => {
          const affiliation = AFFILIATIONS.find((a) => a.id === affId)
          if (!affiliation) return null
          const link = form.values.affiliationLinks[affId as AffiliationId]
          // Mantine form の setFieldValue はドットパスの途中が無いと辿れない
          // （affiliationLinks に affId のキーがまだ無いと落ちる）。選んだ団体を
          // 増やした直後はキーが無い状態なので、常にオブジェクト全体を差し替える
          function setLink(patch: { url?: string; note?: string }) {
            form.setFieldValue('affiliationLinks', {
              ...form.values.affiliationLinks,
              [affId]: { url: '', note: '', ...link, ...patch },
            })
          }
          return (
            <Stack
              key={affId}
              gap="xs"
              pl="md"
              style={{ borderLeft: '2px solid var(--mantine-color-default-border)' }}
            >
              <TextInput
                label={`紹介ページの URL（${affiliation.shortName}）`}
                type="url"
                placeholder="https://example.com/partner/some-koumuten/"
                value={link?.url ?? ''}
                onChange={(e) => setLink({ url: e.currentTarget.value })}
              />
              <TextInput
                label="メモ"
                placeholder="例: 構造 ★★★・断熱 ★★★"
                maxLength={60}
                value={link?.note ?? ''}
                onChange={(e) => setLink({ note: e.currentTarget.value })}
              />
            </Stack>
          )
        })}
        <TextInput label="本社" {...form.getInputProps('hq')} value={form.values.hq ?? ''} />
        <TextInput
          label="代表者名"
          description="工務店の場合に一覧へ出ます"
          {...form.getInputProps('representative')}
          value={form.values.representative ?? ''}
        />
        <RepresentativePhotoField
          vendorId={vendor?.id ?? null}
          representativePhotoKey={vendor?.representativePhotoKey ?? null}
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
        <FaviconField vendorId={vendor?.id ?? null} faviconKey={vendor?.faviconKey ?? null} />
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
              source === 'rss' ? 'RSS/Atom フィード' : 'トップページの一覧（RSS が無い会社向け）',
          }))}
          clearable
          {...form.getInputProps('newsSource')}
          value={form.values.newsSource ?? null}
        />
        <TextInput
          label="メールの差出人ドメイン"
          description="メルマガの差出人（@ の右）。カンマ区切りで複数可。news@sumai-log.app に転送されたメールをこの業者のお知らせにします"
          placeholder="example.com, mail.example.com"
          {...form.getInputProps('newsEmailDomain')}
          value={form.values.newsEmailDomain ?? ''}
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
