/**
 * id は DB 上ただの text で、意味を持たせているのは形（UUID っぽい 36 文字）だけ。
 * `crypto.randomUUID()` は RFC 4122 v4 を返すが、seed 取り込みスクリプトが作る
 * sha256 由来の id は UUID の形はしていても v4 のバージョン/バリアントニブルを
 * 満たさない。zod の `.uuid()` はそこを厳密に検証してしまい、取り込んだ既存行を
 * 弾いてしまうため、形（8-4-4-4-12 の 16 進数）だけを見る。
 */
export const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function isIdLike(value: string): boolean {
  return UUID_SHAPE.test(value)
}
