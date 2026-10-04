/**
 * Lists every video of the vendors' YouTube channels with yt-dlp and turns them into SQL.
 *
 *   npm run import:channel-videos               # uses the cached lists when there are any
 *   npm run import:channel-videos -- --refresh  # asks YouTube again
 *
 * Needs yt-dlp on PATH (brew install yt-dlp). Published dates come from the YouTube Data API when
 * YOUTUBE_API_KEY is set (in the environment or in .dev.vars), else from each watch page. Which channels are read is in
 * seed.local/channel-videos.json (gitignored: it is real data):
 *   { "channels": [{ "channelId": "UC…", "name": "…", "vendorId": "<vendors.id or null>" }] }
 *
 * Output: seed.local/out/channel-videos-YYYYMMDD.sql. The owner runs it against the production D1:
 *   npx wrangler d1 execute sumai-log --remote --file seed.local/out/channel-videos-YYYYMMDD.sql
 * The upsert is keyed by video_id, so re-running is safe (watched flags are kept). Titles are
 * never printed, only counts.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CHANNEL_TABS,
  channelVideoUpsertSql,
  channelVideosOf,
  parseChannelsConfig,
  parseFlatPlaylist,
  publishedAtFromVideosList,
  publishedAtFromWatchPage,
  recordedWatchedBackfillSql,
  VIDEOS_LIST_BATCH,
  videosListUrl,
} from '../src/lib/channelVideos/import.ts'
import { toJstDateKey } from '../src/lib/jst.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG_PATH = resolve(root, 'seed.local/channel-videos.json')
const CACHE_DIR = resolve(root, 'seed.local/cache/channel-videos')
const OUT_DIR = resolve(root, 'seed.local/out')

/** videoId -> ISO date. Kept across runs and --refresh: a published date does not change */
const DATES_PATH = resolve(CACHE_DIR, 'published.json')
/**
 * One watch page at a time, slowly: about 300 pages fetched 4 at a time got this machine
 * rate-limited by YouTube (HTTP 429, a redirect to google.com/sorry) for hours
 */
const DATE_GAP_MS = 2000
const REQUEST_TIMEOUT_MS = 30_000

const refresh = process.argv.includes('--refresh')

/** One tab of one channel as yt-dlp prints it; `null` when the channel has no such tab */
function loadTab(channelId: string, tab: string): unknown {
  const cachePath = resolve(CACHE_DIR, `${channelId}-${tab}.json`)
  if (!refresh && existsSync(cachePath)) return JSON.parse(readFileSync(cachePath, 'utf8'))
  let out: string
  try {
    out = execFileSync(
      'yt-dlp',
      [
        '--flat-playlist',
        '--sleep-requests',
        '1',
        // Without these YouTube sends machine-translated English titles
        '--extractor-args',
        'youtube:lang=ja',
        '--add-header',
        'Accept-Language:ja-JP,ja;q=0.9',
        '-J',
        `https://www.youtube.com/channel/${channelId}/${tab}`,
      ],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
    )
  } catch {
    // yt-dlp exits non-zero for a tab the channel does not have
    out = 'null'
  }
  writeFileSync(`${cachePath}.tmp`, out)
  renameSync(`${cachePath}.tmp`, cachePath)
  return JSON.parse(out)
}

/**
 * Reads the published date of every video not in the date cache from its watch page (the flat
 * list has none). A page that fails, or is not reached, is tried again on the next run
 */
async function fillPublishedDates(videoIds: string[]): Promise<Record<string, string>> {
  const dates: Record<string, string> = existsSync(DATES_PATH)
    ? JSON.parse(readFileSync(DATES_PATH, 'utf8'))
    : {}
  const missing = videoIds.filter((id) => !(id in dates))
  const apiKey = youtubeApiKey()
  if (apiKey) {
    await fillFromDataApi(missing, apiKey, dates)
  } else {
    await fillFromWatchPages(missing, dates)
  }
  writeFileSync(`${DATES_PATH}.tmp`, JSON.stringify(dates))
  renameSync(`${DATES_PATH}.tmp`, DATES_PATH)
  return dates
}

