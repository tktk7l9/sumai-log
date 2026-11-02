import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Todo } from '../db/schema'
import { getMembers } from '../server/settings'
import { deleteTodo, listTodos, saveTodo, setTodoDone } from '../server/todos'
import { MEMBERS, mockOf, stub, uid } from '../../test/ui/fixtures'
import { clearNotifications, flushPendingDeletes, renderRoute } from '../../test/ui/render'

const TODAY = '2026-10-28'
const ME = 'owner@example.com'

function todo(over: Partial<Todo> & { id: string; title: string }): Todo {
  return {
    note: null,
    list: 'other',
    assignee: null,
    dueOn: null,
    doneAt: null,
    doneBy: null,
    url: null,
    createdBy: ME,
    createdAt: '2026-10-01 00:00:00',
    updatedAt: '2026-10-01 00:00:00',
    ...over,
  }
}

const KEYS = todo({
  id: uid(1),
  title: '鍵の受け取り',
  list: 'move',
  dueOn: '2026-11-23',
  assignee: ME,
})
const BANK = todo({
  id: uid(2),
  title: '銀行のパスキー',
  list: 'account',
  dueOn: '2026-10-20',
  assignee: 'partner@example.com',
  url: 'https://example.com/help',
})
const NISA = todo({ id: uid(3), title: 'NISA 口座を開く', list: 'money', dueOn: TODAY })
const DONE = todo({
  id: uid(4),
  title: '容量の共有',
  list: 'account',
  doneAt: '2026-10-27T10:00:00+09:00',
  doneBy: ME,
})

describe('todos route', () => {
  beforeEach(() => {
    stub(listTodos, { todos: [KEYS, BANK, NISA, DONE], todayKey: TODAY, viewer: ME })
    stub(getMembers, { members: MEMBERS })
  })

  it('groups by urgency, shows the countdown and who, and folds the finished ones', async () => {
    await renderRoute('/todos')
    expect(await screen.findByRole('heading', { level: 1, name: 'やること' })).toBeInTheDocument()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['期限切れ 1', '今日 1', 'あとで 1'])
    expect(screen.getByText('期限 8日過ぎ')).toBeInTheDocument()
    expect(screen.getByText('11/23')).toBeInTheDocument()
    expect(screen.getAllByText('乙').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: '銀行のパスキー のリンクを開く' })).toHaveAttribute(
      'href',
      'https://example.com/help',
    )
    const fold = screen.getByRole('button', { name: /^完了 1$/ })
    expect(fold).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('容量の共有')).not.toBeVisible()
  })

  it('narrows by list and who through the URL', async () => {
    const { user, router } = await renderRoute('/todos')
    await user.click(await screen.findByRole('radio', { name: 'アカウント' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ l: 'account' }))
    expect(screen.getByText('銀行のパスキー')).toBeInTheDocument()
    expect(screen.queryByText('鍵の受け取り')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'わたし' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ l: 'account', a: 'me' }))
    expect(screen.getByText('この条件のやることはありません')).toBeInTheDocument()
  })

  it('ticks an item without a dialog and moves it to the finished fold', async () => {
    const tick = stub(setTodoDone, { ok: true })
    // After the tick the page reloads its data: the server now reports the item as done
    const list = stub(listTodos, {
      todos: [KEYS, BANK, { ...NISA, doneAt: '2026-10-28T09:00:00+09:00', doneBy: ME }, DONE],
      todayKey: TODAY,
      viewer: ME,
    })
    list.mockResolvedValueOnce({ todos: [KEYS, BANK, NISA, DONE], todayKey: TODAY, viewer: ME })
    const { user } = await renderRoute('/todos')
    await user.click(await screen.findByRole('checkbox', { name: 'NISA 口座を開く を完了にする' }))
    expect(tick).toHaveBeenCalledWith({ data: { id: uid(3), done: true } })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^完了 2$/ })).toBeInTheDocument(),
    )
  })

  it('adds an item from the FAB with the current list preselected', async () => {
    const save = stub(saveTodo, { id: uid(9), conflict: false })
    const { user } = await renderRoute('/todos?l=money')
    // The header button (desktop) and the FAB both exist in jsdom (no media queries)
    await user.click((await screen.findAllByRole('button', { name: 'やることを追加' }))[0])
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: /やること/ }), '妻の NISA 積立設定')
    await user.click(within(dialog).getByRole('button', { name: '追加' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(mockOf(saveTodo).mock.calls[0][0]).toEqual({
      data: {
        title: '妻の NISA 積立設定',
        list: 'money',
        assignee: null,
        dueOn: null,
        url: '',
        note: '',
      },
    })
    expect(await screen.findByText('やることを追加しました')).toBeInTheDocument()
    clearNotifications()
  })

  it('opens an item for editing from the home link, and deletes it with undo', async () => {
    stub(saveTodo, { id: uid(1), conflict: false })
    const remove = stub(deleteTodo, { ok: true })
    const { user } = await renderRoute(`/todos?edit=${uid(1)}`)
    const dialog = await screen.findByRole('dialog', { name: 'やることを編集' })
    expect(within(dialog).getByRole('textbox', { name: /やること/ })).toHaveValue('鍵の受け取り')
    await user.click(within(dialog).getByRole('button', { name: 'このやることを削除' }))
    expect(await screen.findByText('「鍵の受け取り」を削除しました')).toBeInTheDocument()
    expect(screen.queryByText('鍵の受け取り')).not.toBeInTheDocument()
    expect(remove).not.toHaveBeenCalled()
    flushPendingDeletes()
    await waitFor(() => expect(remove).toHaveBeenCalled())
  })

  it('says so when there is nothing to do', async () => {
    stub(listTodos, { todos: [], todayKey: TODAY, viewer: ME })
    await renderRoute('/todos')
    expect(await screen.findByText('やることはありません')).toBeInTheDocument()
  })
})
