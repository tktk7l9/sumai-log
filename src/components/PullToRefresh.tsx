import { VisuallyHidden } from '@mantine/core'
import { useLocation, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { PULL_HOLD, pullDistance, pullOpacity, shouldRefresh } from '../lib/pullToRefresh'

/**
 * スマホで、ページ先頭にいるときに下へ引っ張ると loader を取り直す（router.invalidate）。
 * ページ自体は再読み込みしない（フォームや検索条件はそのまま）。
 *
 * 効かせない場面:
 * - 地図タブ（Leaflet のドラッグと衝突する）
 * - Drawer / Modal の中（フォームをスクロールしたいだけ）
 * - 自前でスクロールする箱の中でその箱が先頭にいないとき
 * - ページが先頭にいないとき（window.scrollY > 0）
 * タッチ端末（pointer: coarse）だけで購読する。
 */
/** 更新中の表示を最低これだけ見せる（ms） */
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
        // 取り直しが一瞬で終わっても「更新した」と分かるよう、最低でも少しの間は回す
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

  // iOS 標準（UIRefreshControl）と同じ見せ方: 本文の先頭に引いたぶんの空きができ、
  // その中で放射状のスピナーが濃くなっていき、離すと回る。浮いたバッジは出さない
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

/** ドロワー・地図・自前スクロール中の箱から始まったタッチは引っ張り更新にしない */
function canPullFrom(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true
  if (target.closest('[role="dialog"], .leaflet-container')) return false
  for (let el: Element | null = target; el && el !== document.body; el = el.parentElement) {
    if (el.scrollTop > 0) return false
  }
  return true
}
