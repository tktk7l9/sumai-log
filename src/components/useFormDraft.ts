import { useCallback, useEffect, useRef, useState } from 'react'

import { parseDraft, sameValues, serializeDraft } from '../lib/drafts'

/** 下書きを書き込むまでの待ち（ms）。打つたびに書かない */
const WRITE_DELAY = 400

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // プライベートモード等で書けなくてもフォームはそのまま使える
  }
}

type DraftForm<T> = { values: T; setValues: (values: T) => void }

/**
 * フォームの書きかけを端末に残す。Drawer の外側タップ・スワイプ・× で閉じても入力が消えず、
 * 開き直すと戻る（確認ダイアログは出さない）。初期値と同じなら下書きは消す。
 * 保存できたら clear() を呼ぶ。restored が true の間は DraftNotice で「破棄」を出す
 */
export function useFormDraft<T>(form: DraftForm<T>, key: string, initial: T) {
  const [restored, setRestored] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopped = useRef(false)
  const initialRef = useRef(initial)

  // 開いたときに一度だけ下書きを読む
  useEffect(() => {
    const draft = parseDraft<T>(readStorage(key), Date.now())
    if (draft && !sameValues(draft, initialRef.current)) {
      form.setValues({ ...initialRef.current, ...draft })
      setRestored(true)
    }
    // form は毎回別オブジェクトになりうるので、鍵が変わったときだけ読む
  }, [key])

  // 入力のたびに（少し待ってから）書く
  useEffect(() => {
    if (stopped.current) return
    if (timer.current) clearTimeout(timer.current)
    const values = form.values
    timer.current = setTimeout(() => {
      if (stopped.current) return
      writeStorage(
        key,
        sameValues(values, initialRef.current) ? null : serializeDraft(values, Date.now()),
      )
    }, WRITE_DELAY)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [form.values, key])

  /** 保存できたとき: 下書きを消し、以後は書かない */
  const clear = useCallback(() => {
    stopped.current = true
    if (timer.current) clearTimeout(timer.current)
    writeStorage(key, null)
    setRestored(false)
  }, [key])

  /** 続けて入力するとき: 下書きを消し、新しい初期値から書き直す */
  const restart = useCallback(
    (next: T) => {
      if (timer.current) clearTimeout(timer.current)
      writeStorage(key, null)
      initialRef.current = next
      stopped.current = false
      setRestored(false)
    },
    [key],
  )

  /** 復元した下書きを捨てて、開いたときの値に戻す */
  const discard = useCallback(() => {
    writeStorage(key, null)
    form.setValues(initialRef.current)
    setRestored(false)
  }, [form, key])

  return { restored, clear, restart, discard }
}
