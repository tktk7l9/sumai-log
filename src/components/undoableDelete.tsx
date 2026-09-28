import { Button, Group, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { type FocusEvent, type PointerEvent, useSyncExternalStore } from 'react'

import { UNDO_WINDOW_MS, createDeferredQueue } from '../lib/deferredDelete'
import { type FetchLike, withKeepalive } from '../lib/keepalive'

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

// Leaving or closing the tab within the window: send the pending deletes now. The server calls
// get `fetch: unloadSafeFetch` so the browser does not cancel them while the page unloads.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => queue.flush())
}

/** The fetch handed to `commit`: pass it on as `fetch` of the server function call */
export type UnloadSafeFetch = FetchLike<Promise<Response>>
const unloadSafeFetch: UnloadSafeFetch = withKeepalive((input, init) => fetch(input, init))

/**
 * Undo a pending delete from code, e.g. when the item is written again before the window has
 * passed (a new research memo saved right after deleting the old one must not be wiped by the
 * late delete). Returns false when nothing was pending
 */
export function cancelPendingDelete(id: string): boolean {
  if (!queue.cancel(id)) return false
  notifications.hide(`delete-${id}`)
  return true
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
  /**
   * The server call. Pass `fetch` on to it (`remove({ data, fetch })`) so that it still reaches
   * the server when it is sent while the tab is closing. Resolve false to report a refusal
   * (shown as failureMessage)
   */
  commit: (fetch: UnloadSafeFetch) => Promise<boolean | void>
  failureMessage?: string
  onUndo?: () => void
}) {
  const notificationId = `delete-${id}`
  const scheduled = queue.schedule(id, async () => {
    notifications.hide(notificationId)
    try {
      const ok = await commit(unloadSafeFetch)
      if (ok === false) notifications.show({ message: failureMessage, color: 'red' })
    } catch {
      notifications.show({ message: failureMessage, color: 'red' })
    }
  })
  if (!scheduled) return
  notifications.show({
    id: notificationId,
    // The queue owns the clock: the commit hides the notification, and hovering or focusing it
    // pauses the queue's timer as well (SHIG 54). With Mantine's own autoClose the toast stayed
    // while hovered but the delete still went through after UNDO_WINDOW_MS
    autoClose: false,
    ...pauseWhileAttended(id),
    // Closed with its "×" while paused: the focused element is removed without a blur, so start
    // the window again here (a no-op after undo or commit, when nothing is paused)
    onClose: () => {
      queue.resume(id)
    },
    // Tab from "元に戻す" (Undo) lands on the close button, which has no name of its own
    closeButtonProps: { 'aria-label': '通知を閉じる' },
    message: (
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Text size="sm">{message}</Text>
        <Button
          ref={focusOnMount}
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

/**
 * The deleted element (a detail page's delete button, a list row) goes away, so focus would fall
 * to <body>. Put it on "元に戻す" (Undo) instead, where a keyboard or screen-reader user can
 * take the delete back at once (SHIG 54, 94)
 */
function focusOnMount(button: HTMLButtonElement | null) {
  button?.focus({ preventScroll: true })
}

/**
 * Pause the delete while a mouse is over the notification or keyboard focus is inside it, and
 * start a new window when both have left. Touch taps and the programmatic focus after a click
 * do not count (not :focus-visible), otherwise the delete would wait until the next tap
 * elsewhere
 */
function pauseWhileAttended(id: string) {
  let hovered = false
  let focused = false
  const update = () => {
    if (hovered || focused) queue.pause(id)
    else queue.resume(id)
  }
  return {
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType !== 'mouse') return
      hovered = true
      update()
    },
    onPointerLeave: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType !== 'mouse') return
      hovered = false
      update()
    },
    onFocusCapture: (e: FocusEvent<HTMLElement>) => {
      focused = isFocusVisible(e.target)
      update()
    },
    onBlurCapture: (e: FocusEvent<HTMLElement>) => {
      const next = e.relatedTarget
      if (next instanceof Node && e.currentTarget.contains(next)) return
      focused = false
      update()
    },
  }
}

function isFocusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return false
  }
}
