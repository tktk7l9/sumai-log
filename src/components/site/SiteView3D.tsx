import { Button, Group, Text } from '@mantine/core'
import { RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'

import {
  buildScene,
  northDirection3d,
  sunDirection3d,
  toThree,
  type SceneBoxKind,
  type ScenePlaneKind,
} from '../../lib/site3d'
import type { SitePlan } from '../../lib/sitePlan'
import type { Season } from '../../lib/sun'

/** 面の色は Mantine の CSS 変数から取る（明暗どちらのテーマでも読めるように） */
const PLANE_COLOR: Record<ScenePlaneKind, string> = {
  road: '--mantine-color-gray-5',
  land: '--mantine-color-gray-2',
  open: '--mantine-color-gray-3',
  access: '--mantine-color-gray-4',
  section: '--mantine-color-clay-2',
  flag: '--mantine-color-clay-3',
}
const BOX_COLOR: Record<SceneBoxKind, string> = {
  house: '--mantine-color-clay-6',
  building: '--mantine-color-gray-5',
  construction: '--mantine-color-gray-4',
  unknown: '--mantine-color-gray-4',
}
/** 面を少しずつ浮かせて重なりのちらつき（z-fighting）を避ける（m） */
const PLANE_LIFT: Record<ScenePlaneKind, number> = {
  road: 0,
  open: 0.01,
  land: 0.02,
  access: 0.03,
  section: 0.04,
  flag: 0.05,
}

function cssColor(el: Element, name: string): THREE.Color {
  const v = getComputedStyle(el).getPropertyValue(name).trim()
  return new THREE.Color(v || '#999999')
}

type Ctx = {
  renderer: THREE.WebGLRenderer
  labels: CSS2DRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  content: THREE.Group
  sunLight: THREE.DirectionalLight
  render: () => void
  framed: boolean
}

/**
 * 区画シミュレーターの 3D 表示（three.js）。土地・区画・通路・隣地を面で、建物を箱で置き、
 * 指定の季節・時刻の太陽から平行光で影を落とす。指で回す・ピンチで寄る（OrbitControls）。
 * 描くのは値や視点が変わったときだけ（常時のアニメーションはしない）。
 */
export function SiteView3D({
  plan,
  sun,
}: {
  plan: SitePlan
  /** 影を落とす季節と時刻。null なら影なし（真上寄りの光だけ） */
  sun: { season: Season; hour: number } | null
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const ctxRef = useRef<Ctx | null>(null)
  const [unsupported, setUnsupported] = useState(false)
  const season = sun?.season ?? null
  const hour = sun?.hour ?? null

  // 描画の土台（一度だけ）
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setUnsupported(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    host.appendChild(renderer.domElement)

    const labels = new CSS2DRenderer()
    labels.domElement.className = 'site3d-labels'
    host.appendChild(labels.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.maxPolarAngle = Math.PI / 2 - 0.05
    controls.minDistance = 5
    controls.maxDistance = 400

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8177, 1.1))
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.2)
    sunLight.castShadow = true
    sunLight.shadow.mapSize.set(2048, 2048)
    sunLight.shadow.bias = -0.0005
    scene.add(sunLight, sunLight.target)
    const content = new THREE.Group()
    scene.add(content)

    const render = () => {
      renderer.render(scene, camera)
      labels.render(scene, camera)
    }
    const resize = () => {
      const w = host.clientWidth
      const h = host.clientHeight
      renderer.setSize(w, h)
      labels.setSize(w, h)
      camera.aspect = w / Math.max(h, 1)
      camera.updateProjectionMatrix()
      render()
    }
    controls.addEventListener('change', render)
    const observer = new ResizeObserver(resize)
    observer.observe(host)

    ctxRef.current = {
      renderer,
      labels,
      scene,
      camera,
      controls,
      content,
      sunLight,
      render,
      framed: false,
    }
    resize()

    return () => {
      observer.disconnect()
      controls.dispose()
      disposeGroup(content)
      renderer.dispose()
      renderer.domElement.remove()
      labels.domElement.remove()
      ctxRef.current = null
    }
  }, [])

  // 値・太陽が変わったら中身を組み直す
  useEffect(() => {
    const ctx = ctxRef.current
    const host = hostRef.current
    if (!ctx || !host) return
    const { content, sunLight, camera, controls } = ctx
    disposeGroup(content)

    const s = buildScene(plan)
    const center = {
      x: (s.bounds.minX + s.bounds.maxX) / 2,
      y: (s.bounds.minY + s.bounds.maxY) / 2,
    }
    const span = Math.max(s.bounds.maxX - s.bounds.minX, s.bounds.maxY - s.bounds.minY)

    for (const p of s.planes) {
      const geo = new THREE.PlaneGeometry(p.width, p.depth)
      geo.rotateX(-Math.PI / 2)
      const mat = new THREE.MeshLambertMaterial({ color: cssColor(host, PLANE_COLOR[p.kind]) })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(
        ...toThree({ x: p.x + p.width / 2, y: p.y + p.depth / 2, z: PLANE_LIFT[p.kind] }),
      )
      mesh.receiveShadow = true
      content.add(mesh)
      if (p.kind === 'section') content.add(outline(p, 0.06, cssColor(host, BOX_COLOR.house)))
      if (p.label)
        content.add(label(p.label, { x: p.x + p.width / 2, y: p.y + p.depth / 2, z: 0.3 }))
    }

    for (const b of s.boxes) {
      const geo = new THREE.BoxGeometry(b.width, b.height, b.depth)
      const unknown = b.kind === 'unknown'
      const mat = new THREE.MeshLambertMaterial({
        color: cssColor(host, BOX_COLOR[b.kind]),
        transparent: unknown || b.kind === 'construction',
        opacity: unknown ? 0.35 : b.kind === 'construction' ? 0.7 : 1,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(...toThree({ x: b.x + b.width / 2, y: b.y + b.depth / 2, z: b.height / 2 }))
      mesh.castShadow = !unknown
      mesh.receiveShadow = true
      content.add(mesh)
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0x3a322c, transparent: true, opacity: 0.5 }),
      )
      edges.position.copy(mesh.position)
      content.add(edges)
      content.add(
        label(
          `${b.label}${b.kind === 'house' ? '' : unknown ? '（高さ不明）' : `（${b.height}m）`}`,
          {
            x: b.x + b.width / 2,
            y: b.y + b.depth / 2,
            z: b.height + 1,
          },
        ),
      )
    }

    // 方位（北の矢印）: 土地の手前右の外に置く
    const [nx, nz] = northDirection3d(plan)
    const arrowAt = new THREE.Vector3(
      ...toThree({ x: plan.landWidth + 3, y: -plan.roadWidth - 3, z: 0.2 }),
    )
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(nx, 0, nz), arrowAt, 5, 0xb4502f, 1.6, 1)
    content.add(arrow)
    content.add(
      label(
        '北',
        { x: 0, y: 0, z: 0 },
        arrowAt.clone().add(new THREE.Vector3(nx * 6.5, 0.3, nz * 6.5)),
      ),
    )

    // 太陽。影のカメラはシーン全体を覆う
    const target = new THREE.Vector3(...toThree({ x: center.x, y: center.y, z: 0 }))
    const sunDir = season !== null && hour !== null ? sunDirection3d(plan, season, hour) : null
    const dir = sunDir?.dir ?? [0.3, 1, 0.5]
    sunLight.position
      .copy(target)
      .add(new THREE.Vector3(...dir).normalize().multiplyScalar(span * 2))
    sunLight.target.position.copy(target)
    sunLight.castShadow = sunDir !== null
    // 影を表示中で日が沈んでいれば暗く、影を消しているときは真上寄りの光で明るく
    sunLight.intensity = sunDir ? 2.2 : season !== null ? 0.3 : 1.4
    const cam = sunLight.shadow.camera
    cam.left = cam.bottom = -span
    cam.right = cam.top = span
    cam.near = 1
    cam.far = span * 4
    cam.updateProjectionMatrix()

    if (!ctx.framed) {
      frame(camera, controls, target, span)
      ctx.framed = true
    }
    ctx.render()
  }, [plan, season, hour])

  function resetView() {
    const ctx = ctxRef.current
    if (!ctx) return
    ctx.framed = false
    const s = buildScene(plan)
    const target = new THREE.Vector3(
      ...toThree({
        x: (s.bounds.minX + s.bounds.maxX) / 2,
        y: (s.bounds.minY + s.bounds.maxY) / 2,
        z: 0,
      }),
    )
    frame(
      ctx.camera,
      ctx.controls,
      target,
      Math.max(s.bounds.maxX - s.bounds.minX, s.bounds.maxY - s.bounds.minY),
    )
    ctx.framed = true
    ctx.render()
  }

  if (unsupported) {
    return (
      <Text size="sm" c="dimmed" p="md">
        この端末・ブラウザでは 3D 表示（WebGL）が使えません。平面の図で確かめてください。
      </Text>
    )
  }

  return (
    <div>
      <div
        ref={hostRef}
        className="site3d"
        role="img"
        aria-label="区画と周りの建物の 3D 表示。指で回す・ピンチで寄る"
      />
      <Group justify="space-between" mt={6} wrap="nowrap">
        <Text size="xs" c="dimmed">
          1 本指で回す・2 本指で移動・ピンチで寄る
        </Text>
        <Button
          size="compact-xs"
          variant="subtle"
          leftSection={<RotateCcw size={12} aria-hidden />}
          onClick={resetView}
        >
          視点を戻す
        </Button>
      </Group>
    </div>
  )
}

