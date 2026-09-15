import { Chip, Group, Stack, TextInput } from '@mantine/core'
import { Search } from 'lucide-react'

import { GLOSSARY_CATEGORIES, type CategoryId } from '../../content/glossary'

/**
 * 用語集の検索バー + 分類チップ。route (`glossary.tsx`) は `?q=` `?c=` の
 * 読み書きだけを持ち、見た目はここにまとめる。
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
  return (
    <Stack gap="xs">
      <TextInput
        value={q ?? ''}
        onChange={(e) => onQueryChange(e.currentTarget.value)}
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
