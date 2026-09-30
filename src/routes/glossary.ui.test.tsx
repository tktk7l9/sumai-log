import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { GLOSSARY } from '../content/glossary'
import { renderRoute } from '../../test/ui/render'

describe('glossary route', () => {
  it('lists every category open, with links to the terms', async () => {
    await renderRoute('/glossary')
    expect(await screen.findByRole('heading', { level: 1, name: '用語集' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^性能 \d+$/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByRole('link', { name: /UA値（外皮平均熱貫流率）/ })).toHaveAttribute(
      'href',
      '/glossary/ua-value',
    )
  })

  it('searches after a pause and keeps the query in the URL', async () => {
    const { user, router } = await renderRoute('/glossary')
    await user.type(await screen.findByRole('textbox', { name: '用語・読みで検索' }), '坪単価')
    await waitFor(() => expect(router.state.location.search).toEqual({ q: '坪単価' }))
    const link = screen.getByRole('link', { name: /^坪単価/ })
    expect(link).toHaveAttribute('href', `/glossary/tsubo-price?q=${encodeURIComponent('坪単価')}`)
    expect(screen.queryByRole('link', { name: /UA値/ })).not.toBeInTheDocument()

    await user.clear(screen.getByRole('textbox', { name: '用語・読みで検索' }))
    await waitFor(() => expect(router.state.location.search).toEqual({}))
  })

  it('narrows to a category and back to all', async () => {
    const { user, router } = await renderRoute('/glossary')
    await user.click(await screen.findByRole('radio', { name: 'マンション' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ c: 'condo' }))
    expect(screen.queryByRole('button', { name: /^性能 \d+$/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'すべて' }))
    await waitFor(() => expect(router.state.location.search).toEqual({}))
    expect(screen.getByRole('button', { name: /^性能 \d+$/ })).toBeInTheDocument()
  })

  it('folds a category and says when nothing matches', async () => {
    const { user } = await renderRoute('/glossary')
    const performance = await screen.findByRole('button', { name: /^性能 \d+$/ })
    await user.click(performance)
    expect(performance).toHaveAttribute('aria-expanded', 'false')

    await user.type(screen.getByRole('textbox', { name: '用語・読みで検索' }), 'zzzzzz')
    expect(await screen.findByText('見つかりませんでした')).toBeInTheDocument()
  })

  it('sends an old #term- link to the term page', async () => {
    const { router } = await renderRoute('/glossary#term-c-value')
    await waitFor(() => expect(router.state.location.pathname).toBe('/glossary/c-value'))
  })

  it('ignores an unknown #term- link', async () => {
    const { router } = await renderRoute('/glossary#term-nothing')
    await screen.findByRole('heading', { level: 1, name: '用語集' })
    expect(router.state.location.pathname).toBe('/glossary')
  })
})

describe('glossary term route', () => {
  it('shows the term with its figure, numbers, note and related terms', async () => {
    await renderRoute('/glossary/ua-value?q=UA')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'UA値（外皮平均熱貫流率）' }),
    ).toBeInTheDocument()
    expect(screen.getByText('性能')).toBeInTheDocument()
    expect(screen.getAllByRole('img').length).toBeGreaterThan(0)
    expect(screen.getByText('目安')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('我が家への効き方')
    const related = screen.getByRole('link', { name: /用語集で 断熱等級/ })
    expect(related).toHaveAttribute('href', '/glossary/insulation-grade?q=UA')
    const back = screen
      .getAllByRole('link', { name: '用語集' })
      .find((a) => a.getAttribute('href')?.startsWith('/glossary?'))
    expect(back).toHaveAttribute('href', '/glossary?q=UA')
  })

  // One page per figure: every diagram is drawn as a labelled image inside its term
  for (const term of GLOSSARY.filter((t) => t.diagram)) {
    it(`draws the figure of ${term.id}`, async () => {
      await renderRoute(`/glossary/${term.id}`)
      await screen.findByRole('heading', { level: 1, name: term.term })
      const figure = screen
        .getAllByRole('img')
        .find((el) => el.tagName.toLowerCase() === 'svg' && el.getAttribute('aria-label'))
      expect(figure).toBeDefined()
    })
  }

  it('shows a term without a figure', async () => {
    await renderRoute('/glossary/allowable-stress')
    expect(
      await screen.findByRole('heading', { level: 1, name: '許容応力度計算' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('目安')).not.toBeInTheDocument()
  })

  it('says when a term does not exist', async () => {
    await renderRoute('/glossary/no-such-term')
    expect(
      await screen.findByText(
        'この用語は用語集にありません。削除されたか、リンクが違う可能性があります。',
      ),
    ).toBeInTheDocument()
  })
})

describe('changelog route', () => {
  it('lists the changes, newest first', async () => {
    await renderRoute('/changelog')
    expect(await screen.findByRole('heading', { level: 1, name: '変更履歴' })).toBeInTheDocument()
    const main = screen.getByRole('main')
    expect(within(main).getAllByRole('listitem').length).toBeGreaterThan(0)
  })
})
