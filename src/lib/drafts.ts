/**
 * フォームの書きかけ（下書き）の読み書き（純粋関数）。Drawer の外側をタップして閉じても、
 * 端末の localStorage に残した下書きから戻せるようにする。localStorage を触るのは
 * src/components/useFormDraft.ts で、ここは鍵・形・期限だけを決める。
 */

/**
 * 下書きの鍵。kind はフォームの種類、id は編集中の行（新規は 'new'）。context には既存の行なら
 * 開いた時点の更新日時を入れる（相手がその後に保存していたら鍵が変わり、古い下書きで相手の
 * 変更を上書きしないように）。新規なら「どこから開いたか」を入れる
 */
export function draftKey(kind: string, id: string | null | undefined, context?: string): string {
  return `sumai-draft:${kind}:${id ?? 'new'}${context ? `:${context}` : ''}`
}

/** 下書きを残しておく期間（日）。それより古いものは読まない */
export const DRAFT_MAX_AGE_DAYS = 14

type Stored<T> = { v: 1; savedAt: number; values: T }

export function serializeDraft<T>(values: T, now: number): string {
  const stored: Stored<T> = { v: 1, savedAt: now, values }
  return JSON.stringify(stored)
}

/** 下書きを読む。壊れている・古い・形が違うなら null */
export function parseDraft<T>(raw: string | null, now: number): T | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const s = parsed as Partial<Stored<T>>
  if (s.v !== 1 || typeof s.savedAt !== 'number' || s.values === undefined) return null
  if (now - s.savedAt > DRAFT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) return null
  return s.values as T
}

/** 値が同じか（下書きを残す必要があるかの判定）。null・空文字・未定義は同じとみなす */
export function sameValues(a: unknown, b: unknown): boolean {
  return JSON.stringify(a, blankToNull) === JSON.stringify(b, blankToNull)
}

function blankToNull(_key: string, value: unknown): unknown {
  return value === '' || value === undefined ? null : value
}
