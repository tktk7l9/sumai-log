import { Figure, Label } from './Figure'

/** 平面図で「建築面積(外周)」「延床(各階の合計)」「施工面積(バルコニー・玄関ポーチも足す)」を色分け */
export function FloorAreasDiagram() {
  return (
    <Figure label="平面図での面積比較。建築面積は外周の線、延床面積は各階の床の合計、施工面積はバルコニーや玄関ポーチも足した面積">
      <path
        d="M70 50 L250 50 L250 90 L280 90 L280 130 L250 130 L250 170 L150 170 L150 190 L110 190 L110 170 L70 170 Z"
        strokeDasharray="3 2"
      />
      <rect
        x={70}
        y={50}
        width={180}
        height={120}
        fill="var(--mantine-color-clay-2)"
        fillOpacity={0.6}
      />
      <rect x={70} y={50} width={180} height={120} strokeWidth={2.5} />

      <Label x={160} y={30} size={9}>
        延床＝各階の合計
      </Label>
      <Label x={75} y={44} size={7} anchor="start">
        太線＝建築面積（外周）
      </Label>
      <Label x={268} y={112} size={7}>
        バルコニー
      </Label>
      <Label x={130} y={183} size={7}>
        玄関ポーチ
      </Label>
      <Label x={160} y={196} size={8}>
        点線＝施工面積（バルコニー・ポーチも足す）
      </Label>
    </Figure>
  )
}
