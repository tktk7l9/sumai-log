import { workNameOf } from './match'

/**
 * Which videos show a house we actually went to. A visit record has no link to a work, but the
 * place or event of a completion open house names the house (「〇〇の家」完成見学会@…), and the
 * vendor's videos of that house name it too. So a work whose name appears in a visit of the same
 * vendor counts as visited, and so does every video of that vendor naming it.
 */

export type VisitForMatch = {
  visitedOn: string
  vendorId: string | null
  /** The place name and the event title, whichever there are */
  names: (string | null)[]
}

export type WorkForMatch = { title: string; vendorId: string | null }

export type VisitedHouse = {
  vendorId: string
  /** The work's name as video titles use it */
  name: string
  visitedOn: string
}

/**
 * Longer than the name match of the import: a visit name is a free label ("モデルハウス@浜松市"),
 * so a two-letter work name would hit too easily
 */
const MIN_NAME_LENGTH = 3

/** The visited works, each with its latest visit */
export function visitedHouses(works: WorkForMatch[], visits: VisitForMatch[]): VisitedHouse[] {
  const byKey = new Map<string, VisitedHouse>()
  for (const work of works) {
    const name = workNameOf(work.title)
    if (!work.vendorId || name.length < MIN_NAME_LENGTH) continue
    for (const visit of visits) {
      if (visit.vendorId !== work.vendorId) continue
      if (!visit.names.some((n) => n?.includes(name))) continue
      const key = `${work.vendorId}\n${name}`
      const seen = byKey.get(key)
      if (!seen || seen.visitedOn < visit.visitedOn) {
        byKey.set(key, { vendorId: work.vendorId, name, visitedOn: visit.visitedOn })
      }
    }
  }
  return [...byKey.values()]
}

/**
 * The visit of a video: the same vendor, and its title or its tour work names a visited house.
 * The latest visit when it names more than one
 */
export function visitOfVideo(
  video: { vendorId: string | null; title: string; workTitle: string | null },
  houses: VisitedHouse[],
): { visitedOn: string } | null {
  let found: VisitedHouse | null = null
  for (const house of houses) {
    if (house.vendorId !== video.vendorId) continue
    const named =
      video.title.includes(house.name) ||
      (video.workTitle !== null && workNameOf(video.workTitle) === house.name)
    if (named && (!found || found.visitedOn < house.visitedOn)) found = house
  }
  return found ? { visitedOn: found.visitedOn } : null
}
