import { fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderUi } from '../../../test/ui/render'
import { WorkPlayer } from './WorkPlayer'

const ORIGIN = 'https://www.youtube-nocookie.com'
const LISTENING = JSON.stringify({ event: 'listening', id: 'sumai-log', channel: 'widget' })

function post(frame: HTMLIFrameElement, data: unknown, over: Partial<MessageEventInit> = {}) {
  window.dispatchEvent(
    new MessageEvent('message', {
      origin: ORIGIN,
      source: frame.contentWindow,
      data: typeof data === 'string' ? data : JSON.stringify(data),
      ...over,
    }),
  )
}

function setup() {
  const onWatched = vi.fn()
  renderUi(<WorkPlayer videoId="abcdefghijk" title="テストの家" onWatched={onWatched} />)
  const frame = screen.getByTitle('テストの家 のルームツアー動画') as HTMLIFrameElement
  return { frame, onWatched }
}

describe('WorkPlayer', () => {
  it('embeds the no-cookie player and sends a referrer, which the app-wide no-referrer policy would drop', () => {
    const { frame } = setup()
    expect(frame.src).toContain('https://www.youtube-nocookie.com/embed/abcdefghijk?enablejsapi=1')
    expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
    expect(screen.getByRole('link', { name: 'YouTube で開く' })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=abcdefghijk',
    )
  })

  it('reports watched once, when the position reaches 90% across partial messages', () => {
    const { frame, onWatched } = setup()
    post(frame, { event: 'initialDelivery', info: { duration: 600 } })
    post(frame, { event: 'infoDelivery', info: { currentTime: 100 } })
    expect(onWatched).not.toHaveBeenCalled()
    post(frame, { event: 'infoDelivery', info: { currentTime: 541 } })
    post(frame, { event: 'infoDelivery', info: { currentTime: 599 } })
    post(frame, { event: 'onStateChange', info: 0 })
    expect(onWatched).toHaveBeenCalledTimes(1)
  })

  it('reports watched when the player says it ended', () => {
    const { frame, onWatched } = setup()
    post(frame, { event: 'onStateChange', info: 0 })
    expect(onWatched).toHaveBeenCalledTimes(1)
  })

  it('ignores messages from another origin or another window', () => {
    const { frame, onWatched } = setup()
    post(frame, { event: 'onStateChange', info: 0 }, { origin: 'https://example.com' })
    post(frame, { event: 'onStateChange', info: 0 }, { source: window })
    post(frame, 'not json')
    expect(onWatched).not.toHaveBeenCalled()
  })

  it('asks the player for its state as soon as the iframe has loaded', () => {
    const { frame } = setup()
    const postMessage = vi.spyOn(frame.contentWindow as Window, 'postMessage')
    expect(postMessage).not.toHaveBeenCalled()
    fireEvent.load(frame)
    expect(postMessage).toHaveBeenCalledWith(LISTENING, ORIGIN)
  })

  // The retries run on a 500 ms interval; a fake clock makes them deterministic
  describe('until the player answers', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('asks again every 500 ms after the load, 20 times at most, and a slow load uses none of them', () => {
      const { frame } = setup()
      const postMessage = vi.spyOn(frame.contentWindow as Window, 'postMessage')
      vi.advanceTimersByTime(30_000)
      expect(postMessage).not.toHaveBeenCalled()
      fireEvent.load(frame)
      expect(postMessage).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(500)
      expect(postMessage).toHaveBeenCalledTimes(2)
      expect(postMessage).toHaveBeenLastCalledWith(LISTENING, ORIGIN)
      vi.advanceTimersByTime(30_000)
      // The ask on load and 20 retries, then it gives up
      expect(postMessage).toHaveBeenCalledTimes(21)
    })

    it('stops asking once the player has answered', () => {
      const { frame } = setup()
      const postMessage = vi.spyOn(frame.contentWindow as Window, 'postMessage')
      fireEvent.load(frame)
      vi.advanceTimersByTime(1_000)
      expect(postMessage).toHaveBeenCalledTimes(3)
      post(frame, { event: 'initialDelivery', info: { duration: 600 } })
      vi.advanceTimersByTime(30_000)
      expect(postMessage).toHaveBeenCalledTimes(3)
    })
  })

  it('stops listening after unmount', () => {
    const onWatched = vi.fn()
    const { unmount } = renderUi(
      <WorkPlayer videoId="abcdefghijk" title="テストの家" onWatched={onWatched} />,
    )
    const frame = screen.getByTitle('テストの家 のルームツアー動画') as HTMLIFrameElement
    const source = frame.contentWindow
    unmount()
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: ORIGIN,
        source,
        data: JSON.stringify({ event: 'onStateChange', info: 0 }),
      }),
    )
    expect(onWatched).not.toHaveBeenCalled()
  })
})
