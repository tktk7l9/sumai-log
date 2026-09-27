import { useCallback, useEffect, useRef, useState } from 'react'

import { parseDraft, sameValues, serializeDraft } from '../lib/drafts'

/** Wait before writing the draft (ms). Do not write on every keystroke */
const WRITE_DELAY = 400

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // The form stays usable even when writing fails, e.g. in private mode
  }
}

type DraftForm<T> = { values: T; setValues: (values: T) => void }

/**
 * Keeps the unfinished input of a form on the device. The input survives closing the
 * Drawer by an outside tap, a swipe or ×, and comes back on reopening (no confirmation
 * dialog is shown). When it equals the initial values the draft is removed.
 * Call clear() once saved. While restored is true, DraftNotice shows "破棄" (Discard)
 */
export function useFormDraft<T>(form: DraftForm<T>, key: string, initial: T) {
  const [restored, setRestored] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopped = useRef(false)
  const initialRef = useRef(initial)

  // Read the draft only once, on open
  useEffect(() => {
    const draft = parseDraft<T>(readStorage(key), Date.now())
    if (draft && !sameValues(draft, initialRef.current)) {
      form.setValues({ ...initialRef.current, ...draft })
      setRestored(true)
    }
    // form can be a different object every time, so read only when the key changes
  }, [key])

  // Write on every input (after a short wait)
  useEffect(() => {
    if (stopped.current) return
    if (timer.current) clearTimeout(timer.current)
    const values = form.values
    timer.current = setTimeout(() => {
      if (stopped.current) return
      writeStorage(
        key,
        sameValues(values, initialRef.current) ? null : serializeDraft(values, Date.now()),
      )
    }, WRITE_DELAY)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [form.values, key])

  /** When saved: remove the draft and stop writing from then on */
  const clear = useCallback(() => {
    stopped.current = true
    if (timer.current) clearTimeout(timer.current)
    writeStorage(key, null)
    setRestored(false)
  }, [key])

  /** When continuing to enter: remove the draft and start writing again from the new
   * initial values */
  const restart = useCallback(
    (next: T) => {
      if (timer.current) clearTimeout(timer.current)
      writeStorage(key, null)
      initialRef.current = next
      stopped.current = false
      setRestored(false)
    },
    [key],
  )

  /** Discard the restored draft and go back to the values at open time */
  const discard = useCallback(() => {
    writeStorage(key, null)
    form.setValues(initialRef.current)
    setRestored(false)
  }, [form, key])

  return { restored, clear, restart, discard }
}
