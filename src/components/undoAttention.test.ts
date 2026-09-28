import { describe, expect, it, vi } from 'vitest'

import { FOCUS_RECLAIM_MS, attentionHandlers, focusUndo } from './undoAttention'

function setup() {
  let active: unknown = null
  let pending: (() => void) | null = null
  let delay = 0
  let inputListener: (() => void) | null = null
  const stop = vi.fn(() => {
    inputListener = null
  })
  const button = {
    isConnected: true,
    focus: vi.fn(() => {
      active = button
    }),
  }
  const env = {
    activeElement: () => active,
    onUserInput: (listener: () => void) => {
      inputListener = listener
      return stop
    },
    setTimeout: (fn: () => void, ms: number) => {
      pending = fn
      delay = ms
      return 1
    },
  }
  return {
    button,
    env,
    stop,
    delay: () => delay,
    /** Something else (a closing Drawer's focus return) takes focus */
    steal: () => {
      active = { other: true }
    },
    userInput: () => inputListener?.(),
    fire: () => pending?.(),
  }
}

describe('focusUndo', () => {
  it('focuses the undo button at once without scrolling', () => {
    const t = setup()
    focusUndo(t.button, t.env)
    expect(t.button.focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(t.delay()).toBe(FOCUS_RECLAIM_MS)
  })

  it('takes focus back when a closing Drawer returned it to its opener', () => {
    const t = setup()
    focusUndo(t.button, t.env)
    t.steal()
    t.fire()
    expect(t.button.focus).toHaveBeenCalledTimes(2)
    expect(t.env.activeElement()).toBe(t.button)
    expect(t.stop).toHaveBeenCalled()
  })

  it('does not focus again when focus stayed on the button', () => {
    const t = setup()
    focusUndo(t.button, t.env)
    t.fire()
    expect(t.button.focus).toHaveBeenCalledTimes(1)
    expect(t.stop).toHaveBeenCalled()
  })

  it('leaves focus where the user put it (a key or pointer press in between)', () => {
    const t = setup()
    focusUndo(t.button, t.env)
    t.userInput()
    t.steal()
    t.fire()
    expect(t.button.focus).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the notification is already gone (undo or commit)', () => {
    const t = setup()
    focusUndo(t.button, t.env)
    t.button.isConnected = false
    t.steal()
    t.fire()
    expect(t.button.focus).toHaveBeenCalledTimes(1)
  })
})

describe('attentionHandlers', () => {
  const inside = { id: 'inside' }
  const root = { contains: (other: unknown) => other === inside }

  function make(visible = true) {
    const onChange = vi.fn()
    const h = attentionHandlers(onChange, () => visible)
    return { h, onChange }
  }

  it('reports mouse hover on enter and leave', () => {
    const { h, onChange } = make()
    h.onPointerEnter({ pointerType: 'mouse' })
    h.onPointerLeave({ pointerType: 'mouse' })
    expect(onChange.mock.calls).toEqual([[true], [false]])
  })

  it('ignores touch and pen pointers (a tap must not hold the delete)', () => {
    const { h, onChange } = make()
    h.onPointerEnter({ pointerType: 'touch' })
    h.onPointerLeave({ pointerType: 'touch' })
    h.onPointerEnter({ pointerType: 'pen' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('counts keyboard focus (:focus-visible) and releases it when focus leaves', () => {
    const { h, onChange } = make(true)
    h.onFocusCapture({ target: inside })
    h.onBlurCapture({ relatedTarget: null, currentTarget: root })
    expect(onChange.mock.calls).toEqual([[true], [false]])
  })

  it('does not count focus that is not :focus-visible (after a click or tap)', () => {
    const { h, onChange } = make(false)
    h.onFocusCapture({ target: inside })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps attention while focus moves inside the notification (Undo -> close)', () => {
    const { h, onChange } = make(true)
    h.onFocusCapture({ target: inside })
    h.onBlurCapture({ relatedTarget: inside, currentTarget: root })
    h.onFocusCapture({ target: inside })
    expect(onChange.mock.calls).toEqual([[true]])
  })

  it('stays attended while either hover or focus remains', () => {
    const { h, onChange } = make(true)
    h.onPointerEnter({ pointerType: 'mouse' })
    h.onFocusCapture({ target: inside })
    h.onPointerLeave({ pointerType: 'mouse' })
    expect(onChange.mock.calls).toEqual([[true]])
    h.onBlurCapture({ relatedTarget: { outside: true }, currentTarget: root })
    expect(onChange.mock.calls).toEqual([[true], [false]])
  })
})
