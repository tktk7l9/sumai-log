import { Button, Group, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useSyncExternalStore } from 'react'

import { UNDO_WINDOW_MS, createDeferredQueue } from '../lib/deferredDelete'

/**
 * Delete without a confirm dialog, with "元に戻す" (Undo) in the notification (SHIG 57, 54).
 * The actual server call runs only after the notification's window has passed
 * (src/lib/deferredDelete.ts). One queue per tab, shared by every screen, so navigating to the
 * list right after deleting keeps the timer (and the undo) alive.
 */
const queue = createDeferredQueue(UNDO_WINDOW_MS, {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
})

// Leaving or closing the tab within the window: send the pending deletes now (best effort).
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => queue.flush())
}

/** Pending-delete key of a vendor's research memo (a column, not a row, so it has no id of its own) */
export function researchDeleteId(vendorId: string): string {
  return `research:${vendorId}`
}

const EMPTY: ReadonlySet<string> = new Set()

/** Ids whose deletion is pending. Lists filter these out so the row disappears at once */
export function usePendingDeletes(): ReadonlySet<string> {
  return useSyncExternalStore(queue.subscribe, queue.snapshot, () => EMPTY)
}

export function deleteWithUndo({
  id,
  message,
  commit,
  failureMessage = '削除できませんでした',
  onUndo,
}: {
  id: string
  /** e.g. 「見学記録を削除しました」 */
  message: string
  /** The server call. Resolve false to report a refusal (shown as failureMessage) */
  commit: () => Promise<boolean | void>
  failureMessage?: string
  onUndo?: () => void
}) {
  const notificationId = `delete-${id}`
  const scheduled = queue.schedule(id, async () => {
    notifications.hide(notificationId)
    try {
      const ok = await commit()
      if (ok === false) notifications.show({ message: failureMessage, color: 'red' })
    } catch {
      notifications.show({ message: failureMessage, color: 'red' })
    }
  })
  if (!scheduled) return
  notifications.show({
    id: notificationId,
    autoClose: UNDO_WINDOW_MS,
    message: (
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Text size="sm">{message}</Text>
        <Button
          variant="subtle"
          size="sm"
          onClick={() => {
            if (!queue.cancel(id)) return
            notifications.hide(notificationId)
            onUndo?.()
          }}
        >
          元に戻す
        </Button>
      </Group>
    ),
  })
}
