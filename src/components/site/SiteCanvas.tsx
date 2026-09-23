import { useEffect, useRef } from 'react'

import {
  accessRect,
  buildingRect,
  fireSafeRect,
  flagRect,
  m2ToTsubo,
  normalizePlan,
  northAngle,
  sectionRect,
  tsuboToM2,
  type Rect,
  type SitePlan,
} from '../../lib/sitePlan'

/** 余白（m） */
const PAD = 1.5
/** 道路の帯は実際の幅員で描くが、文字が入るよう最低この奥行は取る（m） */
const MIN_ROAD = 3

type DragKind = 'section' | 'building'
type Drag = { kind: DragKind; startX: number; startY: number; origX: number; origY: number }

/** ドラッグは 0.5 m 刻みに吸着させる（指でも狙った位置に置きやすいように） */
function snap(v: number): number {
  return Math.round(v * 2) / 2
}

/**
 * 区画シミュレーターの平面図（SVG）。単位はメートルで、道路を常に下に描く。区画と建物は
 * 指・マウスでドラッグして動かせる（Pointer Events）。ドラッグ中だけページのスクロールを
 * 止める（iOS Safari は touch-action だけでは止まらないことがあるので touchmove も抑える）。
 */
export function SiteCanvas({
  plan,
  onChange,
}: {
  plan: SitePlan
  onChange: (next: SitePlan) => void
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
  const width = plan.landWidth + PAD * 2
  const height = plan.landDepth + ROAD + PAD * 2
  const unit = Math.max(plan.landWidth, plan.landDepth) / 40
  const font = Math.max(unit * 1.1, 0.5)

  /** 土地の座標（道路側が y=0）を SVG の座標（上が y=0）に直す */
  function toSvg(r: Rect) {
    return {
      x: PAD + r.x,
      y: PAD + plan.landDepth - r.y - r.depth,
      width: r.width,
      height: r.depth,
    }
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
    // SVG は下向きが +y、土地の座標は奥（画面の上）が +y
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
  // 延焼ライン（準防火地域のとき）。区画の座標から土地の座標へ
  const safe = plan.quasiFireZone ? fireSafeRect(plan) : null
  const safeSvg =
    safe && safe.width > 0 && safe.depth > 0
      ? toSvg({ x: sec.x + safe.x, y: sec.y + safe.y, width: safe.width, depth: safe.depth })
      : null
  const access = accessRect(plan)
  const accessSvg = access ? toSvg(access) : null
  // 区画の奥（画面の上）に残る土地の奥行
  const backDepth = plan.landDepth - plan.sectionY - sectionRect(plan).depth
  const sectionTsubo = m2ToTsubo(sectionRect(plan).width * sectionRect(plan).depth)
  const angle = northAngle(plan.roadSide)
  const gapAbove = building.y - section.y
  const gapBelow = section.y + section.height - (building.y + building.height)
  const sectionLabelY =
    gapAbove >= gapBelow ? section.y + gapAbove / 2 : building.y + building.height + gapBelow / 2
  // 方位は道路の帯の右端に置く（土地の上に重ねると区画・建物を隠すため）
  const compass = { x: width - PAD - unit * 1.2, y: PAD + plan.landDepth + ROAD / 2 }
  const compassR = Math.min(unit * 1.1, ROAD * 0.4)

  // 5 m ごとの目盛り線（土地の中だけ）
  const grid: React.ReactNode[] = []
  for (let gx = 5; gx < plan.landWidth; gx += 5) {
    grid.push(
      <line
        key={`gx${gx}`}
        x1={PAD + gx}
        x2={PAD + gx}
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
        y1={PAD + plan.landDepth - gy}
        y2={PAD + plan.landDepth - gy}
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
      aria-label={`土地 間口${plan.landWidth}m×奥行${plan.landDepth}m のうち、区画 ${sectionTsubo.toFixed(1)}坪と建物 ${plan.buildingTsubo}坪の配置図`}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* 道路 */}
      <rect x={0} y={PAD + plan.landDepth} width={width} height={ROAD} className="site-road" />
      <text
        x={width / 2}
        y={PAD + plan.landDepth + ROAD / 2}
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
          y1={PAD + plan.landDepth + plan.roadWidth / 2}
          y2={PAD + plan.landDepth + plan.roadWidth / 2}
          className="site-centerline"
        />
      ) : null}

      {/* 土地 */}
      <rect {...land} className="site-land" />
      {grid}

      {/* 筆界 */}
      {plan.lotLines.map((lx) => (
        <g key={`lot${lx}`} pointerEvents="none">
          <line
            x1={PAD + lx}
            x2={PAD + lx}
            y1={land.y}
            y2={land.y + land.height}
            className="site-lotline"
          />
          <text
            x={PAD + lx + font * 0.3}
            y={land.y + font}
            fontSize={font * 0.75}
            className="site-label site-label-muted"
          >
            筆界
          </text>
        </g>
      ))}

      {/* 残りの土地（駐車場）への通路と、区画の奥に残る土地 */}
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

      {/* 路地状部分（区画が奥のとき） */}
      {flagSvg ? <rect {...flagSvg} className="site-flag" /> : null}

      {/* 区画（ドラッグで移動） */}
      <rect {...section} className="site-section" onPointerDown={(e) => startDrag('section', e)} />

      {/* 延焼ライン（この外側が延焼のおそれのある部分） */}
      {safeSvg ? <rect {...safeSvg} className="site-fireline" pointerEvents="none" /> : null}

      {/* 建物（ドラッグで区画の中を移動） */}
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
        平屋 {plan.buildingTsubo}坪
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
        {plan.buildingWidth.toFixed(1)}×
        {(tsuboToM2(plan.buildingTsubo) / plan.buildingWidth).toFixed(1)}m
      </text>

      {/* 区画の面積は、区画の中で建物の上下のうち広く空いている側に置く（建物に隠れないように） */}
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

      {/* 寸法（間口・奥行） */}
      <text
        x={land.x + land.width / 2}
        y={PAD * 0.7}
        fontSize={font * 0.9}
        className="site-label site-label-muted"
        textAnchor="middle"
      >
        間口 {plan.landWidth}m
      </text>
      <text
        x={PAD * 0.55}
        y={land.y + land.height / 2}
        fontSize={font * 0.9}
        className="site-label site-label-muted"
        textAnchor="middle"
        transform={`rotate(-90 ${PAD * 0.55} ${land.y + land.height / 2})`}
      >
        奥行 {plan.landDepth}m
      </text>

      {/* 方位 */}
      <g transform={`translate(${compass.x} ${compass.y}) rotate(${angle})`} pointerEvents="none">
        <circle r={compassR} className="site-compass" />
        <path
          d={`M 0 ${-compassR * 0.8} L ${compassR * 0.42} ${compassR * 0.45} L 0 ${compassR * 0.18} L ${-compassR * 0.42} ${compassR * 0.45} Z`}
          className="site-compass-needle"
        />
      </g>
      {/* 「北」は方位の左に正立で置く（針が向きを示す） */}
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
