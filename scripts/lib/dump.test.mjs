import assert from 'node:assert/strict'
import { test } from 'node:test'

import { orderTables, planRestore, referencesOf, splitStatements, tableNameOf } from './dump.mjs'

test('splits on semicolons outside string literals only', () => {
  const sql = `INSERT INTO "t" VALUES('a;b', 'it''s; fine');\nSELECT 1;\n`
  assert.deepEqual(splitStatements(sql), [
    `INSERT INTO "t" VALUES('a;b', 'it''s; fine');`,
    'SELECT 1;',
  ])
})

test('keeps a newline inside a string literal (newsletter bodies have many)', () => {
  const sql = `INSERT INTO "m" VALUES('line 1\nline 2;\nline 3');`
  assert.deepEqual(splitStatements(sql), [sql])
})

test('reads the table name of CREATE TABLE in the three quoting styles', () => {
  assert.equal(tableNameOf('CREATE TABLE `vendors` (id text)'), 'vendors')
  assert.equal(
    tableNameOf('CREATE TABLE IF NOT EXISTS "d1_migrations"(id integer)'),
    'd1_migrations',
  )
  assert.equal(tableNameOf('CREATE TABLE places (id text)'), 'places')
  assert.equal(tableNameOf('CREATE INDEX x ON y (z)'), null)
})

test('reads the referenced tables of a CREATE TABLE', () => {
  const stmt =
    'CREATE TABLE `places` (`id` text, `vendor_id` text REFERENCES `vendors`(`id`) ON DELETE set null, `property_id` text REFERENCES "properties"("id"), FOREIGN KEY (`x`) REFERENCES events(`id`))'
  assert.deepEqual(referencesOf(stmt), ['vendors', 'properties', 'events'])
})

test('orders parents before children and keeps a cycle in its original order', () => {
  const tables = new Map([
    ['events', ['places', 'vendors', 'properties']],
    ['places', ['vendors', 'properties']],
    ['properties', []],
    ['vendors', []],
    ['vendor_news', ['vendors', 'events', 'inbound_mails']],
    ['inbound_mails', ['vendors', 'vendor_news']],
    ['settings', []],
  ])
  const order = orderTables(tables)
  const at = (t) => order.indexOf(t)
  assert.ok(at('vendors') < at('places'))
  assert.ok(at('properties') < at('places'))
  assert.ok(at('places') < at('events'))
  assert.ok(at('events') < at('vendor_news'))
  // The mutual reference cannot be ordered; both come after everything they depend on
  assert.ok(at('vendors') < at('inbound_mails'))
  assert.ok(at('vendor_news') < at('inbound_mails'))
  assert.equal(order.length, 7)
  assert.deepEqual([...order].sort(), [...tables.keys()].sort())
})

test('plans a restore: tables first, rows in parent order, indexes last', () => {
  const dump = [
    'PRAGMA defer_foreign_keys=TRUE;',
    'CREATE TABLE IF NOT EXISTS "d1_migrations"(id INTEGER PRIMARY KEY);',
    'INSERT INTO "d1_migrations" VALUES(1);',
    'CREATE TABLE `events` (`id` text, `place_id` text REFERENCES `places`(`id`));',
    "INSERT INTO \"events\" VALUES('e1','p1');",
    'CREATE TABLE `places` (`id` text);',
    'INSERT INTO "places" VALUES(\'p1\');',
    'DELETE FROM sqlite_sequence;',
    'INSERT INTO "sqlite_sequence" VALUES(\'d1_migrations\',1);',
    'CREATE INDEX `events_place_idx` ON `events` (`place_id`);',
  ].join('\n')
  const plan = planRestore(dump)
  assert.deepEqual(plan.tableNames, ['d1_migrations', 'events', 'places'])
  assert.deepEqual(
    plan.drop,
    ['places', 'events', 'd1_migrations'].map((t) => `DROP TABLE IF EXISTS "${t}";`),
  )
  assert.equal(plan.tables.length, 3)
  assert.deepEqual(plan.rows, [
    'PRAGMA defer_foreign_keys=TRUE;',
    'INSERT INTO "d1_migrations" VALUES(1);',
    'INSERT INTO "places" VALUES(\'p1\');',
    "INSERT INTO \"events\" VALUES('e1','p1');",
    'INSERT INTO "sqlite_sequence" VALUES(\'d1_migrations\',1);',
  ])
  assert.deepEqual(plan.rest, [
    'DELETE FROM sqlite_sequence;',
    'CREATE INDEX `events_place_idx` ON `events` (`place_id`);',
  ])
})

test('a dump without statements plans nothing', () => {
  assert.deepEqual(planRestore('  \n'), {
    tableNames: [],
    drop: [],
    tables: [],
    rows: ['PRAGMA defer_foreign_keys=TRUE;'],
    rest: [],
  })
})
