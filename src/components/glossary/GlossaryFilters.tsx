import { Chip, Group, Stack, TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'

import { GLOSSARY_CATEGORIES, type CategoryId } from '../../content/glossary'

const SEARCH_DEBOUNCE_MS = 250

/**
 * 用語集の検索バー + 分類チップ。route (`glossary.tsx`) は `?q=` `?c=` の
 * 読み書きだけを持ち、見た目はここにまとめる。
 *
 * 検索欄はキー入力ごとに URL を書き換えない（毎打鍵で履歴が積まれ、戻るボタンが
 * 1文字ずつしか戻らなくなるため）。入力はこの state に即時反映しつつ、
 * デバウンス後に onQueryChange を呼んで route 側に `replace: true` で反映させる。
 * `q` が外から変わったとき（戻る/進む、`?q=` 付きで直接開いた場合）は
 * この state を検索語に合わせ直す。
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

  useEffect(() => {
    setInputValue(q ?? '')
  }, [q])

  useEffect(() => {
    if (debounced !== (q ?? '')) onQueryChange(debounced)
  }, [debounced, q, onQueryChange])

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
