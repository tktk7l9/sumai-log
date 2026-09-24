/**
 * 二人が同じ記録を同時に編集したとき、後から保存した方が黙って上書きしないための仕組み。
 * フォームは開いた時点の updated_at を expectedUpdatedAt として送り、更新は
 * `WHERE id = ? AND updated_at = ?` で行う。0 行なら相手が先に更新（または削除）している。
 */
export class StaleWriteError extends Error {
  constructor() {
    super('相手が先に更新しました')
    this.name = 'StaleWriteError'
  }
}

/** 更新が 0 行で、かつ期待する更新日時が渡されていれば StaleWriteError */
export function assertUpdated(rows: unknown[], expectedUpdatedAt: string | null | undefined): void {
  if (expectedUpdatedAt && rows.length === 0) throw new StaleWriteError()
}

export type SaveResult = { id: string; conflict: false } | { id: null; conflict: true }

/** 保存を実行し、競合なら { conflict: true } を返す（それ以外の例外はそのまま投げる） */
export async function saveOrConflict(run: () => Promise<string>): Promise<SaveResult> {
  try {
    return { id: await run(), conflict: false }
  } catch (e) {
    if (e instanceof StaleWriteError) return { id: null, conflict: true }
    throw e
  }
}
