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

// The default of watchedOn (the day watched) is "today", so it is calculated inside the
// component, not at module load (same reason as VisitForm: a Worker is long-lived and
// reused across isolates, so fixing it at module top level makes the date stale)
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
  defaults,
  options,
  onSaved,
  onCancel,
}: {
  initial?: Video
  /** What a new memo starts with (「メモを書く」 on the videos tab passes the video's URL,
   * title, channel, thumbnail and vendor). Ignored when `initial` is given */
  defaults?: Partial<Omit<Values, 'watchedOn' | 'watchedBy'>>
  options: Options
  onSaved: (id: string) => void
  onCancel?: () => void
}) {
  const router = useRouter()
  const save = useServerFn(saveVideo)
  const [saving, setSaving] = useState(false)
  const [fetchState, setFetchState] = useState<FetchState>('idle')
  // When an existing video is opened the title is already filled, so the oEmbed auto-fill
  // does not overwrite it. A title that came with `defaults` is not "touched": pasting another
  // video's URL over it replaces the title with that video's
  const [titleTouched, setTitleTouched] = useState(Boolean(initial))
  // No fetch for a URL whose title is already known (an existing memo, or a memo started from a
  // channel video). A URL alone (a video that is not a channel video) still fetches on blur
  const lastFetchedUrl = useRef<string | null>(
    initial?.url ?? (defaults?.title ? defaults.url : null) ?? null,
  )
  // oEmbed can send several requests on repeated presses or re-pasting. So that an old
  // response returning later does not overwrite newer input, each request gets a number
  // and only the latest one is applied.
  // Responses that arrive after unmount (after the Drawer is closed) are dropped the same way.
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

  // A new entry is almost always "watched today", so it opens with today selected as the
  // day watched (owner's request, 2026-09-21). It is clearable, so it can be removed
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
    : { ...empty, ...defaults, watchedOn: today }
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

  // Keep the unfinished input on the device (it survives closing the Drawer). A memo
  // started from a channel video keeps its own draft, keyed by that video
  const draft = useFormDraft(
    form,
    draftKey('video', initial?.id, initial?.updatedAt ?? defaults?.url),
    initialValues,
  )
  // Whether it was pressed via "保存して続けて追加" (Save and add another) (shown only
  // for a new entry)
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
    // lastFetchedUrl is updated only on success (right before setFetchState('ok') below).
    // If it were set here first, then after oEmbed really failed, re-pasting the same URL
    // would be treated as "already fetched" and could not be retried

    // If the previous request is still in flight, abort it and treat only this call as
    // "the latest"
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
        // Reflect the other person's content on the screen (the next save is based on the
        // latest update time)
        await router.invalidate()
        return
      }
      await router.invalidate()
      if (!initial && continueRef.current) {
        // Continue entering: keep the day watched, who watched, the vendor and the tags,
        // and allow entering again from the URL
        const next: Values = {
          ...empty,
          watchedOn: values.watchedOn,
          watchedBy: values.watchedBy,
          vendorId: values.vendorId,
          tags: values.tags,
        }
        // Abort, so that a title auto-fetch that started before the save does not return
        // late and refill the field that was emptied
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
        {/* A new entry has 2 buttons, "続けて追加" (Add another) and "保存" (Save) (to
            cancel, closing with the × at the top right keeps the draft).
            With 3 in a row the text was cut off at phone width (owner's report, 2026-09-24) */}
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
            動画メモを保存
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
