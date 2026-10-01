import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderUi } from '../../../test/ui/render'
import { WorkPlayer } from './WorkPlayer'

const ORIGIN = 'https://www.youtube-nocookie.com'

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
