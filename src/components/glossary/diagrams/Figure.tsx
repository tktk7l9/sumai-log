/**
 * 用語集の図解が共有する土台。
 * - `Figure`: `viewBox="0 0 320 240"` の <svg> と矢印マーカー（<defs>）を用意する
 * - `Arrow` / `Label`: 各図が個別に <line>/<text> を書かないための共通部品
 *
 * 色は `currentColor`（線・文字）と、テーマの CSS 変数（塗りのみ・半透明）に限る。
 * hex や rgb() は使わない＝ダーク/ライトどちらの文字色にも自動で追従する。
 *
 * 文字は全図共通で 12〜14px（`Label` の `size` 型で強制）。200 高だと 12px 未満まで
 * 詰めないと収まらない図があったため、viewBox の高さを 240 に統一した（幅 320 は変えない）。
 */

import { createContext, useContext, useId } from 'react'
import type { ReactNode } from 'react'

type ArrowVariant = 'thin' | 'thick'
type MarkerUrls = Record<ArrowVariant, string>

const ArrowMarkerContext = createContext<MarkerUrls>({ thin: 'url(#arrow)', thick: 'url(#arrow)' })

/** Figure が <defs> に置いた矢印マーカーの `url(#…)` を返す。矢印を出さない図では使わない */
export function useArrowMarker(variant: ArrowVariant = 'thin'): string {
  return useContext(ArrowMarkerContext)[variant]
}

function ArrowMarker({ id }: { id: string }) {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX={8}
      refY={5}
      markerWidth={6}
      markerHeight={6}
      orient="auto-start-reverse"
    >
      <path d="M0 0 L10 5 L0 10 Z" fill="currentColor" stroke="none" />
    </marker>
  )
}

export function Figure({ label, children }: { label: string; children: ReactNode }) {
  // 複数の図が同じページに並んでも <marker id> が衝突しないよう useId で作る。
  // useId() の形式は React の版で変わる（18 は ":r0:"、19 は "_R_1_"）ので、
  // URL フラグメントとして安全なように ':' を落としておく。
  const rawId = useId().replace(/:/g, '')
  const markerIds: Record<ArrowVariant, string> = {
    thin: `glossary-arrow-${rawId}`,
    thick: `glossary-arrow-thick-${rawId}`,
  }
  const markerUrls: MarkerUrls = {
    thin: `url(#${markerIds.thin})`,
    thick: `url(#${markerIds.thick})`,
  }

  return (
    <ArrowMarkerContext.Provider value={markerUrls}>
      <svg
        viewBox="0 0 320 240"
        width="100%"
        role="img"
        aria-label={label}
        style={{ display: 'block', maxWidth: 420 }}
        fontSize={12}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <defs>
          <ArrowMarker id={markerIds.thin} />
          <ArrowMarker id={markerIds.thick} />
        </defs>
        {children}
      </svg>
    </ArrowMarkerContext.Provider>
  )
}

/** 熱・風・寸法などの矢印。`width` が 3 以上なら太い矢じるしを使う。`double` で両端矢印 */
export function Arrow({
  x1,
  y1,
  x2,
  y2,
  width = 1.5,
  dashed = false,
  double = false,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  width?: number
  dashed?: boolean
  double?: boolean
}) {
  const marker = useArrowMarker(width >= 3 ? 'thick' : 'thin')
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      markerEnd={marker}
      markerStart={double ? marker : undefined}
      strokeWidth={width}
      strokeDasharray={dashed ? '4 3' : undefined}
    />
  )
}

/**
 * 日本語ラベル用の <text>。塗りは currentColor、線は引かない。
 * `size` は 12〜14 に固定（グローバル制約「文字は font-size 12〜14」を型で強制する）。
 */
export function Label({
  x,
  y,
  children,
  anchor = 'middle',
  size = 12,
}: {
  x: number
  y: number
  children: ReactNode
  anchor?: 'start' | 'middle' | 'end'
  size?: 12 | 13 | 14
}) {
  return (
    <text x={x} y={y} fill="currentColor" stroke="none" fontSize={size} textAnchor={anchor}>
      {children}
    </text>
  )
}
