/**
 * Guards the trust boundary the script nonce relies on (src/lib/scriptNonce.ts).
 *
 * The Worker stamps the nonce on every inline <script> of the server-rendered HTML and cannot
 * tell an injected one from TanStack's own, so markup that comes with the data (imported mail
 * bodies, fetched vendor news, anything typed into a form) must never reach the HTML or the DOM
 * as markup. React escapes the text it renders, and TanStack escapes the loader data it writes
 * into its hydration script. This test keeps the ways around React out of the app source:
 * - raw-HTML sinks (RAW_HTML_SINKS) are allowed nowhere: RAW_HTML_ALLOWED is empty;
 * - ways of writing a <script> (SCRIPT_EMITTERS) are allowed only where the script is a
 *   constant (SCRIPT_ALLOWED, each with its reason).
 * Imported mail bodies stay text: `{body}` inside Mantine's <Text> (NewsEventDrawer,
 * MailImportCard); src/routes/news.ui.test.tsx opens a newsletter with a hostile body.
 *
 * The scan reads the AST (oxc, through vite's parseSync): a mention in a comment, in JSX text or
 * inside a longer string does not count. A dependency that writes raw HTML is outside the scan;
 * review one before adding it.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseSync } from 'vite'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** Ways to turn a string into markup in the DOM or the HTML. */
const RAW_HTML_SINKS = new Set([
  'dangerouslySetInnerHTML',
  'innerHTML',
  'outerHTML',
  'insertAdjacentHTML',
  'srcdoc',
  'srcDoc',
  'createContextualFragment',
  'setHTMLUnsafe',
  'parseHTMLUnsafe',
  'DOMParser',
  'document.write',
  'document.writeln',
])

/** Ways to write a <script> of our own into the page. */
const SCRIPT_EMITTERS = new Set([
  // a <script> element in JSX, or createElement('script')
  '<script>',
  // TanStack's one-off SSR script, Mantine's colour scheme script
  'ScriptOnce',
  'ColorSchemeScript',
  // the `scripts` of a route's head() / scripts() options
  'scripts',
])

type Allowlist = Record<string, Record<string, string>>

/** Files allowed to use a raw-HTML sink, per sink, with why. Keep it empty. */
const RAW_HTML_ALLOWED: Allowlist = {}

/** Files allowed to write a <script>, per emitter, with why its content is a constant. */
const SCRIPT_ALLOWED: Allowlist = {
  'src/routes/__root.tsx': {
    ColorSchemeScript: "Mantine's colour scheme script, from the literal props in this file",
    ScriptOnce: 'ZOD_JITLESS_SCRIPT (src/lib/zodJitless.ts), a constant',
  },
}

type Node = { type: string; [key: string]: unknown }

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

/** The name an identifier, a JSX name, a string literal or a plain template literal spells. */
function nameOf(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null
  const n = node as Node
  if (n.type === 'Identifier' || n.type === 'JSXIdentifier') return n.name as string
  if (n.type === 'Literal' && typeof n.value === 'string') return n.value
  if (n.type === 'TemplateLiteral' && (n.expressions as unknown[]).length === 0) {
    return (n.quasis as { value: { cooked: string | null } }[])[0]?.value.cooked ?? null
  }
  return null
}

function parse(code: string, file: string): Node {
  const result = parseSync(file, code)
  // A file the parser cannot read could hide a sink, so it fails the guard
  if (result.errors.length > 0)
    throw new Error(`cannot parse ${file}: ${result.errors[0]!.message}`)
  return result.program as unknown as Node
}

/** Spotted by name alone (an identifier, a JSX name or a string); the rest by their shape. */
const BY_NAME = new Set(
  [...RAW_HTML_SINKS, ...SCRIPT_EMITTERS].filter((s) => /^\w+$/.test(s) && s !== 'scripts'),
)

