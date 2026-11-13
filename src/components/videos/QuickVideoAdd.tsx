import { Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import dayjs from 'dayjs'
import { ClipboardPaste } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import { extractFormError } from '../../lib/formError'
import { findYouTubeUrl } from '../../lib/youtube'
import { addVideoFromLink, undoAddedVideo } from '../../server/videos'

const NO_LINK_COPIED =
  'コピーした内容に YouTube のリンクがありません。YouTube の「共有」→「コピー」のあとで、もう一度押してください'

/**
 * The major task of the app in one press (SHIG 20): the link copied in YouTube becomes a video
 * memo with today as the day watched. Nothing is asked before saving; what happened is said
 * right under the button, with 「開く」 and 「取り消す」 (SHIG 57, 54, 59). It is not a
 * notification: those come up at the top of a phone screen, over this very button on the home
 * page, and the next video could not be added until they left.
 *
 * Until 2026-11-13 the same took the 記録 tab, the 動画 tab, the add button, a paste into the URL
 * field and a scroll down to the save button, and 186 memos had been written that way with
 * nothing but the link and the day.
 *
 * When the browser cannot hand over the clipboard (no permission, or no such API), a field to
 * paste into takes the button's place; pasting there saves at once too.
 */
export function QuickVideoAdd() {
  const router = useRouter()
  const navigate = useNavigate()
  const add = useServerFn(addVideoFromLink)
  const undo = useServerFn(undoAddedVideo)
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState(false)
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const fieldRef = useRef<HTMLInputElement>(null)
  // One request at a time: a second press or paste while the first is on its way would write
  // the memo twice, and a press while 「取り消す」 is on its way would race it
  const sending = useRef(false)

  useEffect(() => {
    if (manual) fieldRef.current?.focus()
  }, [manual])

  function open(id: string) {
    void navigate({ to: '/records/videos/$id', params: { id } })
  }

  async function takeBack(saved: Extract<Outcome, { kind: 'saved' }>) {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    try {
      await undo({ data: { id: saved.id, unmarkWatched: saved.markedWatched } })
      await router.invalidate()
      setOutcome({ kind: 'said', text: '取り消しました' })
    } catch {
      // The memo is still there: 「取り消す」 stays, to be pressed again
      setOutcome({ ...saved, problem: '取り消せませんでした' })
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  /** Saves the video behind `url`. Returns whether the link was dealt with (saved or known) */
  async function save(url: string): Promise<boolean> {
    if (sending.current) return false
    sending.current = true
    setBusy(true)
    try {
      const result = await add({ data: { url, watchedOn: dayjs().format('YYYY-MM-DD') } })
      if (result.status === 'untitled') {
        // A private or removed video, or YouTube not answering: the form asks for the title
        notifications.show({
          message: '題名を取得できませんでした。題名を入れて保存してください',
          color: 'orange',
        })
        setOutcome(null)
        void navigate({ to: '/records', search: { tab: 'videos', video: result.videoId } })
        return true
      }
      if (result.status === 'exists') {
        setOutcome({ kind: 'exists', id: result.id, title: result.title })
        return true
      }
      await router.invalidate()
      setOutcome({
        kind: 'saved',
        id: result.id,
        title: result.title,
        markedWatched: result.markedWatched,
      })
      return true
    } catch (error) {
      setOutcome({ kind: 'said', text: extractFormError(error).message, color: 'red' })
      return false
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  async function fromClipboard() {
    let text: string
    try {
      // Throws where the API is missing, rejects when reading is not allowed (on an iPhone:
      // when the 「ペースト」 bubble is dismissed)
      text = await navigator.clipboard.readText()
    } catch {
      setManual(true)
      return
    }
    const url = findYouTubeUrl(text)
    if (!url) {
      setOutcome({ kind: 'said', text: NO_LINK_COPIED, color: 'orange' })
      return
    }
    await save(url)
  }

  async function fromField(text: string) {
    const url = findYouTubeUrl(text)
    if (!url) {
      setLinkError('YouTube のリンクを入れてください')
      return
    }
    setLinkError(null)
    if (await save(url)) setLink('')
  }

  return (
    <Stack gap="xs">
      {manual ? (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            void fromField(link)
          }}
        >
          <Group align="flex-end" gap="sm" wrap="nowrap">
            <TextInput
              ref={fieldRef}
              style={{ flex: 1 }}
              label="YouTube のリンク"
              description="貼り付けると、すぐに保存します"
              placeholder="https://youtu.be/..."
              value={link}
              error={linkError}
              onChange={(e) => {
                setLink(e.currentTarget.value)
                setLinkError(null)
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text')
                if (!findYouTubeUrl(text)) return
                // The pasted link is saved as it is: it does not also land in the field
                e.preventDefault()
                void fromField(text)
              }}
            />
            <Button type="submit" variant="light" loading={busy}>
              追加
            </Button>
          </Group>
        </form>
      ) : (
        <Button
          variant="light"
          fullWidth
          loading={busy}
          leftSection={<ClipboardPaste size={18} aria-hidden />}
          onClick={() => void fromClipboard()}
        >
          コピーしたリンクから動画を追加
        </Button>
      )}
      {/* Always in the page, so that a screen reader announces what changes inside it */}
      <div role="status" aria-label="動画の追加の結果">
        {outcome?.kind === 'said' ? (
          <Text size="sm" c={outcome.color ?? 'dimmed'}>
            {outcome.text}
          </Text>
        ) : outcome ? (
          <Stack gap={0}>
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <Text size="sm" lineClamp={2}>
                {outcome.kind === 'saved' ? '保存しました' : 'すでに記録してあります'}：
                {outcome.title}
              </Text>
              <Group gap={0} wrap="nowrap" style={{ flexShrink: 0 }}>
                <Button variant="subtle" size="sm" px="xs" onClick={() => open(outcome.id)}>
                  開く
                </Button>
                {outcome.kind === 'saved' ? (
                  <Button
                    variant="subtle"
                    size="sm"
                    px="xs"
                    disabled={busy}
                    onClick={() => void takeBack(outcome)}
                  >
                    取り消す
                  </Button>
                ) : null}
              </Group>
            </Group>
            {outcome.kind === 'saved' && outcome.problem ? (
              <Text size="sm" c="red">
                {outcome.problem}
              </Text>
            ) : null}
          </Stack>
        ) : null}
      </div>
    </Stack>
  )
}

/** What the last press led to, shown under the button until the next one */
type Outcome =
  | { kind: 'saved'; id: string; title: string; markedWatched: boolean; problem?: string }
  | { kind: 'exists'; id: string; title: string }
  | { kind: 'said'; text: string; color?: 'orange' | 'red' }