/** 手前（道路側）の斜め上から、シーン全体が入る距離で見下ろす */
function frame(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  target: THREE.Vector3,
  span: number,
) {
  controls.target.copy(target)
  camera.position.copy(target).add(new THREE.Vector3(span * 0.35, span * 0.75, span * 0.8))
  camera.lookAt(target)
  controls.update()
}

function outline(
  r: { x: number; y: number; width: number; depth: number },
  z: number,
  color: THREE.Color,
) {
  const pts = [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.depth },
    { x: r.x, y: r.y + r.depth },
    { x: r.x, y: r.y },
  ].map((p) => new THREE.Vector3(...toThree({ ...p, z })))
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color }),
  )
}

function label(text: string, at: { x: number; y: number; z: number }, position?: THREE.Vector3) {
  const el = document.createElement('div')
  el.className = 'site3d-label'
  el.textContent = text
  const obj = new CSS2DObject(el)
  if (position) obj.position.copy(position)
  else obj.position.set(...toThree(at))
  return obj
}

/** グループの中身を外し、GPU のバッファと CSS2D のラベルの DOM を片付ける */
function disposeGroup(group: THREE.Group) {
  for (const child of [...group.children]) {
    child.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.LineSegments) {
        o.geometry.dispose()
        const m = o.material
        for (const mm of Array.isArray(m) ? m : [m]) mm.dispose()
      }
      if (o instanceof CSS2DObject) o.element.remove()
    })
    group.remove(child)
  }
}
