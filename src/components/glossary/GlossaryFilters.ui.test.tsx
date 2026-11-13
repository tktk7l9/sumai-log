import { act, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { renderUi } from '../../../test/ui/render'
import { GlossaryFilters } from './GlossaryFilters'

describe('GlossaryFilters', () => {
  it('keeps what was typed while the route was still applying the previous search term', async () => {
    // A route that applies `?q=` late (the navigation is asynchronous); the test decides when
    let apply: (() => void) | undefined
    let setOutside: ((q: string | undefined) => void) | undefined
    function LateRoute() {
      const [q, setQ] = useState<string | undefined>(undefined)
      setOutside = setQ
      return (
        <GlossaryFilters
          q={q}
          category={undefined}
          onQueryChange={(value) => {
            apply = () => setQ(value || undefined)
          }}
          onCategoryChange={() => {}}
        />
      )
    }
    const { user } = renderUi(<LateRoute />)
    const box = screen.getByRole('textbox', { name: '用語・読みで検索' })
    await user.type(box, 'abc')
    await waitFor(() => expect(apply).toBeDefined())
    await user.type(box, 'd')
    act(() => apply!())
    expect(box).toHaveValue('abcd')

    // A change of q that the field did not send (back/forward, a related term link) realigns it
    act(() => setOutside!('坪単価'))
    expect(box).toHaveValue('坪単価')
    act(() => setOutside!(undefined))
    expect(box).toHaveValue('')
  })
})
