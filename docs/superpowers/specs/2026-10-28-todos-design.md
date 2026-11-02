# Todos (やること) — design

Date: 2026-10-28. Owner's request: manage household to-dos (the move, the partner's account
security, NISA and other money tasks) inside sumai-log so both of them see the same list. The
owner handed the design decisions to the builder ("任せる"); every choice below is the
builder's call unless marked as the owner's.

## Intent

The move to the new rental (Nov 2026) and the partner's account cleanup produced a list of
tasks that lived only in the owner's private vault. The partner could not see her own items
and the owner had to ask. One shared list, grouped by urgency, with a checkbox per item.

## Goals / non-goals

- Goals: add, edit, tick off, delete; assign to one of the two or to both; a due date; a link
  to the thing to do; a list (引越し / アカウント / お金 / その他); the overdue and
  this-week items on the home page.
- Non-goals: recurring tasks, sub-tasks, reminders or push, comments, ordering by drag. Todos
  are not linked to vendors, places or events (they are household tasks, not house-search
  records).
- Anti-goals: a confirm dialog on tick or delete (SHIG 57, 54); a page that needs more than 1
  tap from home for the common case (SHIG 20).

## Data

Table `todos` (migration 0018):

| column | type | note |
| --- | --- | --- |
| id | text PK | `crypto.randomUUID()` |
| title | text | required, ≤200 |
| note | text | optional, ≤2000 |
| list | text enum | `move` \| `account` \| `money` \| `other` |
| assignee | text | member e-mail, or NULL = both |
| due_on | text | `YYYY-MM-DD` or NULL |
| done_at | text | ISO (JST) or NULL |
| done_by | text | e-mail of who ticked it, NULL when open |
| url | text | optional http(s) link, ≤500 |
| created_by, created_at, updated_at | | as every table |

Indexes on `due_on` and `done_at`. Concurrency: `expectedUpdatedAt` like events
(`repository/stale.ts`). Ticking is a separate small write (`setTodoDone`) that does not use
the stale check: two people ticking the same item is not a conflict.

## Screens

`/todos` 「やること」 (in the "…" menu next to 用語集; the bottom tabs do not change).

- Chips: list (すべて / 引越し / アカウント / お金 / その他) and who (すべて / わたし /
  相手 / ふたり), both kept in the URL (`l`, `a`). "わたし" is resolved against the
  viewer's e-mail returned by the loader (no e-mail in the URL).
- Sections in this order: 期限切れ, 今日, 今週 (next 7 days), あとで (later with a date),
  期限なし, then 完了 folded (the last 30 days, newest first). Within a section: due date
  ascending, then created.
- Row: checkbox (ticks silently; the row moves to 完了, a notification offers 元に戻す), title,
  tags (list, who, countdown 今日/明日/あとN日 or N日過ぎ), link icon when a URL is set.
  Tapping the title opens the edit Drawer.
- FAB 「やることを追加」. Form: title, list (SegmentedControl), who (Select: ふたり / each
  member), due date (optional), URL, note. Drafts via `useFormDraft`. Delete at the bottom
  of the edit Drawer, undoable (`deleteWithUndo`).
- Home: a 「やること」 block between the agenda and 「記録を書きませんか」 showing the open
  items that are overdue, due today or within 7 days (max 5), with a link to /todos. Hidden
  when none.

## Seed

The current items come from the owner's vault and are real household data, so they are not
committed. The SQL is prepared in `seed.local/out/todos.sql` and the owner runs it against
production (same as research memos). Assignees are left NULL in the seed and set on screen.

## Left to the builder

Visual details within the existing components (PageShell, ChipRow, FormDrawer, Fab,
EmptyState, MemberChip). Test fixtures use the fictional members of `test/ui/fixtures.ts`.
