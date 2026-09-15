import { Chip, Group, Stack, TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { GLOSSARY_CATEGORIES, type CategoryId } from '../../content/glossary'

const SEARCH_DEBOUNCE_MS = 250

/**
 * 用語集の検索バー + 分類チップ。route (`glossary.tsx`) は `?q=` `?c=` の
 * 読み書きだけを持ち、見た目はここにまとめる。
 *
 * 検索欄はキー入力ごとに URL を書き換えない（毎打鍵で履歴が積まれ、戻るボタンが
 * 1文字ずつしか戻らなくなるため）。入力はこの state に即時反映しつつ、
 * デバウンス後に onQueryChange を呼んで route 側に `replace: true` で反映させる。
 * `q` が外から変わったとき（戻る/進む、`?q=` 付きで直接開いた場合、関連語リンクで
 * `q` が落ちた場合）はこの state を検索語に合わせ直すだけで、URL には書き戻さない。
 * デバウンス値は入力より一拍遅れるので、「debounced が変わった」「その値が今の入力と
 * 一致している」「最新の `q` と違う」の 3 つが揃ったときだけ navigate する。
 */
export function GlossaryFilters({
  q,
  category,
  onQueryChange,
  onCategoryChange,
}: {
  q: string | undefined
  category: CategoryId | undefined
  onQueryChange: (value: string) => void
  onCategoryChange: (value: CategoryId | null) => void
}) {
  const [inputValue, setInputValue] = useState(q ?? '')
  const [debounced] = useDebouncedValue(inputValue, SEARCH_DEBOUNCE_MS)

  // 最新の q / onQueryChange を ref で持ち、下の effect の依存を debounced だけにする。
  // q を依存に入れると、外から q が変わった瞬間に古い debounced で navigate してしまい、
  // 戻るボタンや関連語リンクが直前の検索語に巻き戻される。
  const qRef = useRef(q)
  qRef.current = q
  const onQueryChangeRef = useRef(onQueryChange)
  onQueryChangeRef.current = onQueryChange

  useEffect(() => {
    setInputValue(q ?? '')
  }, [q])

  useEffect(() => {
    if (debounced !== inputValue) return // 入力より古い値（外部変更の直後など）は捨てる
    if (debounced !== (qRef.current ?? '')) onQueryChangeRef.current(debounced)
    // inputValue は debounced が変わる render では常に最新なので依存に入れない
  }, [debounced])

  return (
    <Stack gap="xs">
      <TextInput
        value={inputValue}
        onChange={(e) => setInputValue(e.currentTarget.value)}
        placeholder="用語・読みで検索"
        leftSection={<Search size={16} aria-hidden />}
        aria-label="用語・読みで検索"
      />
      <Chip.Group
        value={category ?? null}
        onChange={(v) => onCategoryChange((v as CategoryId | '') || null)}
      >
        <Group gap={6}>
          {GLOSSARY_CATEGORIES.map((cat) => (
            <Chip key={cat.id} value={cat.id} size="xs">
              {cat.label}
            </Chip>
          ))}
        </Group>
      </Chip.Group>
    </Stack>
  )
}
