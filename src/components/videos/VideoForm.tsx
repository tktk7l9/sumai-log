import {
  Alert,
  AspectRatio,
  Button,
  Group,
  Image,
  Loader,
  Select,
  Stack,
  TagsInput,
  Textarea,
  TextInput,
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import dayjs from 'dayjs'
import { useEffect, useRef, useState } from 'react'

import type { Video } from '../../db/schema'
import { draftKey } from '../../lib/drafts'
import { extractFormError } from '../../lib/formError'
import { parseYouTubeId } from '../../lib/youtube'
import { saveVideo, type VideoInput } from '../../server/videos'
import { CONFLICT_MESSAGE, DraftNotice } from '../DraftNotice'
import { useFormDraft } from '../useFormDraft'

type Options = { tags: string[]; vendors: { id: string; name: string }[] }
type Values = Omit<VideoInput, 'id'>
type FetchState = 'idle' | 'loading' | 'ok' | 'fail'
type OEmbedResponse = {
  videoId: string
  title: string
  channel: string | null
  thumbnailUrl: string
  canonicalUrl: string
}

// watchedOn（観た日）の既定は「今日」なので、モジュール読み込み時ではなく
// コンポーネントの中で計算する（VisitForm と同じ理由: Worker は長寿命で isolate を
// またいで再利用されるため、モジュール直下で固定すると日付が古くなる）
const empty: Omit<Values, 'watchedOn'> = {
  url: '',
  title: '',
  channel: null,
  thumbnailUrl: null,
  tags: [],
  takeaways: null,
  vendorId: null,
}

export function VideoForm({
  initial,
  options,
  onSaved,
  onCancel,
}: {
  initial?: Video
  options: Options
  onSaved: (id: string) => void
  onCancel?: () => void
}) {
  const router = useRouter()
  const save = useServerFn(saveVideo)
  const [saving, setSaving] = useState(false)
  const [fetchState, setFetchState] = useState<FetchState>('idle')
  // 既存動画を開いた時点では既に題名が入っているので、oEmbed の自動入力で上書きしない
  const [titleTouched, setTitleTouched] = useState(Boolean(initial))
  const lastFetchedUrl = useRef<string | null>(initial?.url ?? null)
  // oEmbed は連打・貼り直しで複数リクエストが飛びうる。古いレスポンスが後から返って
  // 新しい入力を上書きしないよう、リクエストごとに番号を振って最新のものだけを反映する。
  // アンマウント後（Drawer を閉じた後）に届いた応答も同様に捨てる。
  const requestSeq = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  // 新規作成は「今日観た」ことがほとんどなので、観た日は今日を選んだ状態で開く
  // （所有者の要望、2026-09-21）。clearable なので要らなければ消せる
  const today = dayjs().format('YYYY-MM-DD')
  const initialValues: Values = initial
    ? {
        url: initial.url,
        title: initial.title,
        channel: initial.channel,
        thumbnailUrl: initial.thumbnailUrl,
        watchedOn: initial.watchedOn,
        watchedBy: initial.watchedBy,
        tags: initial.tags,
        takeaways: initial.takeaways,
        vendorId: initial.vendorId,
      }
    : { ...empty, watchedOn: today }
  const form = useForm<Values>({
    initialValues,
    validate: {
      url: (v) => {
        if (!v.trim()) return 'URL は必須です'
        return parseYouTubeId(v) ? null : 'YouTube の URL を入れてください'
      },
      title: (v) => (v.trim() ? null : '題名は必須です'),
    },
  })

  // 書きかけを端末に残す（Drawer を閉じても消えない）
  const draft = useFormDraft(
    form,
    draftKey('video', initial?.id, initial?.updatedAt),
    initialValues,
  )
  // 「保存して続けて追加」で押されたか（新規のときだけ出す）
  const continueRef = useRef(false)
  const urlInputRef = useRef<HTMLInputElement>(null)

  async function runOEmbed(rawUrl: string) {
    const url = rawUrl.trim()
    if (!url) return
    const videoId = parseYouTubeId(url)
    if (!videoId) {
      form.setFieldError('url', 'YouTube の URL を入れてください')
      return
    }
    form.clearFieldError('url')
    if (lastFetchedUrl.current === url) return
    // lastFetchedUrl は成功時だけ更新する（下の setFetchState('ok') の直前）。
    // ここで先に立てると、本当に oEmbed が失敗したあと同じ URL を貼り直しても
    // 「もう取得済み」扱いでリトライできなくなるため

    // 前のリクエストがまだ飛んでいれば打ち切り、この呼び出しだけを「最新」として扱う
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const seq = ++requestSeq.current

    setFetchState('loading')
    try {
      const res = await fetch(`/api/oembed?url=${encodeURIComponent(url)}`, {
        signal: controller.signal,
      })
      if (seq !== requestSeq.current || !mountedRef.current) return
      if (!res.ok) {
        setFetchState('fail')
        return
      }
      const data = (await res.json()) as OEmbedResponse
      if (seq !== requestSeq.current || !mountedRef.current) return
      lastFetchedUrl.current = data.canonicalUrl
      setFetchState('ok')
      form.setValues({
        url: data.canonicalUrl,
        channel: data.channel,
        thumbnailUrl: data.thumbnailUrl,
        ...(titleTouched ? {} : { title: data.title }),
      })
      notifications.show({ message: '取得しました' })
    } catch {
      if (seq !== requestSeq.current || !mountedRef.current) return
      setFetchState('fail')
    }
  }

  async function submit(values: Values) {
    setSaving(true)
    try {
      const res = await save({
        data: {
          ...(initial ? { id: initial.id, expectedUpdatedAt: initial.updatedAt } : {}),
          ...values,
        },
      })
      if (res.conflict) {
        notifications.show({ message: CONFLICT_MESSAGE, color: 'orange', autoClose: 12_000 })
        // 相手の内容を画面に反映する（次の保存は最新の更新日時を基準にする）
        await router.invalidate()
        return
      }
      await router.invalidate()
      if (!initial && continueRef.current) {
        // 続けて入れる: 観た日・観た人・業者・タグは残し、URL から入れ直せるようにする
        const next: Values = {
          ...empty,
          watchedOn: values.watchedOn,
          watchedBy: values.watchedBy,
          vendorId: values.vendorId,
          tags: values.tags,
        }
        // 保存前に始まった題名の自動取得が遅れて返り、空にした欄を埋め戻さないよう打ち切る
        abortRef.current?.abort()
        requestSeq.current += 1
        draft.restart(next)
        form.setValues(next)
        form.resetDirty(next)
        setTitleTouched(false)
        lastFetchedUrl.current = null
        setFetchState('idle')
        notifications.show({ message: `保存しました：${values.title}` })
        urlInputRef.current?.focus()
        return
      }
      draft.clear()
      notifications.show({ message: initial ? '更新しました' : '保存しました' })
      onSaved(res.id)
    } catch (error) {
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
        {draft.restored ? <DraftNotice onDiscard={draft.discard} /> : null}
        <TextInput
          ref={urlInputRef}
          label="URL"
          required
          placeholder="https://www.youtube.com/watch?v=..."
          value={form.values.url}
          error={form.errors.url}
          rightSection={fetchState === 'loading' ? <Loader size="xs" /> : null}
          onChange={(e) => form.setFieldValue('url', e.currentTarget.value)}
          onBlur={(e) => void runOEmbed(e.currentTarget.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text')
            if (text) void runOEmbed(text)
          }}
        />
        {fetchState === 'fail' ? (
          <Alert color="yellow" variant="light">
            自動取得できませんでした。題名を入力してください
          </Alert>
        ) : null}
        {form.values.thumbnailUrl ? (
          <AspectRatio ratio={16 / 9} maw={240}>
            <Image src={form.values.thumbnailUrl} alt="" radius="sm" />
          </AspectRatio>
        ) : null}
        <TextInput
          label="題名"
          required
          value={form.values.title}
          error={form.errors.title}
          onChange={(e) => {
            setTitleTouched(true)
            form.setFieldValue('title', e.currentTarget.value)
          }}
        />
        <TextInput
          label="チャンネル"
          value={form.values.channel ?? ''}
          onChange={(e) => form.setFieldValue('channel', e.currentTarget.value || null)}
        />
        <DateInput
          label="観た日"
          clearable
          valueFormat="YYYY/MM/DD"
          value={form.values.watchedOn ? new Date(`${form.values.watchedOn}T00:00:00`) : null}
          onChange={(d) =>
            form.setFieldValue('watchedOn', d ? dayjs(d).format('YYYY-MM-DD') : null)
          }
        />
        <TagsInput
          label="タグ"
          data={options.tags}
          value={form.values.tags}
          onChange={(tags) => form.setFieldValue('tags', tags)}
          maxTags={10}
          maxLength={30}
          error={form.errors.tags}
        />
        <Select
          label="業者"
          clearable
          searchable
          data={options.vendors.map((v) => ({ value: v.id, label: v.name }))}
          value={form.values.vendorId}
          onChange={(v) => form.setFieldValue('vendorId', v)}
        />
        <Textarea
          label="学び"
          autosize
          minRows={3}
          value={form.values.takeaways ?? ''}
          onChange={(e) => form.setFieldValue('takeaways', e.currentTarget.value || null)}
        />
        {/* 新規は「続けて追加」と「保存」の 2 つ（キャンセルは右上の × で閉じれば下書きが残る）。
            3 つ並べるとスマホ幅で文字が見切れた（所有者の報告、2026-09-24） */}
        <Group grow className="form-actions" gap="sm" wrap="nowrap">
          {initial && onCancel ? (
            <Button type="button" variant="default" onClick={onCancel}>
              キャンセル
            </Button>
          ) : null}
          {!initial ? (
            <Button
              type="submit"
              variant="default"
              loading={saving}
              aria-label="保存して続けて追加"
              title="保存して、続けて次の動画を追加する"
              onClick={() => {
                continueRef.current = true
              }}
            >
              続けて追加
            </Button>
          ) : null}
          <Button
            type="submit"
            loading={saving}
            onClick={() => {
              continueRef.current = false
            }}
          >
            保存
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
