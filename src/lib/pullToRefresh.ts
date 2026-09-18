/**
 * 「上に引っ張って更新」の数値計算。DOM に触らない純粋関数だけを置く
 * （タッチの購読と描画は `src/components/PullToRefresh.tsx`）。
 *
 * PWA（standalone）にはブラウザ標準の引っ張り更新が無く、さらに `overscroll-behavior-y: none`
 * でバウンスを止めているので、ブラウザで開いても標準の引っ張り更新は効かない。
 * そのぶんをアプリ側で用意する。
 */

/** この距離（px）まで引くと離したときに更新する */
export const PULL_THRESHOLD = 72
/** 指を動かした距離をここまでに抑える（際限なく伸びないように） */
export const PULL_MAX = 120
/** 更新中にインジケータを止めておく高さ */
export const PULL_HOLD = 56

/**
 * 指の移動量（px）を見た目の引っ張り量に変換する。最初は軽く動き、引くほど重くなる
 * （距離の半分から始めて上限に漸近させる）。負や 0 は 0。
 */
export function pullDistance(dy: number): number {
  if (dy <= 0) return 0
  const eased = PULL_MAX * (1 - Math.exp(-dy / (PULL_MAX * 1.2)))
  return Math.round(Math.min(PULL_MAX, eased))
}

/** 離したときに更新するか */
export function shouldRefresh(distance: number): boolean {
  return distance >= PULL_THRESHOLD
}

/** インジケータの不透明度（引き始めは薄く、しきい値で 1） */
export function pullOpacity(distance: number): number {
  if (distance <= 0) return 0
  return Math.min(1, distance / PULL_THRESHOLD)
}
