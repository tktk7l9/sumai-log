/**
 * DOM glue of the undo notification (undoableDelete.tsx), kept free of React and Mantine so the
 * behaviour can be tested with plain fakes: where focus goes after a delete, and when the
 * notification counts as "being looked at" (which pauses the delete, SHIG 54).
 */

/** Long enough to run after Mantine's focus return (a 10ms timer in useFocusReturn) */
export const FOCUS_RECLAIM_MS = 50

type Focusable = {
  focus: (options?: FocusOptions) => void
  readonly isConnected: boolean
}

export type FocusEnv = {
  activeElement: () => unknown
  /** Registers capture listeners for user input; returns the function that removes them */
  onUserInput: (listener: () => void) => () => void
  setTimeout: (fn: () => void, ms: number) => unknown
}

/**
 * Put focus on "元に戻す" (Undo) (SHIG 54, 94). A Drawer or Modal closed by the same delete
 * (the event form, the research memo, the photo viewer) hands focus back to its opener ~10ms
 * later, so take it back once, unless the user has pressed a key or the pointer in between
 */
export function focusUndo(button: Focusable, env: FocusEnv): void {
  button.focus({ preventScroll: true })
  let userActed = false
  const stop = env.onUserInput(() => {
    userActed = true
  })
  env.setTimeout(() => {
    stop()
    if (userActed || !button.isConnected || env.activeElement() === button) return
    button.focus({ preventScroll: true })
  }, FOCUS_RECLAIM_MS)
}

// Method syntax, so a DOM element (contains(other: Node | null)) fits
type Contains = { contains(other: unknown): boolean }

/**
 * Event handlers for the notification root. `onChange(true)` while a mouse is over it or
 * keyboard focus (:focus-visible) is inside it, `onChange(false)` when both have left. Touch
 * taps and the programmatic focus after a click do not count, otherwise the delete would wait
 * until the next tap elsewhere. Repeated states are not reported twice
 */
export function attentionHandlers(
  onChange: (attended: boolean) => void,
  isFocusVisible: (el: unknown) => boolean,
) {
  let hovered = false
  let focused = false
  let last = false
  const update = () => {
    const now = hovered || focused
    if (now === last) return
    last = now
    onChange(now)
  }
  return {
    onPointerEnter: (e: { pointerType: string }) => {
      if (e.pointerType !== 'mouse') return
      hovered = true
      update()
    },
    onPointerLeave: (e: { pointerType: string }) => {
      if (e.pointerType !== 'mouse') return
      hovered = false
      update()
    },
    onFocusCapture: (e: { target: unknown }) => {
      focused = isFocusVisible(e.target)
      update()
    },
    onBlurCapture: (e: { relatedTarget: unknown; currentTarget: Contains }) => {
      const next = e.relatedTarget
      if (next != null && e.currentTarget.contains(next)) return
      focused = false
      update()
    },
  }
}
