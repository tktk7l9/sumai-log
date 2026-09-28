import { useEffect, useRef } from 'react'

import {
  accessRect,
  FIRE_SPREAD_DISTANCE_UPPER,
  buildingDepth,
  buildingLabel,
  buildingRect,
  fireSafeRect,
  flagRect,
  landAxes,
  m2ToTsubo,
  normalizePlan,
  sectionRect,
  type Rect,
  type SitePlan,
} from '../../lib/sitePlan'
import {
  SEASON_DECLINATION,
  shadowPolygon,
  solarPosition,
  sunInLand,
  type Point,
  type Season,
} from '../../lib/sun'

/** Margin (m) */
const PAD = 1.5
/** The road band is drawn at the actual road width, but takes at least this depth so that
 * the text fits (m) */
const MIN_ROAD = 3
/** Neighboring lots are drawn up to this distance outside the land (m), so that the land
 * does not get too small on a phone */
const MAX_AROUND = 16

function clampBetween(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

type DragKind = 'section' | 'building'
type Drag = { kind: DragKind; startX: number; startY: number; origX: number; origY: number }

/** Dragging snaps to 0.5 m steps (so that even a finger can place it where intended) */
function snap(v: number): number {
  return Math.round(v * 2) / 2
}

/**
 * The floor plan view (SVG) of the site plan simulator. The unit is meters, and the road
 * is always drawn at the bottom. The section and the building can be moved by dragging
 * with a finger or mouse (Pointer Events). Page scrolling is stopped only while dragging
 * (iOS Safari sometimes does not stop with touch-action alone, so touchmove is suppressed
 * too).
 */
export function SiteCanvas({
  plan,
  onChange,
  sun,
}: {
  plan: SitePlan
  onChange: (next: SitePlan) => void
  /** The season and time (true solar time) to draw shadows for. null draws none */
  sun: { season: Season; hour: number } | null
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<Drag | null>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const stop = (e: TouchEvent) => {
      if (dragRef.current) e.preventDefault()
    }
    svg.addEventListener('touchmove', stop, { passive: false })
    return () => svg.removeEventListener('touchmove', stop)
  }, [])

  const ROAD = Math.max(plan.roadWidth, MIN_ROAD)
  // Take the surrounding margin according to the extent of the neighboring lots (up to
  // MAX_AROUND)
  const around = { left: 0, right: 0, back: 0, front: 0 }
  for (const n of plan.neighbors) {
    around.left = Math.max(around.left, -n.x)
    around.right = Math.max(around.right, n.x + n.width - plan.landWidth)
    around.back = Math.max(around.back, n.y + n.depth - plan.landDepth)
    around.front = Math.max(around.front, -(n.y + ROAD))
  }
  const mL = PAD + clampBetween(around.left, 0, MAX_AROUND)
  const mR = PAD + clampBetween(around.right, 0, MAX_AROUND)
  const mT = PAD + clampBetween(around.back, 0, MAX_AROUND)
  const mB = PAD + clampBetween(around.front, 0, MAX_AROUND)
  const width = plan.landWidth + mL + mR
  const height = plan.landDepth + ROAD + mT + mB
  const unit = Math.max(plan.landWidth, plan.landDepth) / 40
  const font = Math.max(unit * 1.1, 0.5)

  /** Converts land coordinates (road side is y=0) to SVG coordinates (top is y=0) */
  function toSvg(r: Rect) {
    return {
      x: mL + r.x,
      y: mT + plan.landDepth - r.y - r.depth,
      width: r.width,
      height: r.depth,
    }
  }
  function pointsToSvg(pts: Point[]): string {
    return pts.map((p) => `${mL + p.x},${mT + plan.landDepth - p.y}`).join(' ')
  }
  /** Cuts off what sticks out of the drawn range (viewBox). null when nothing remains */
  function clipToView(r: ReturnType<typeof toSvg>) {
    const x0 = Math.max(r.x, 0)
    const y0 = Math.max(r.y, 0)
    const x1 = Math.min(r.x + r.width, width)
    const y1 = Math.min(r.y + r.height, height)
    return x1 - x0 > 0.2 && y1 - y0 > 0.2 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null
  }

  function svgPoint(e: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse())
    return { x: p.x, y: p.y }
  }

  function startDrag(kind: DragKind, e: React.PointerEvent) {
    e.stopPropagation()
    const p = svgPoint(e)
    dragRef.current = {
      kind,
      startX: p.x,
      startY: p.y,
      origX: kind === 'section' ? plan.sectionX : plan.buildingX,
      origY: kind === 'section' ? plan.sectionY : plan.buildingY,
    }
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  function moveDrag(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const p = svgPoint(e)
    const x = snap(drag.origX + (p.x - drag.startX))
    // In SVG downward is +y; in land coordinates the back (top of the screen) is +y
    const y = snap(drag.origY - (p.y - drag.startY))
    onChange(
      normalizePlan(
        drag.kind === 'section'
          ? { ...plan, sectionX: x, sectionY: y }
          : { ...plan, buildingX: x, buildingY: y },
      ),
    )
  }

  function endDrag(e: React.PointerEvent) {
    if (!dragRef.current) return
    dragRef.current = null
    svgRef.current?.releasePointerCapture(e.pointerId)
  }

  const land = toSvg({ x: 0, y: 0, width: plan.landWidth, depth: plan.landDepth })
  const section = toSvg(sectionRect(plan))
  const flag = flagRect(plan)
  const flagSvg = flag ? toSvg(flag) : null
  const building = toSvg(buildingRect(plan))
  const sec = sectionRect(plan)
  // Fire spread lines (when in a quasi-fire-prevention district. For 2 stories, also the
  // 5m line of the 2nd floor). From section coordinates to land coordinates
  const fireLines = (
    plan.quasiFireZone
      ? plan.floors >= 2
        ? [fireSafeRect(plan), fireSafeRect(plan, FIRE_SPREAD_DISTANCE_UPPER)]
        : [fireSafeRect(plan)]
      : []
  )
    .filter((r) => r.width > 0 && r.depth > 0)
    .map((r) => toSvg({ x: sec.x + r.x, y: sec.y + r.y, width: r.width, depth: r.depth }))
  const access = accessRect(plan)
  const accessSvg = access ? toSvg(access) : null
  // Depth of the land left behind the section (top of the screen)
  const backDepth = plan.landDepth - plan.sectionY - sectionRect(plan).depth
  const sectionTsubo = m2ToTsubo(sectionRect(plan).width * sectionRect(plan).depth)
  const angle = (360 - landAxes(plan).backAz) % 360
  const gapAbove = building.y - section.y
  const gapBelow = section.y + section.height - (building.y + building.height)
  const sectionLabelY =
    gapAbove >= gapBelow ? section.y + gapAbove / 2 : building.y + building.height + gapBelow / 2
  // The compass sits at the right end of the road band (overlaid on the land it would
  // hide the section and the building)
  const compass = { x: width - PAD - unit * 1.2, y: mT + plan.landDepth + ROAD / 2 }
  const compassR = Math.min(unit * 1.1, ROAD * 0.4)

  const neighborsSvg = plan.neighbors.map((n, i) => {
    const r = clipToView(toSvg(n))
    if (!r) return null
    const tall = n.kind !== 'open'
    const text = tall ? `${n.label}（${n.height > 0 ? `${n.height}m` : '高さ不明'}）` : n.label
    // For a tall lot, rotate the text to vertical. The text shrinks to a size that fits
    // in the lot
    const vertical = r.height > r.width * 1.5
    const room = (vertical ? r.height : r.width) * 0.9
    const size = Math.min(font * 0.75, room / Math.max(text.length, 4))
    const cx = r.x + r.width / 2
    const cy = r.y + r.height / 2
    return (
      <g key={`nb${i}`} pointerEvents="none">
        <rect {...r} className={`site-neighbor site-neighbor-${n.kind}`} />
        {size >= font * 0.35 ? (
          <text
            x={cx}
            y={cy}
            fontSize={size}
            className="site-label site-label-muted"
            textAnchor="middle"
            dominantBaseline="middle"
            transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
          >
            {text}
          </text>
        ) : null}
      </g>
    )
  })

  // Shadows: the surrounding buildings (those with a known height) and our own
  // single-story house
  const shadows: Point[][] = []
  if (sun) {
    const { rightAz, backAz } = landAxes(plan)
    const pos = solarPosition(plan.latitude, SEASON_DECLINATION[sun.season], sun.hour)
    const v = sunInLand(pos.altitude, pos.azimuth, rightAz, backAz)
    const boxes = [
      ...plan.neighbors.filter((n) => n.kind !== 'open' && n.height > 0),
      { ...buildingRect(plan), height: plan.buildingHeight },
    ]
    for (const box of boxes) {
      const poly = shadowPolygon(box, v)
      if (poly) shadows.push(poly)
    }
  }

  // Grid lines every 5 m (inside the land only)
  const grid: React.ReactNode[] = []
  for (let gx = 5; gx < plan.landWidth; gx += 5) {
    grid.push(
      <line
        key={`gx${gx}`}
        x1={mL + gx}
        x2={mL + gx}
        y1={land.y}
        y2={land.y + land.height}
        className="site-grid"
      />,
    )
  }
  for (let gy = 5; gy < plan.landDepth; gy += 5) {
    grid.push(
      <line
        key={`gy${gy}`}
        x1={land.x}
        x2={land.x + land.width}
        y1={mT + plan.landDepth - gy}
        y2={mT + plan.landDepth - gy}
        className="site-grid"
      />,
    )
  }

  return (
    <svg
      ref={svgRef}
      className="site-canvas"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`土地 間口${plan.landWidth}m×奥行${plan.landDepth}m のうち、区画 ${sectionTsubo.toFixed(1)}坪と建物（${buildingLabel(plan)}）の配置図`}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* Road */}
      <rect x={0} y={mT + plan.landDepth} width={width} height={ROAD} className="site-road" />
      <text
        x={mL + plan.landWidth / 2}
        y={mT + plan.landDepth + ROAD / 2}
        fontSize={font}
        className="site-label site-label-muted"
        dominantBaseline="middle"
        textAnchor="middle"
      >
        道路 {plan.roadWidth}m
      </text>
      {plan.roadWidth > 0 ? (
        <line
          x1={0}
          x2={width}
          y1={mT + plan.landDepth + plan.roadWidth / 2}
          y2={mT + plan.landDepth + plan.roadWidth / 2}
          className="site-centerline"
        />
      ) : null}

      {/* Neighboring lots and surrounding buildings */}
      {neighborsSvg}

      {/* Land */}
      <rect {...land} className="site-land" />
      {grid}

      {/* Parcel boundaries */}
      {plan.lotLines.map((lx) => (
        <g key={`lot${lx}`} pointerEvents="none">
          <line
            x1={mL + lx}
            x2={mL + lx}
            y1={land.y}
            y2={land.y + land.height}
            className="site-lotline"
          />
          <text
            x={mL + lx + font * 0.3}
            y={land.y + font}
            fontSize={font * 0.75}
            className="site-label site-label-muted"
          >
            筆界
          </text>
        </g>
      ))}

      {/* The passage to the remaining land (parking lot), and the land left behind the
          section */}
      {accessSvg ? (
        <>
          <rect {...accessSvg} className="site-access" />
          <text
            x={accessSvg.x + accessSvg.width / 2}
            y={accessSvg.y + accessSvg.height / 2}
            fontSize={Math.min(font * 0.8, accessSvg.width * 0.55)}
            className="site-label site-label-muted"
            textAnchor="middle"
            dominantBaseline="middle"
            pointerEvents="none"
            transform={`rotate(-90 ${accessSvg.x + accessSvg.width / 2} ${accessSvg.y + accessSvg.height / 2})`}
          >
            駐車場への通路 {plan.accessWidth}m
          </text>
        </>
      ) : null}
      {backDepth >= 3 ? (
        <text
          x={land.x + land.width / 2}
          y={land.y + backDepth / 2}
          fontSize={font}
          className="site-label site-label-muted"
          textAnchor="middle"
          dominantBaseline="middle"
          pointerEvents="none"
        >
          残りの土地（駐車場など）
        </text>
      ) : null}

      {/* Flagpole (access strip) part (when the section is at the back) */}
      {flagSvg ? <rect {...flagSvg} className="site-flag" /> : null}

      {/* Section (drag to move) */}
      <rect {...section} className="site-section" onPointerDown={(e) => startDrag('section', e)} />

      {/* Shadows (for the given season and time) */}
      {shadows.map((pts, i) => (
        <polygon key={`sh${i}`} points={pointsToSvg(pts)} className="site-shadow" />
      ))}

      {/* Fire spread lines (outside of them is the part at risk of fire spread) */}
      {fireLines.map((r, i) => (
        <rect
          key={`fire${i}`}
          {...r}
          className={i === 0 ? 'site-fireline' : 'site-fireline site-fireline-upper'}
          pointerEvents="none"
        />
      ))}

      {/* Building (drag to move inside the section) */}
      <rect
        {...building}
        className="site-building"
        onPointerDown={(e) => startDrag('building', e)}
      />
      <text
        x={building.x + building.width / 2}
        y={building.y + building.height / 2}
        fontSize={font}
        className="site-label site-label-inverse"
        dominantBaseline="middle"
        textAnchor="middle"
        pointerEvents="none"
      >
        {buildingLabel(plan)}
      </text>
      <text
        x={building.x + building.width / 2}
        y={building.y + building.height / 2 + font * 1.3}
        fontSize={font * 0.8}
        className="site-label site-label-inverse"
        dominantBaseline="middle"
        textAnchor="middle"
        pointerEvents="none"
      >
        {plan.buildingWidth.toFixed(1)}×{buildingDepth(plan).toFixed(1)}m
      </text>

      {/* The section area label sits inside the section, on whichever side above or below
          the building has more free space (so that the building does not hide it) */}
      <text
        x={section.x + section.width / 2}
        y={sectionLabelY}
        fontSize={font}
        className="site-label"
        textAnchor="middle"
        dominantBaseline="middle"
        pointerEvents="none"
      >
        区画 {sectionTsubo.toFixed(1)}坪
      </text>

      {/* Dimensions (frontage, depth) */}
      <text
        x={land.x + land.width / 2}
        y={land.y - PAD * 0.3}
        fontSize={font * 0.9}
        className="site-label site-label-muted"
        textAnchor="middle"
      >
        間口 {plan.landWidth}m
      </text>
      <text
        x={land.x - PAD * 0.45}
        y={land.y + land.height / 2}
        fontSize={font * 0.9}
        className="site-label site-label-muted"
        textAnchor="middle"
        transform={`rotate(-90 ${land.x - PAD * 0.45} ${land.y + land.height / 2})`}
      >
        奥行 {plan.landDepth}m
      </text>

      {/* Compass */}
      <g transform={`translate(${compass.x} ${compass.y}) rotate(${angle})`} pointerEvents="none">
        <circle r={compassR} className="site-compass" />
        <path
          d={`M 0 ${-compassR * 0.8} L ${compassR * 0.42} ${compassR * 0.45} L 0 ${compassR * 0.18} L ${-compassR * 0.42} ${compassR * 0.45} Z`}
          className="site-compass-needle"
        />
      </g>
      {/* "北" (North) sits upright to the left of the compass (the needle shows the
          direction) */}
      <text
        x={compass.x - compassR - font * 0.3}
        y={compass.y}
        fontSize={font * 0.8}
        className="site-label site-label-muted"
        textAnchor="end"
        dominantBaseline="middle"
      >
        北
      </text>
    </svg>
  )
}
