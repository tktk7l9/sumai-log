import { VisuallyHidden } from '@mantine/core'
import { useLocation, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { PULL_HOLD, pullDistance, pullOpacity, shouldRefresh } from '../lib/pullToRefresh'

/**
 * On a phone, pulling down while at the top of the page refetches the loader
 * (router.invalidate).
 * The page itself is not reloaded (forms and search conditions stay as they are).
 *
 * Cases where it is disabled:
 * - The map tab (conflicts with dragging Google Maps)
 * - Inside a Drawer / Modal (the user only wants to scroll the form)
 * - Inside a box that scrolls by itself, when that box is not at its top
 * - When the page is not at the top (window.scrollY > 0)
 * It subscribes only on touch devices (pointer: coarse).
 */
/** Show the refreshing indicator for at least this long (ms) */
const MIN_SPIN_MS = 500

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { pathname } = useLocation()
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const pullRef = useRef(0)
  const refreshingRef = useRef(false)

  useEffect(() => {
    if (pathname === '/map') return
    if (!window.matchMedia('(pointer: coarse)').matches) return

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current || window.scrollY > 0) return
      if (!canPullFrom(e.target)) return
      startY.current = e.touches[0]?.clientY ?? null
    }
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return
      const y = e.touches[0]?.clientY
      if (y === undefined) return
      const dy = y - startY.current
      if (dy <= 0 || window.scrollY > 0) {
        pullRef.current = 0
        setPull(0)
        return
      }
      const d = pullDistance(dy)
      pullRef.current = d
      setPull(d)
    }
    const onEnd = async () => {
      if (startY.current === null) return
      startY.current = null
      const d = pullRef.current
      pullRef.current = 0
      if (!shouldRefresh(d)) {
        setPull(0)
        return
      }
      refreshingRef.current = true
      setRefreshing(true)
      setPull(PULL_HOLD)
      try {
        // Spin for at least a short time, so that "it refreshed" is clear even when the
        // refetch finishes in an instant
        await Promise.all([router.invalidate(), new Promise((r) => setTimeout(r, MIN_SPIN_MS))])
      } finally {
        refreshingRef.current = false
        setRefreshing(false)
        setPull(0)
      }
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [pathname, router])

  // Same presentation as the iOS standard (UIRefreshControl): a gap of the pulled amount
  // opens at the top of the content, the radial spinner in it gets darker, and it spins
  // on release. No floating badge is shown
  return (
    <>
      <div
        className="ptr-space"
        data-pulling={pull > 0 && !refreshing ? '' : undefined}
        style={{ height: pull }}
        aria-hidden={!refreshing}
      >
        <div
          className="ptr-spinner"
          data-spinning={refreshing ? '' : undefined}
          style={{ opacity: pullOpacity(pull) }}
        >
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} style={{ transform: `rotate(${i * 30}deg)` }} />
          ))}
        </div>
      </div>
      <div role="status" aria-live="polite">
        {refreshing ? <VisuallyHidden>更新中</VisuallyHidden> : null}
      </div>
      {children}
    </>
  )
}

/**
 * Touches that start in a drawer, the map, or a box in the middle of its own scroll do not trigger
 * pull to refresh
 */
function canPullFrom(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true
  if (target.closest('[role="dialog"], .places-map')) return false
  for (let el: Element | null = target; el && el !== document.body; el = el.parentElement) {
    if (el.scrollTop > 0) return false
  }
  return true
}
