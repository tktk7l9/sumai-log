/**
 * Keeps large modules out of the JavaScript every page downloads first.
 *
 * The router splits a route's `component` into its own chunk, but not `validateSearch`,
 * `loader` or `head`: whatever those import, and whatever a shared component imports, lands in
 * the entry chunk of every page. One import line is enough to put a whole module there, and
 * nothing fails when it happens (the glossary, 52.6 KB gzip, was in the entry of every page
 * until 2026-11-12; drizzle-orm with every table definition, 7.7 KB gzip, came in through the
 * enum arrays and label maps that used to live in src/db/schema.ts).
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
/** `names` are the imported names that survive compilation; '*' for a namespace or `export *` */
type ValueImport = { module: string; how: How; names: string[] }
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

/**
 * The table definitions, with drizzle-orm. The enum arrays, label maps and their types that
 * the pages need are in src/db/enums.ts (schema.ts re-exports them for the server code).
 */
const DB_SCHEMA = 'src/db/schema'
const DB_ENUMS = 'src/db/enums'

/** Code the browser runs: pages, components, pure functions, content, and the zod schemas of
 * the server functions (a validator stays in the client build; a handler does not) */
function isClientCode(file: string): boolean {
  return (
    /^src\/(routes|components|lib|content)\//.test(file) ||
    /^src\/server\/.*\.schema\.ts$/.test(file)
  )
}

/** Client code allowed to import the tables as a value, with why. */
const DB_SCHEMA_ALLOWED: Record<string, string> = {
  'src/routes/api.photos.$.tsx':
    'a server route: the table is used inside `server.handlers`, which the Start compiler removes from the client build',
}

/** A module with server functions (src/server/*.ts): the client build keeps its top level
 * (validators, constants) and drops the handlers */