/** YOUTUBE_API_KEY from the environment, else from .dev.vars (gitignored). Never printed */
function youtubeApiKey(): string | null {
  if (!process.env.YOUTUBE_API_KEY && existsSync(resolve(root, '.dev.vars'))) {
    process.loadEnvFile(resolve(root, '.dev.vars'))
  }
  return process.env.YOUTUBE_API_KEY?.trim() || null
}

/** 50 ids per call: about 40 calls (40 quota units of the free 10,000 a day) for every video */
async function fillFromDataApi(missing: string[], apiKey: string, dates: Record<string, string>) {
  let read = 0
  for (let i = 0; i < missing.length; i += VIDEOS_LIST_BATCH) {
    const batch = missing.slice(i, i + VIDEOS_LIST_BATCH)
    const res = await fetch(videosListUrl(batch, apiKey), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      // The body names the reason (key not valid, API not enabled, quota); the URL carries the key
      const reason = await res.text().catch(() => '')
      console.warn(`YouTube Data API: HTTP ${res.status}; stopped.\n${reason.slice(0, 500)}`)
      break
    }
    const found = publishedAtFromVideosList(await res.json())
    Object.assign(dates, found)
    read += Object.keys(found).length
  }
  console.log(`published dates (Data API): ${read} read of ${missing.length}`)
}

async function fillFromWatchPages(missing: string[], dates: Record<string, string>) {
  let read = 0
  let failed = 0
  for (const id of missing) {
    let res: Response
    try {
      res = await fetch(`https://www.youtube.com/watch?v=${id}`, {
        headers: { 'accept-language': 'ja-JP,ja;q=0.9' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch {
      failed += 1
      continue
    }
    // Rate-limited: stop at once (asking again only makes the block longer). What was read is
    // kept, and the next run carries on from there
    if (res.status === 429 || res.url.includes('google.com/sorry')) {
      console.warn('YouTube is rate-limiting this machine; stopped. Run again later to continue.')
      break
    }
    const date = res.ok ? publishedAtFromWatchPage(await res.text()) : null
    if (date) {
      dates[id] = date
      read += 1
    } else failed += 1
    await new Promise((done) => setTimeout(done, DATE_GAP_MS))
  }
  console.log(
    `published dates: ${read} read, ${failed} failed, ${missing.length - read - failed} left for the next run`,
  )
}

async function main() {
  if (!existsSync(CONFIG_PATH)) {
    console.error(
      'Missing seed.local/channel-videos.json. Create it as:\n' +
        '{ "channels": [{ "channelId": "UC…", "name": "…", "vendorId": null }] }',
    )
    process.exit(1)
  }
  const channels = parseChannelsConfig(JSON.parse(readFileSync(CONFIG_PATH, 'utf8')))
  mkdirSync(CACHE_DIR, { recursive: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const perChannel = channels.map((channel) => {
    const tabs = CHANNEL_TABS.map(({ tab, kind }) => ({
      kind,
      entries: parseFlatPlaylist(loadTab(channel.channelId, tab)),
    }))
    const perKind = tabs.map(({ kind, entries }) => `${kind} ${entries.length}`).join(', ')
    const videos = channelVideosOf(channel, tabs)
    console.log(`${channel.channelId}: ${videos.length} videos (${perKind})`)
    return videos
  })
  const dates = await fillPublishedDates(perChannel.flat().map((v) => v.videoId))

  // No BEGIN / COMMIT: `wrangler d1 execute --file` already runs the file atomically
  const lines = ['-- generated by scripts/import-channel-videos.ts']
  for (const video of perChannel.flat()) {
    const publishedAt = dates[video.videoId] ?? null
    lines.push(channelVideoUpsertSql({ ...video, publishedAt }, crypto.randomUUID()))
  }
  lines.push(...recordedWatchedBackfillSql())

  const stamp = toJstDateKey(new Date().toISOString()).replaceAll('-', '')
  const outPath = resolve(OUT_DIR, `channel-videos-${stamp}.sql`)
  writeFileSync(outPath, `${lines.join('\n')}\n`)
  console.log(`wrote ${lines.length - 1} statements to ${outPath}`)
}

await main()
