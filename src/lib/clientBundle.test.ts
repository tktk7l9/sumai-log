/**
 * Keeps large modules out of the JavaScript every page downloads first.
 *
 * The router splits a route's `component` into its own chunk, but not `validateSearch`,
 * `loader` or `head`: whatever those import, and whatever a shared component imports, lands in
 * the entry chunk of every page. One import line is enough to put a whole module there, and
 * nothing fails when it happens (the glossary, 52.6 KB gzip, was in the entry of every page
 * until 2026-11-12).
 *
 * This test reads the import lines of the app source (AST, oxc through vite's parseSync) and
 * allows a value import of a guarded module only from the files listed with their reason.
 * `import type` and `import { type X }` are erased by the compiler (`verbatimModuleSyntax`) and
 * are always fine. What the test cannot see is where inside an allowed file the import is used;
 * the reasons below say what must stay true. Check a change against the build
 * (`npm run build`, then the entry's imports under dist/client/assets/).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, posix, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseSync } from 'vite'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

type Node = { type: string; [key: string]: unknown }
type How = 'static' | 'dynamic'
type ValueImport = { module: string; how: How }
type Allowlist = Record<string, { how: How; why: string }>

/** Every term of the glossary with its body (164 KB). The small lists are in glossaryCategories.ts */
const GLOSSARY_TERMS = 'src/content/glossary'

const GLOSSARY_TERMS_ALLOWED: Allowlist = {
  'src/routes/glossary.tsx': {
    how: 'static',
    why: 'the list page filters every term in the browser. Used by the page component only, which the router splits out of the entry; validateSearch must not use it',
  },
  'src/routes/glossary_.$termId.tsx': {
    how: 'dynamic',
    why: 'the loader is not split, so it loads the terms when a term page is opened',
  },
  'src/server/glossary.ts': {
    how: 'static',
    why: 'used inside a server function handler, which the Start compiler removes from the client build',
  },
  'src/server/roadmap.ts': {
    how: 'static',
    why: 'used inside a server function handler, which the Start compiler removes from the client build',
  },
  'src/server/analysis.ts': {
    how: 'static',
    why: 'used inside a server function handler, which the Start compiler removes from the client build',
  },
}

function* walk(value: unknown): Generator<Node> {
  if (Array.isArray(value)) {
    for (const item of value) yield* walk(item)
    return
  }
  if (!value || typeof value !== 'object') return
  const node = value as Node
  if (typeof node.type === 'string') yield node
  for (const [key, child] of Object.entries(node)) {
    if (key !== 'parent' && child && typeof child === 'object') yield* walk(child)
  }
}

function parse(code: string, file: string): Node {
  const result = parseSync(file, code)
  // A file the parser cannot read could hide an import, so it fails the guard
  if (result.errors.length > 0)
    throw new Error(`cannot parse ${file}: ${result.errors[0]!.message}`)
  return result.program as unknown as Node
}

/** `src/…` path of a relative import, without the extension. null for a package */
function resolve(file: string, source: unknown): string | null {
  if (typeof source !== 'string' || !source.startsWith('.')) return null
  return posix.join(posix.dirname(file), source).replace(/\.tsx?$/, '')
}

/** True when the statement or one of its names survives compilation (is not type-only) */
function carriesValue(kind: unknown, specifiers: Node[], kindKey: string): boolean {
  if (kind === 'type') return false
  return specifiers.length === 0 || specifiers.some((s) => s[kindKey] !== 'type')
}

