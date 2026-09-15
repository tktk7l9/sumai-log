/**
 * フォーム入力の境界で使う正規化。Mantine の NumberInput は欄を空にすると
 * 数値ではなく空文字 `''` を emit するが、DB 側は null 許容の数値項目なので
 * ここで null に変換してから zod のスキーマへ渡す（そうしないと保存が失敗する）。
 */
export function emptyToNull<T>(value: T | ''): T | null {
  return value === '' ? null : value
}
