/**
 * createServerFn の validator（zod）失敗から日本語のメッセージを取り出す。
 *
 * TanStack Start の createServerFn は validator（zod）が失敗すると、クライアント側で
 * 受け取る Error#message が issues 配列の JSON 文字列になる。zod の既定メッセージは
 * 英語（例: "Too big: expected string to have <=30 characters"）なので、フィールド名と
 * code（too_big / too_small / invalid_type / invalid_value）から具体的な日本語の文に
 * 言い換える。サーバー側が明示的に日本語で投げたメッセージ（例:「タグは 1 つ以上
 * 必要です」）はそのまま使う。issues 配列として読めない・フィールドが未知の場合は
 * 汎用の「保存できませんでした」にフォールバックする（1 つの広いメッセージで済ませない
 * ための最終手段）。
 */

const JAPANESE_CHAR = /[぀-ヿ㐀-鿿]/

const DEFAULT_MESSAGE = '保存できませんでした'

type ZodIssueCode = 'too_big' | 'too_small' | 'invalid_type' | 'invalid_value'

type RawIssue = {
  code?: unknown
  path?: unknown
  message?: unknown
}

/** フィールドごと・code ごとの言い換え。ここに無い組み合わせは DEFAULT_MESSAGE */
const FIELD_CODE_MESSAGE: Partial<Record<string, Partial<Record<ZodIssueCode, string>>>> = {
  url: {
    too_small: 'URL は必須です',
    too_big: 'URL は 500 文字までです',
  },
  title: {
    too_small: '題名は必須です',
    too_big: '題名は 300 文字までです',
  },
  channel: {
    too_big: 'チャンネル名は 200 文字までです',
  },
  tags: {
    too_small: 'タグは 1〜30 文字、最大 10 個です',
    too_big: 'タグは 1〜30 文字、最大 10 個です',
  },
  // 設定画面のタグ一覧（src/server/tags.ts の names: 1〜30 文字 × 最大 100 個）
  names: {
    too_small: 'タグは 1〜30 文字で入力してください',
    too_big: 'タグは 1〜30 文字、最大 100 個です',
  },
  takeaways: {
    too_big: '学びは 4000 文字までです',
  },
  watchedBy: {
    invalid_type: '観た人の指定が不正です',
    invalid_value: '観た人の指定が不正です',
  },
  areas: {
    too_big: '市区町村の入力が長すぎます',
  },
  note: {
    too_big: 'メモが長すぎます',
  },
}

function firstIssue(error: unknown): RawIssue | null {
  if (!(error instanceof Error)) return null
  try {
    const issues = JSON.parse(error.message) as unknown
    if (Array.isArray(issues) && issues.length > 0) return issues[0] as RawIssue
  } catch {
    // JSON でなければ issues 配列としては読めない（プレーンな Error）
  }
  return null
}

function pathHead(path: unknown): string | null {
  if (!Array.isArray(path) || path.length === 0) return null
  const head = path[0]
  return typeof head === 'string' ? head : null
}

export type FormError = { message: string; path: string | null }

/** メッセージと対象フィールド（Mantine の form.setFieldError にそのまま渡せる）を返す */
export function extractFormError(error: unknown): FormError {
  const issue = firstIssue(error)
  if (!issue) {
    const message = error instanceof Error && error.message ? error.message : ''
    return { message: JAPANESE_CHAR.test(message) ? message : DEFAULT_MESSAGE, path: null }
  }

  const path = pathHead(issue.path)
  const rawMessage = typeof issue.message === 'string' ? issue.message : ''
  if (JAPANESE_CHAR.test(rawMessage)) return { message: rawMessage, path }

  const code = typeof issue.code === 'string' ? (issue.code as ZodIssueCode) : undefined
  const mapped = path && code ? FIELD_CODE_MESSAGE[path]?.[code] : undefined
  return { message: mapped ?? DEFAULT_MESSAGE, path }
}

/** Notification 表示など、メッセージ文字列だけで足りるとき */
export function extractErrorMessage(error: unknown): string {
  return extractFormError(error).message
}
