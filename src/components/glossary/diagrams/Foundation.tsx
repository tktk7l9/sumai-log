import { Figure, Label } from './Figure'

/**
 * ベタ基礎＝面で支える（切れ目のない塗りつぶし）、布基礎＝線で支える
 * （壁の下だけの帯状の footing、footing 同士の間は塗りなし）という
 * 「面 vs 線」の対比が見えるように塗りの有無で描き分けた。
 */
export function FoundationDiagram() {
  return (
    <Figure label="基礎の断面比較。左はベタ基礎で面全体を塗りつぶして支える。右は布基礎で壁の下だけを帯状の線で支え、間は空いている">
      <line x1={10} y1={170} x2={310} y2={170} strokeDasharray="2 2" />
      <Label x={300} y={165} size={12} anchor="end">
        地面
      </Label>

      {/* ベタ基礎: 切れ目のない塗り（面）。2つの <rect> を重ねると境界に
          継ぎ目の線が浮くため、土台と立ち上がりを 1 本の <path> にしている */}
      <path
        d="M30 170 L30 155 L70 155 L70 115 L110 115 L110 155 L150 155 L150 170 Z"
        fill="var(--mantine-color-clay-3)"
        fillOpacity={0.7}
      />
      <Label x={90} y={205} size={12}>
        ベタ基礎（面で支える）
      </Label>

      {/* 布基礎: 壁の下だけの帯（線）、footing の間は塗りなし */}
      <rect x={170} y={155} width={35} height={15} fill="none" />
      <rect x={180} y={115} width={15} height={40} fill="none" />
      <rect x={245} y={155} width={35} height={15} fill="none" />
      <rect x={255} y={115} width={15} height={40} fill="none" />
      <Label x={230} y={205} size={12}>
        布基礎（線で支える）
      </Label>
    </Figure>
  )
}
