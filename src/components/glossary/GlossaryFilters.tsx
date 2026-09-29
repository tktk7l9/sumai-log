import { Chip, Group, Stack, TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { GLOSSARY_CATEGORIES, type CategoryId } from '../../content/glossary'

const SEARCH_DEBOUNCE_MS = 250

/** Chip value for "no category filter" (not a category id) */
const ALL = 'all'

/**
 * The search bar + category chips of the glossary. The route (`glossary.tsx`) only reads
 * and writes `?q=` `?c=`, and the presentation is gathered here.
 *
 * The search field does not rewrite the URL on every key input (history would pile up on
 * every keystroke and the back button would go back only 1 character at a time). Input is
 * reflected in this state immediately, and after the debounce onQueryChange is called so
 * the route side reflects it with `replace: true`.
 * When `q` changes from outside (back/forward, opened directly with `?q=`, or `q` dropped
 * by a related term link), this state is only realigned to the search term and nothing is
 * written back to the URL.
 * The debounced value lags one beat behind the input, so navigate happens only when all 3
 * hold: "debounced changed", "that value matches the current input", and "it differs from
 * the latest `q`".
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

  // Hold the latest q / onQueryChange in refs so the effect below depends only on debounced.
  // If q were a dependency, the moment q changes from outside it would navigate with the
  // old debounced, and the back button or a related term link would be rolled back to the
  // previous search term.
  const qRef = useRef(q)
  qRef.current = q
  const onQueryChangeRef = useRef(onQueryChange)
  onQueryChangeRef.current = onQueryChange

  useEffect(() => {
    setInputValue(q ?? '')
  }, [q])

  useEffect(() => {
    if (debounced !== inputValue) return // drop values older than the input (e.g. right after an external change)
    if (debounced !== (qRef.current ?? '')) onQueryChangeRef.current(debounced)
    // inputValue is always the latest in a render where debounced changes, so it is not a
    // dependency
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
      {/* A single-choice chip group cannot be unticked, so "すべて" (All) comes first as the way
          back from one category to all of them (same as the candidates and sources filters;
          SHIG 6, 60) */}
      <Chip.Group
        value={category ?? ALL}
        onChange={(v) => onCategoryChange(v === ALL ? null : (v as CategoryId))}
      >
        <Group gap={6}>
          <Chip value={ALL} size="xs">
            すべて
          </Chip>
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
