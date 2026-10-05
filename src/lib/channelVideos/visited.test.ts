import { describe, expect, it } from 'vitest'

import { visitedHouses, visitOfVideo, type VisitForMatch } from './visited'

const visit = (over: Partial<VisitForMatch>): VisitForMatch => ({
  visitedOn: '2026-03-28',
  vendorId: 'v1',
  names: ['甲工務店「架空の家」完成見学会@横浜市', '甲工務店 完成見学会'],
  ...over,
})

describe('visitedHouses', () => {
  it('finds works named by a visit of the same vendor, with the latest visit', () => {
    expect(
      visitedHouses(
        [
          { title: '架空の家', vendorId: 'v1' },
          // Another vendor's house of the same name was not visited
          { title: '架空の家', vendorId: 'v2' },
          { title: '別の家', vendorId: 'v1' },
          { title: '架空の家', vendorId: null },
        ],
        [
          visit({}),
          visit({ visitedOn: '2026-04-05', names: [null, '「架空の家」 二度目'] }),
          // An older visit listed later does not replace the latest
          visit({ visitedOn: '2026-01-10' }),
          visit({ visitedOn: '2026-05-01', names: ['「架空の家」'], vendorId: 'v3' }),
        ],
      ),
    ).toEqual([{ vendorId: 'v1', name: '架空の家', visitedOn: '2026-04-05' }])
  })

  it('reads the name inside 「」 and skips names too short to be told apart', () => {
    expect(
      visitedHouses(
        [
          { title: '「架空の家」 ～かくうのいえ～', vendorId: 'v1' },
          { title: '浜松', vendorId: 'v1' },
        ],
        [visit({ names: ['モデルハウス@浜松市', '「架空の家」見学'] })],
      ).map((h) => h.name),
    ).toEqual(['架空の家'])
  })
})

describe('visitOfVideo', () => {
  const houses = [
    { vendorId: 'v1', name: '架空の家', visitedOn: '2026-03-28' },
    { vendorId: 'v1', name: '空想の家', visitedOn: '2026-04-10' },
  ]

  it('matches a video of the same vendor naming the house in its title or by its work', () => {
    const at = (title: string, workTitle: string | null = null, vendorId: string | null = 'v1') =>
      visitOfVideo({ vendorId, title, workTitle }, houses)
    expect(at('【ルームツアー】架空の家')).toEqual({ visitedOn: '2026-03-28' })
    expect(at('ルームツアー', '「架空の家」')).toEqual({ visitedOn: '2026-03-28' })
    // Naming both: the later visit
    expect(at('架空の家と空想の家')).toEqual({ visitedOn: '2026-04-10' })
    expect(at('【ルームツアー】架空の家', null, 'v2')).toBeNull()
    expect(at('ルームツアー', '別の家')).toBeNull()
  })
})
