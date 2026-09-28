/**
 * Extracts a Japanese message from a createServerFn validator (zod) failure.
 *
 * When the validator (zod) of TanStack Start's createServerFn fails, the Error#message
 * received on the client is a JSON string of the issues array. zod's default messages are
 * English (e.g. "Too big: expected string to have <=30 characters"), so they are rephrased
 * into a concrete Japanese sentence from the field name and the code (too_big / too_small /
 * invalid_type / invalid_value). A message the server explicitly threw in Japanese (e.g.
 * "タグは 1 つ以上必要です" (At least 1 tag is required)) is used as is. When it cannot be
 * read as an issues array or the field is unknown, fall back to the generic
 * "保存できませんでした" (Could not save) (a last resort, so that one broad message is not
 * used for everything).
 */

const JAPANESE_CHAR = /[぀-ヿ㐀-鿿]/

const DEFAULT_MESSAGE = '保存できませんでした'

type ZodIssueCode = 'too_big' | 'too_small' | 'invalid_type' | 'invalid_value'

type RawIssue = {
  code?: unknown
  path?: unknown
  message?: unknown
}

/** Rephrasing per field and per code. A combination not listed here gets DEFAULT_MESSAGE */
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
  // The tag list on the settings screen (names in src/server/tags.ts: 1-30 characters x at
  // most 100 items)
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
    // If it is not JSON it cannot be read as an issues array (a plain Error)
  }
  return null
}

function pathHead(path: unknown): string | null {
  if (!Array.isArray(path) || path.length === 0) return null
  const head = path[0]
  return typeof head === 'string' ? head : null
}

export type FormError = { message: string; path: string | null }

/**
 * Returns the message and the target field (can be passed as is to Mantine's
 * form.setFieldError)
 */
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

/** For when the message string alone is enough, such as showing a Notification */
export function extractErrorMessage(error: unknown): string {
  return extractFormError(error).message
}
