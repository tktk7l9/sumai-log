import { Figure, Label } from './Figure'

/**
 * 平面図で「建築面積(外周)」「延床(各階の合計)」「施工面積(バルコニー・玄関ポーチも足す)」を色分け。
 * バルコニー・玄関ポーチは幅が狭く 12px のラベルが入らないため、外に引き出し線で書いた。
 * 本体（延床の塗り＋建築面積の太い外周線）と、加算分（施工面積、別の色・破線）を見分けられるようにした。
 */
export function FloorAreasDiagram() {
  return (
    <Figure label="平面図での面積比較。建築面積は太い外周線、延床面積はその塗り。施工面積はバルコニーや玄関ポーチを足した薄い色の部分">
      <rect
        x={90}
        y={55}
        width={140}
        height={100}
        fill="var(--mantine-color-clay-2)"
        fillOpacity={0.6}
      />
      <rect x={90} y={55} width={140} height={100} strokeWidth={2.5} />

      <rect
        x={230}
        y={75}
        width={28}
        height={45}
        fill="var(--mantine-color-clay-4)"
        fillOpacity={0.5}
        strokeDasharray="3 2"
      />
      <rect
        x={145}
        y={155}
        width={35}
        height={22}
        fill="var(--mantine-color-clay-4)"
        fillOpacity={0.5}
        strokeDasharray="3 2"
      />

      <line x1={100} y1={22} x2={92} y2={53} />
      <Label x={20} y={18} size={12} anchor="start">
        建築面積＝太い外周線
      </Label>

      <line x1={160} y1={45} x2={160} y2={53} />
      <Label x={160} y={40} size={12}>
        延床＝各階の合計（塗り）
      </Label>

      <line x1={244} y1={68} x2={244} y2={73} />
      <Label x={244} y={62} size={12}>
        バルコニー
      </Label>

      <line x1={162} y1={188} x2={162} y2={177} />
      <Label x={162} y={202} size={12}>
        玄関ポーチ
      </Label>

      <Label x={160} y={225} size={12}>
        施工面積＝建築面積＋バルコニー・ポーチ（点線）
      </Label>
    </Figure>
  )
}
