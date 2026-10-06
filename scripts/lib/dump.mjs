/**
 * Pure part of the backup / restore scripts: turns a `wrangler d1 export` file into pieces
 * that D1 accepts back.
 *
 * The export writes each table's CREATE TABLE followed by its INSERTs, in schema order. With
 * foreign keys on, SQLite refuses an INSERT into a child table whose parent table does not
 * exist yet (`no such table: main.places`), so the file as exported fails half way
 * (found on 2026-10-06 when restoring the production snapshot locally). Loading all tables
 * first, then the rows parents-first, then the indexes gets it through; a mutual reference
 * (vendor_news <-> inbound_mails) is covered by `PRAGMA defer_foreign_keys` inside the one
 * transaction a `--file` run is.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DEFER = 'PRAGMA defer_foreign_keys=TRUE;'

/** Splits SQL text into statements; a `;` inside a string literal does not end a statement */
export function splitStatements(sql) {
  const out = []
  let start = 0
  let inString = false
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    if (ch === "'") {
      if (inString && sql[i + 1] === "'") {
        i++
        continue
      }
      inString = !inString
    } else if (ch === ';' && !inString) {
      const stmt = sql.slice(start, i + 1).trim()
      if (stmt) out.push(stmt)
      start = i + 1
    }
  }
  const tail = sql.slice(start).trim()
  if (tail) out.push(tail)
  return out
}

const IDENT = '(?:`([^`]+)`|"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))'
const CREATE_TABLE = new RegExp(`^CREATE TABLE (?:IF NOT EXISTS )?${IDENT}`, 'i')
const REFERENCES = new RegExp(`REFERENCES ${IDENT}`, 'gi')
const INSERT_INTO = new RegExp(`^INSERT INTO ${IDENT}`, 'i')

function ident(match) {
  return match[1] ?? match[2] ?? match[3]
}

/** The table a CREATE TABLE statement creates, or null for any other statement */
export function tableNameOf(stmt) {
  const m = stmt.match(CREATE_TABLE)
  return m ? ident(m) : null
}

/** The tables a CREATE TABLE statement references, in order of appearance, without repeats */
export function referencesOf(stmt) {
  const seen = []
  for (const m of stmt.matchAll(REFERENCES)) {
    const name = ident(m)
    if (!seen.includes(name)) seen.push(name)
  }
  return seen
}

function insertTableOf(stmt) {
  const m = stmt.match(INSERT_INTO)
  return m ? ident(m) : null
}

/**
 * Parents before children (Kahn's algorithm over the REFERENCES). Tables left over by a cycle
 * are appended in their original order; references to tables not in the map are ignored.
 * `tables` maps a table name to the tables it references.
 */
export function orderTables(tables) {
  const names = [...tables.keys()]
  const pending = new Map(
    names.map((t) => [t, new Set((tables.get(t) ?? []).filter((p) => p !== t && tables.has(p)))]),
  )
  const out = []
  while (pending.size > 0) {
    const ready = names.filter((t) => pending.has(t) && pending.get(t).size === 0)
    if (ready.length === 0) break
    for (const t of ready) {
      out.push(t)
      pending.delete(t)
      for (const deps of pending.values()) deps.delete(t)
    }
  }
  for (const t of names) if (pending.has(t)) out.push(t)
  return out
}

/**
 * The statements of an export, regrouped for loading: `drop` (children first) to start from
 * an empty database, `tables`, `rows` (parents first, under PRAGMA defer_foreign_keys) and
 * `rest` (indexes and sqlite_sequence maintenance).
 */
export function planRestore(sql) {
  const statements = splitStatements(sql)
  const tables = []
  const inserts = []
  const rest = []
  const refs = new Map()
  for (const s of statements) {
    const table = tableNameOf(s)
    if (table) {
      tables.push(s)
      refs.set(table, referencesOf(s))
    } else if (insertTableOf(s)) inserts.push(s)
    else if (/^PRAGMA /i.test(s)) continue
    else rest.push(s)
  }
  const order = orderTables(refs)
  const rank = (s) => {
    const i = order.indexOf(insertTableOf(s))
    // Tables not created by the dump (sqlite_sequence) go last
    return i === -1 ? order.length : i
  }
  const rows = inserts
    .map((s, i) => ({ s, i, rank: rank(s) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.s)
  const tableNames = [...refs.keys()]
  return {
    tableNames,
    drop: [...tableNames].reverse().map((t) => `DROP TABLE IF EXISTS "${t}";`),
    tables,
    rows: [DEFER, ...rows],
    rest,
  }
}

/**
 * Writes the pieces of planRestore next to the dump, as `<dump>.restore/0-drop.sql` …
 * `3-rest.sql`, and returns their paths in the order to run them
 */
export function writeRestorePlan(dumpPath) {
  const plan = planRestore(readFileSync(dumpPath, 'utf8'))
  const dir = `${dumpPath}.restore`
  mkdirSync(dir, { recursive: true })
  const files = [
    ['0-drop.sql', plan.drop],
    ['1-tables.sql', plan.tables],
    ['2-rows.sql', plan.rows],
    ['3-rest.sql', plan.rest],
  ].map(([name, statements]) => {
    const file = resolve(dir, name)
    writeFileSync(file, statements.join('\n') + '\n')
    return file
  })
  return { dir, files, tables: plan.tableNames.length, rows: plan.rows.length - 1 }
}