function isServerFunctionModule(file: string): boolean {
  return /^src\/server\/[^/]+\.ts$/.test(file)
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
  const add = (source: unknown, how: How, names: string[]) => {
    const module = resolve(file, source)
    if (module !== null) found.push({ module, how, names })
  }
  /** The names a statement takes from the module: `imported` of an import, `local` of a re-export */
  const namesOf = (specifiers: Node[], kindKey: string, nameKey: string) =>
    specifiers
      .filter((s) => s[kindKey] !== 'type')
      .map((s) => {
        if (s.type !== 'ImportSpecifier' && s.type !== 'ExportSpecifier') {
          return s.type === 'ImportDefaultSpecifier' ? 'default' : '*'
        }
        const name = s[nameKey] as Node
        return String(name.type === 'Literal' ? name.value : name.name)
      })
  for (const n of walk(parse(code, file))) {
    const source = (n.source as Node | null | undefined)?.value
    const specifiers = (n.specifiers ?? []) as Node[]
    if (n.type === 'ImportDeclaration') {
      if (carriesValue(n.importKind, specifiers, 'importKind'))
        add(source, 'static', namesOf(specifiers, 'importKind', 'imported'))
    } else if (n.type === 'ExportNamedDeclaration' && n.source) {
      if (carriesValue(n.exportKind, specifiers, 'exportKind'))
        add(source, 'static', namesOf(specifiers, 'exportKind', 'local'))
    } else if (n.type === 'ExportAllDeclaration') {
      if (n.exportKind !== 'type') add(source, 'static', ['*'])
    } else if (n.type === 'ImportExpression') {
      add(source, 'dynamic', ['*'])
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

/** The values a module declares and exports (`export const X`, `export function f`) */
function exportedValuesOf(code: string, file: string): string[] {
  const program = parse(code, file)
  return (program.body as Node[]).flatMap((n) => {
    const declaration = n.type === 'ExportNamedDeclaration' ? (n.declaration as Node | null) : null
    if (!declaration) return []
    if (declaration.type === 'VariableDeclaration') {
      return (declaration.declarations as Node[]).map((d) => String((d.id as Node).name))
    }
    return declaration.type === 'FunctionDeclaration' ? [String((declaration.id as Node).name)] : []
  })
}

describe('the table definitions (src/db/schema.ts, with drizzle-orm)', () => {
  it('are not imported as a value by code the browser runs', () => {
    const importers = usage
      .filter(
        ({ file, imports }) => isClientCode(file) && imports.some((i) => i.module === DB_SCHEMA),
      )
      .map(({ file }) => file)
    expect(importers.sort()).toEqual(Object.keys(DB_SCHEMA_ALLOWED).sort())
  })

  it('are not where client code or a server function module takes an enum from', () => {
    const enumsFile = join(ROOT, `${DB_ENUMS}.ts`)
    const enums = new Set(exportedValuesOf(readFileSync(enumsFile, 'utf8'), enumsFile))
    // The guard would pass on an empty list
    expect(enums.size).toBeGreaterThan(10)
    const viaSchema = usage
      .filter(({ file }) => isClientCode(file) || isServerFunctionModule(file))
      .flatMap(({ file, imports }) =>
        imports
          .filter((i) => i.module === DB_SCHEMA)
          .flatMap((i) => i.names.filter((name) => enums.has(name)))
          .map((name) => `${file}: ${name}`),
      )
    expect(viaSchema).toEqual([])
  })

  it('share no drizzle import with the enums', () => {
    const file = `${DB_ENUMS}.ts`
    const path = join(ROOT, file)
    const code = readFileSync(path, 'utf8')
    expect(valueImportsOf(code, file)).toEqual([])
    const packages = [...walk(parse(code, path))]
      .filter((n) => n.type === 'ImportDeclaration' || n.type === 'ImportExpression')
      .map((n) => (n.source as Node).value)
    expect(packages).toEqual([])
  })
})

describe('the scan', () => {
  const imports = (code: string, file = 'src/routes/sample.tsx') =>
    valueImportsOf(code, file).map(({ module, how }) => ({ module, how }))

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

  it('tells which names an import takes as values', () => {
    const names = (code: string) => valueImportsOf(code, 'src/server/sample.ts')[0]?.names
    expect(names("import { TODO_LISTS, todos, type Todo } from '../db/schema'")).toEqual([
      'TODO_LISTS',
      'todos',
    ])
    expect(names("import { TODO_LISTS as LISTS } from '../db/schema'")).toEqual(['TODO_LISTS'])
    expect(names("export { TODO_LISTS as LISTS, type Todo } from '../db/schema'")).toEqual([
      'TODO_LISTS',
    ])
    expect(names("import * as schema from '../db/schema'")).toEqual(['*'])
    expect(names("import schema from '../db/schema'")).toEqual(['default'])
    expect(names("export * from '../db/schema'")).toEqual(['*'])
    expect(names("import '../db/schema'")).toEqual([])
  })

  it('lists the values a module exports', () => {
    expect(
      exportedValuesOf(
        "export const A = ['a'] as const, B = 1\nexport type T = string\nexport function f() {}\nconst hidden = 1\nexport { hidden }",
        'sample.ts',
      ),
    ).toEqual(['A', 'B', 'f'])
  })

  it('knows which files the browser runs', () => {
    expect(isClientCode('src/routes/todos.tsx')).toBe(true)
    expect(isClientCode('src/components/todos/TodoRow.tsx')).toBe(true)
    expect(isClientCode('src/lib/todos.ts')).toBe(true)
    expect(isClientCode('src/server/todos.schema.ts')).toBe(true)
    expect(isClientCode('src/server/todos.ts')).toBe(false)
    expect(isClientCode('src/server/repository/todos.ts')).toBe(false)
    expect(isClientCode('src/db/client.ts')).toBe(false)
    expect(isServerFunctionModule('src/server/todos.ts')).toBe(true)
    expect(isServerFunctionModule('src/server/repository/todos.ts')).toBe(false)
  })

  it('fails on a file it cannot parse, instead of skipping it', () => {
    expect(() => imports('const = ;')).toThrow(/cannot parse/)
  })
})
