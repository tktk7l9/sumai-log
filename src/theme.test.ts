/**
 * iOS Safari zooms the page when the focused field's text is smaller than 16px, and stays
 * zoomed after the keyboard closes. The theme's `md` is 16px (Mantine's own default, `sm`, is
 * 14px), so every Mantine component with a field that is typed into must default to `md`.
 *
 * Which components the app renders is read from its imports, not listed by hand: a form that
 * starts using another input fails here until the theme gives it the default.
 * A `size` written on one element still wins over the theme; this test does not see those.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { theme } from './theme'

const SRC = fileURLToPath(new URL('.', import.meta.url))

/** Mantine components (core and dates) whose field takes text from the keyboard */
const TEXT_ENTRY = new Set([
  'TextInput',
  'Textarea',
  'NumberInput',
  'PasswordInput',
  'JsonInput',
  'ColorInput',
  'PinInput',
  'MaskInput',
  'Autocomplete',
  'Select',
  'NativeSelect',
  'MultiSelect',
  'TagsInput',
  'PillsInput',
  'TreeSelect',
  'Cascader',
  'DateInput',
  'TimeInput',
  'TimePicker',
  'DateTimePicker',
])

/** Named like an input, but a button that opens a picker or a group of parts: nothing is typed */
const NOT_TYPED = new Set([
  'Input',
  'FileInput',
  'DatePickerInput',
  'MonthPickerInput',
  'YearPickerInput',
  'DatePicker',
  'MonthPicker',
  'YearPicker',
  'ColorPicker',
])

const INPUT_LIKE = /Input|Select|Textarea|Autocomplete|Picker|Cascader/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/** Every name the app imports from @mantine/core and @mantine/dates */
function mantineImports(): string[] {
  const names = new Set<string>()
  for (const file of sourceFiles(SRC)) {
    const code = readFileSync(file, 'utf8')
    for (const match of code.matchAll(
      /import\s*\{([^}]*)\}\s*from\s*'@mantine\/(?:core|dates)'/g,
    )) {
      for (const part of match[1].split(',')) {
        const name = part
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0]
        if (name) names.add(name)
      }
    }
  }
  return [...names].sort()
}

const imported = mantineImports()
const rendered = imported.filter((name) => TEXT_ENTRY.has(name))

describe('theme: text fields are 16px, so iOS does not zoom the page on focus', () => {
  it('reads the text-entry components from the app source', () => {
    // The scan found the forms: these are in almost every one of them
    expect(rendered).toEqual(expect.arrayContaining(['TextInput', 'Textarea', 'DateInput']))
  })

  it('has md at 16px', () => {
    expect(theme.fontSizes?.md).toBe('1rem')
  })

  it.each(rendered)('%s defaults to size md', (name) => {
    expect(theme.components?.[name]?.defaultProps).toMatchObject({ size: 'md' })
  })

  it('knows every input-like component the app imports', () => {
    // A new name: put it in TEXT_ENTRY (typed into) or NOT_TYPED, so it cannot slip through
    const undecided = imported.filter(
      (name) => INPUT_LIKE.test(name) && !TEXT_ENTRY.has(name) && !NOT_TYPED.has(name),
    )
    expect(undecided).toEqual([])
  })
})