/** The app modules a file imports or re-exports as values. `file` is relative to the repo */
function valueImportsOf(code: string, file: string): ValueImport[] {
  const found: ValueImport[] = []
  const add = (source: unknown, how: How) => {
    const module = resolve(file, source)
    if (module !== null) found.push({ module, how })
  }
  for (const n of walk(parse(code, file))) {
    const source = (n.source as Node | null | undefined)?.value
    if (n.type === 'ImportDeclaration') {
      if (carriesValue(n.importKind, n.specifiers as Node[], 'importKind')) add(source, 'static')
    } else if (n.type === 'ExportNamedDeclaration' && n.source) {
      if (carriesValue(n.exportKind, n.specifiers as Node[], 'exportKind')) add(source, 'static')
    } else if (n.type === 'ExportAllDeclaration') {
      if (n.exportKind !== 'type') add(source, 'static')
    } else if (n.type === 'ImportExpression') {
      add(source, 'dynamic')
    }
  }
  return found
}

/** App source under src/. Tests never reach the page. */
function appSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return appSourceFiles(path)
    if (!/\.tsx?$/.test(entry.name) || /\.d\.ts$/.test(entry.name)) return []
    if (/\.(test|ui\.test|worker-test)\.tsx?$/.test(entry.name)) return []
    return [path]
  })
}

const usage = appSourceFiles(join(ROOT, 'src')).map((path) => {
  const file = relative(ROOT, path).split(sep).join('/')
  return { file, imports: valueImportsOf(readFileSync(path, 'utf8'), file) }
})

/** `file: how` of every value import of `module` */
function importersOf(module: string): string[] {
  return usage.flatMap(({ file, imports }) =>
    imports.filter((i) => i.module === module).map((i) => `${file}: ${i.how}`),
  )
}

function allowed(list: Allowlist): string[] {
  return Object.entries(list).map(([file, { how }]) => `${file}: ${how}`)
}

describe('the glossary terms (src/content/glossary.ts)', () => {
  it('are imported as a value only by the allowlisted files, each in the allowed way', () => {
    expect(importersOf(GLOSSARY_TERMS).sort()).toEqual(allowed(GLOSSARY_TERMS_ALLOWED).sort())
  })
})

describe('the scan', () => {
  const imports = (code: string, file = 'src/routes/sample.tsx') => valueImportsOf(code, file)

  it.each([
    ["import { GLOSSARY } from '../content/glossary'", 'static'],
    ["import { GLOSSARY, type GlossaryTerm } from '../content/glossary'", 'static'],
    ["import * as glossary from '../content/glossary'", 'static'],
    ["import '../content/glossary'", 'static'],
    ["import { GLOSSARY } from '../content/glossary.ts'", 'static'],
    ["export { GLOSSARY } from '../content/glossary'", 'static'],
    ["export * from '../content/glossary'", 'static'],
    ["const load = () => import('../content/glossary')", 'dynamic'],
  ])('finds %s', (code, how) => {
    expect(imports(code)).toEqual([{ module: 'src/content/glossary', how }])
  })

  it.each([
    ["import type { GlossaryTerm } from '../content/glossary'"],
    ["import { type GlossaryTerm, type CategoryId } from '../content/glossary'"],
    ["export type { GlossaryTerm } from '../content/glossary'"],
    ["export { type GlossaryTerm } from '../content/glossary'"],
    ["export type * from '../content/glossary'"],
    ["type Term = import('../content/glossary').GlossaryTerm\nexport {}"],
    ["// import { GLOSSARY } from '../content/glossary'\nexport {}"],
    ["import { z } from 'zod'"],
    ['const load = (name: string) => import(name)'],
    ['export const local = 1'],
  ])('ignores %s', (code) => {
    expect(imports(code)).toEqual([])
  })

  it('resolves the path from the importing file', () => {
    expect(
      imports("import { GLOSSARY } from '../../content/glossary'", 'src/components/home/A.tsx'),
    ).toEqual([{ module: 'src/content/glossary', how: 'static' }])
    expect(imports("import { GLOSSARY } from './glossary'", 'src/content/roadmap.ts')).toEqual([
      { module: 'src/content/glossary', how: 'static' },
    ])
  })

  it('fails on a file it cannot parse, instead of skipping it', () => {
    expect(() => imports('const = ;')).toThrow(/cannot parse/)
  })
})
