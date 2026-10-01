import { Button, Group, Stack, TextInput } from '@mantine/core'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { canonicalYouTubeUrl, parseYouTubeId } from '../../lib/youtube'
import type { WorkRow } from '../../server/repository/works'
import { saveWorkVideo } from '../../server/works'

/**
 * Paste a tour video for a work whose site does not link one. The URL is checked here with the
 * same parser the server uses, so the reason shows up at once (SHIG 50, 46: any YouTube URL
 * shape is accepted and normalised to the id on the server).
 */
export function WorkVideoForm({
  work,
  onSaved,
  onCancel,
}: {
  work: WorkRow
  onSaved: () => void
  onCancel: () => void
}) {
  const save = useServerFn(saveWorkVideo)
  const [url, setUrl] = useState(
    work.youtubeVideoId ? canonicalYouTubeUrl(work.youtubeVideoId) : '',
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(next: string | null) {
    if (next !== null && !parseYouTubeId(next)) {
      setError('YouTube の URL を入れてください')
      return
    }
    setBusy(true)
    try {
      await save({ data: { id: work.id, url: next } })
      onSaved()
    } catch {
      setError('保存できませんでした')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit(url.trim())
      }}
    >
      <Stack gap="md">
        <TextInput
          label="YouTube の URL"
          placeholder="https://www.youtube.com/watch?v=…"
          value={url}
          onChange={(e) => {
            setUrl(e.currentTarget.value)
            setError(null)
          }}
          error={error}
          inputMode="url"
          autoComplete="off"
          data-autofocus
        />
        <Group justify="space-between">
          {/* Kept apart from 保存 (Save): removing is the destructive one (SHIG 16) */}
          {work.videoSource === 'manual' ? (
            <Button variant="subtle" color="red" disabled={busy} onClick={() => void submit(null)}>
              動画を外す
            </Button>
          ) : (
            <span />
          )}
          <Group gap="xs">
            <Button variant="default" disabled={busy} onClick={onCancel}>
              やめる
            </Button>
            <Button type="submit" loading={busy}>
              保存
            </Button>
          </Group>
        </Group>
      </Stack>
    </form>
  )
}
