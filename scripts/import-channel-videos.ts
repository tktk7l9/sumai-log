/**
 * Lists every video of the vendors' YouTube channels with yt-dlp and turns them into SQL.
 *
 *   npm run import:channel-videos               # uses the cached lists when there are any
 *   npm run import:channel-videos -- --refresh  # asks YouTube again
 *
 * Needs yt-dlp on PATH (brew install yt-dlp). Which channels are read is in
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
  publishedAtFromWatchPage,
  recordedWatchedBackfillSql,
} from '../src/lib/channelVideos/import.ts'
import { toJstDateKey } from '../src/lib/jst.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG_PATH = resolve(root, 'seed.local/channel-videos.json')
const CACHE_DIR = resolve(root, 'seed.local/cache/channel-videos')
const OUT_DIR = resolve(root, 'seed.local/out')

/** videoId -> ISO date. Kept across runs and --refresh: a published date does not change */
const DATES_PATH = resolve(CACHE_DIR, 'published.json')
/** Watch pages fetched at the same time, and the pause each worker takes between two */
const DATE_WORKERS = 4
const DATE_GAP_MS = 300
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
 * list has none). A page that fails is left out and tried again on the next run
 */
async function fillPublishedDates(videoIds: string[]): Promise<Record<string, string>> {
  const dates: Record<string, string> = existsSync(DATES_PATH)
    ? JSON.parse(readFileSync(DATES_PATH, 'utf8'))
    : {}
  const missing = videoIds.filter((id) => !(id in dates))
  let failed = 0
  let next = 0
  async function worker() {
    while (next < missing.length) {
      const id = missing[next++] as string
      try {
        const res = await fetch(`https://www.youtube.com/watch?v=${id}`, {
          headers: { 'accept-language': 'ja-JP,ja;q=0.9' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
        const date = res.ok ? publishedAtFromWatchPage(await res.text()) : null
        if (date) dates[id] = date
        else failed += 1
      } catch {
        failed += 1
      }
      await new Promise((done) => setTimeout(done, DATE_GAP_MS))
    }
  }
  await Promise.all(Array.from({ length: DATE_WORKERS }, worker))
  writeFileSync(`${DATES_PATH}.tmp`, JSON.stringify(dates))
  renameSync(`${DATES_PATH}.tmp`, DATES_PATH)
  console.log(`published dates: ${missing.length - failed} read, ${failed} failed`)
  return dates
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
