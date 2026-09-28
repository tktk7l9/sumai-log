/**
 * The base shared by the glossary diagrams.
 * - `Figure`: provides the <svg> with `viewBox="0 0 320 240"` and the arrow markers (<defs>)
 * - `Arrow` / `Label`: shared parts so that each diagram does not write <line>/<text> itself
 *
 * Colors are limited to `currentColor` (lines, text) and the theme's CSS variables (fills
 * only, semi-transparent).
 * hex and rgb() are not used = it follows the text color of both dark and light automatically.
 *
 * Text is 12 to 14px in all diagrams (enforced by the `size` type of `Label`). With a height
 * of 200, some diagrams did not fit unless text was squeezed below 12px, so the viewBox
 * height was unified to 240 (the width 320 is unchanged).
 */

import { createContext, useContext, useId } from 'react'
import type { ReactNode } from 'react'

type ArrowVariant = 'thin' | 'thick'
type MarkerUrls = Record<ArrowVariant, string>

const ArrowMarkerContext = createContext<MarkerUrls>({ thin: 'url(#arrow)', thick: 'url(#arrow)' })

/**
 * Returns the `url(#…)` of the arrow marker that Figure put in <defs>. Not used in diagrams without
 * arrows
 */
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
  // Built with useId so that <marker id> does not collide even when several diagrams are
  // on the same page.
  // The format of useId() changes with the React version (18 is ":r0:", 19 is "_R_1_"),
  // so ':' is dropped to make it safe as a URL fragment.
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

/**
 * Arrows for heat, wind, dimensions, etc. When `width` is 3 or more, the thick arrowhead is used.
 * `double` gives arrows on both ends
 */
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
 * <text> for Japanese labels. The fill is currentColor, with no stroke.
 * `size` is fixed to 12 to 14 (the type enforces the global constraint "text is font-size
 * 12 to 14").
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
