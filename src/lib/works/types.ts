/** What a site can tell about one built example. Areas are in tsubo */
export type WorkFields = {
  title: string | null
  category: string | null
  location: string | null
  /** 'YYYY-MM' or 'YYYY' */
  completedOn: string | null
  points: string[]
  uaValue: number | null
  cValue: number | null
  family: string | null
  siteAreaTsubo: number | null
  floorAreaTsubo: number | null
  totalAreaTsubo: number | null
  layout: string | null
  youtubeVideoId: string | null
}

export const EMPTY_FIELDS: WorkFields = {
  title: null,
  category: null,
  location: null,
  completedOn: null,
  points: [],
  uaValue: null,
  cValue: null,
  family: null,
  siteAreaTsubo: null,
  floorAreaTsubo: null,
  totalAreaTsubo: null,
  layout: null,
  youtubeVideoId: null,
}

/** One example on a list page, with whatever the list already shows about it */
export type WorkListEntry = { url: string } & Partial<WorkFields>

/** entries: examples on this page. pageUrls: the other list pages this page links to */
export type WorkListPage = { entries: WorkListEntry[]; pageUrls: string[] }

export type SiteParser = {
  parseList(html: string, pageUrl: string): WorkListPage
  parseDetail(html: string): Partial<WorkFields>
}

export type ParsedWork = WorkFields & {
  title: string
  sourceUrl: string
  site: string
  vendorId: string | null
  sortOrder: number
}
