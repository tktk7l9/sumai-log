import {
  Alert,
  AspectRatio,
  Button,
  Group,
  Image,
  Loader,
  Select,
  SegmentedControl,
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

import { ATTENDEES, ATTENDEES_LABEL, type Video } from '../../db/schema'
import { extractFormError } from '../../lib/formError'
import { parseYouTubeId } from '../../lib/youtube'
import { saveVideo, type VideoInput } from '../../server/videos'

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

const empty: Values = {
  url: '',
  title: '',
  channel: null,
  thumbnailUrl: null,
  watchedOn: null,
  watchedBy: 'both',
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

  const form = useForm<Values>({
    initialValues: initial ? { ...empty, ...initial } : empty,
    validate: {
      url: (v) => {
        if (!v.trim()) return 'URL は必須です'
        return parseYouTubeId(v) ? null : 'YouTube の URL を入れてください'
      },
      title: (v) => (v.trim() ? null : '題名は必須です'),
    },
  })

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
      const { id } = await save({ data: { ...(initial ? { id: initial.id } : {}), ...values } })
      await router.invalidate()
      notifications.show({ message: initial ? '更新しました' : '保存しました' })
      onSaved(id)
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
        <TextInput
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
          valueFormat="YYYY-MM-DD"
          value={form.values.watchedOn ? new Date(`${form.values.watchedOn}T00:00:00`) : null}
          onChange={(d) =>
            form.setFieldValue('watchedOn', d ? dayjs(d).format('YYYY-MM-DD') : null)
          }
        />
        <SegmentedControl
          fullWidth
          aria-label="観た人"
          data={ATTENDEES.map((a) => ({ value: a, label: ATTENDEES_LABEL[a] }))}
          value={form.values.watchedBy}
          onChange={(v) => form.setFieldValue('watchedBy', v as Values['watchedBy'])}
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
        <Group grow>
          {onCancel ? (
            <Button type="button" variant="default" onClick={onCancel}>
              キャンセル
            </Button>
          ) : null}
          <Button type="submit" loading={saving}>
            保存
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