/** The raw-HTML sinks and script emitters a piece of code uses. */
function usesIn(code: string, file: string): Set<string> {
  const found = new Set<string>()
  for (const n of walk(parse(code, file))) {
    const name = nameOf(n)
    if (name !== null && BY_NAME.has(name)) found.add(name)
    if (n.type === 'MemberExpression') {
      // document.write(…), window.document.writeln(…), document['write'](…)
      const object = n.object as Node
      const owner = object.type === 'MemberExpression' ? nameOf(object.property) : nameOf(object)
      const member = nameOf(n.property)
      if (owner === 'document' && (member === 'write' || member === 'writeln')) {
        found.add(`document.${member}`)
      }
    } else if (n.type === 'JSXOpeningElement' && nameOf(n.name) === 'script') {
      found.add('<script>')
    } else if (n.type === 'CallExpression') {
      // createElement('script'), from document or React
      const callee = n.callee as Node
      const fn = nameOf(callee.type === 'MemberExpression' ? callee.property : callee)
      if (fn === 'createElement' && nameOf((n.arguments as Node[])[0]) === 'script') {
        found.add('<script>')
      }
    } else if (n.type === 'Property' && !n.computed && nameOf(n.key) === 'scripts') {
      // Only as an option key: a variable called `scripts` writes nothing
      found.add('scripts')
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

const usage = appSourceFiles(join(ROOT, 'src')).map((path) => ({
  file: relative(ROOT, path).split(sep).join('/'),
  uses: usesIn(readFileSync(path, 'utf8'), path),
}))

function outsideAllowlist(kind: Set<string>, allowed: Allowlist): string[] {
  return usage.flatMap(({ file, uses }) =>
    [...uses].filter((u) => kind.has(u) && !allowed[file]?.[u]).map((u) => `${file}: ${u}`),
  )
}

function staleEntries(allowed: Allowlist): string[] {
  return Object.entries(allowed).flatMap(([file, entries]) =>
    Object.keys(entries)
      .filter((u) => !usage.find((x) => x.file === file)?.uses.has(u))
      .map((u) => `${file}: ${u}`),
  )
}

describe('raw-HTML sinks', () => {
  it('appear nowhere in the app source', () => {
    expect(outsideAllowlist(RAW_HTML_SINKS, RAW_HTML_ALLOWED)).toEqual([])
  })

  it('have no allowlist entry left that nothing uses', () => {
    expect(staleEntries(RAW_HTML_ALLOWED)).toEqual([])
  })
})

describe('scripts written by the app', () => {
  it('come only from the allowlisted places', () => {
    expect(outsideAllowlist(SCRIPT_EMITTERS, SCRIPT_ALLOWED)).toEqual([])
  })

  it('have no allowlist entry left that nothing uses', () => {
    expect(staleEntries(SCRIPT_ALLOWED)).toEqual([])
  })

  it('are constants in src/routes/__root.tsx', () => {
    const file = join(ROOT, 'src/routes/__root.tsx')
    const elements = [...walk(parse(readFileSync(file, 'utf8'), file))].filter(
      (n) => n.type === 'JSXElement',
    )
    const named = (name: string) =>
      elements.filter((n) => nameOf((n.openingElement as Node).name) === name)

    // <ScriptOnce>{ZOD_JITLESS_SCRIPT}</ScriptOnce> and nothing else
    const scriptOnce = named('ScriptOnce')
    expect(scriptOnce).toHaveLength(1)
    const children = (scriptOnce[0]!.children as Node[]).filter(
      (c) => !(c.type === 'JSXText' && String(c.value).trim() === ''),
    )
    expect(children.map((c) => `${c.type}:${nameOf(c.expression)}`)).toEqual([
      'JSXExpressionContainer:ZOD_JITLESS_SCRIPT',
    ])

    // <ColorSchemeScript> with literal props only
    const colorScheme = named('ColorSchemeScript')
    expect(colorScheme).toHaveLength(1)
    const attributes = (colorScheme[0]!.openingElement as Node).attributes as Node[]
    for (const attribute of attributes)
      expect((attribute.value as Node | null)?.type).toBe('Literal')
  })
})

describe('the scan', () => {
  const uses = (code: string, ext = '.tsx') => [...usesIn(code, `sample${ext}`)]

  it.each([
    ['<div dangerouslySetInnerHTML={{ __html: x }} />', 'dangerouslySetInnerHTML'],
    ["createElement('div', { dangerouslySetInnerHTML: { __html: x } })", 'dangerouslySetInnerHTML'],
    ["const p = { ['dangerouslySetInnerHTML']: h }", 'dangerouslySetInnerHTML'],
    ['el.innerHTML = body', 'innerHTML'],
    ["el['outerHTML'] = body", 'outerHTML'],
    ['el[`innerHTML`] = body', 'innerHTML'],
    ["el.insertAdjacentHTML('beforeend', body)", 'insertAdjacentHTML'],
    ['<iframe srcDoc={body} />', 'srcDoc'],
    ['frame.srcdoc = body', 'srcdoc'],
    ['range.createContextualFragment(body)', 'createContextualFragment'],
    ['el.setHTMLUnsafe(body)', 'setHTMLUnsafe'],
    ['Document.parseHTMLUnsafe(body)', 'parseHTMLUnsafe'],
    ["new DOMParser().parseFromString(body, 'text/html')", 'DOMParser'],
    ['document.write(body)', 'document.write'],
    ['window.document.writeln(body)', 'document.writeln'],
    ["document['write'](body)", 'document.write'],
    ['const s = <script>{code}</script>', '<script>'],
    ["document.createElement('script')", '<script>'],
    ["React.createElement('script', null, code)", '<script>'],
    ['<ScriptOnce>{code}</ScriptOnce>', 'ScriptOnce'],
    ['<ColorSchemeScript />', 'ColorSchemeScript'],
    ['const route = { head: () => ({ scripts: [{ children: code }] }) }', 'scripts'],
  ])('finds %s', (code, sink) => {
    expect(uses(code)).toContain(sink)
  })

  it.each([
    ['// el.innerHTML = body\nexport {}'],
    ['/* dangerouslySetInnerHTML */ export {}'],
    ['const p = <p>innerHTML and document.write</p>'],
    ["const message = 'never use innerHTML here'"],
    ['writer.write(chunk); stream.write(chunk)'],
    ['const scripts = []; scripts.push(1)'],
    ["document.createElement('div')"],
  ])('ignores %s', (code) => {
    expect(uses(code)).toEqual([])
  })

  it('reads TypeScript without JSX too', () => {
    expect(uses('const el: HTMLElement = x; el.innerHTML = String(y as unknown)', '.ts')).toEqual([
      'innerHTML',
    ])
  })

  it('fails on a file it cannot parse, instead of skipping it', () => {
    expect(() => uses('const = ;')).toThrow(/cannot parse/)
  })
})
