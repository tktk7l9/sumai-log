import { describe, expect, it } from 'vitest'

import {
  matchWorksToVideos,
  workNameOf,
  workVideoLinkSql,
  type MatchableVideo,
  type MatchableWork,
} from './match'

describe('workNameOf', () => {
  it.each([
    ['「甲の家」 ～こうのいえ～', '甲の家'],
    ['乙荘（おつそう）', '乙荘'],
    ['丙の家 ～へいのいえ～', '丙の家'],
    ['丁の家_二世帯', '丁の家'],
    ['癸の家　別邸', '癸の家'],
    ['TEST HOUSE（テスト）', 'TEST HOUSE'],
    ['戊の家', '戊の家'],
    ['  ', ''],
  ])('%s -> %s', (title, name) => {
    expect(workNameOf(title)).toBe(name)
  })
})

const work = (title: string, over: Partial<MatchableWork> = {}): MatchableWork => ({
  sourceUrl: `https://example.com/works/${encodeURIComponent(title)}`,
  title,
  vendorId: 'v1',
  youtubeVideoId: null,
  ...over,
})
const video = (videoId: string, title: string, over: Partial<MatchableVideo> = {}) => ({
  videoId,
  title,
  vendorId: 'v1',
  kind: 'video' as const,
  ...over,
})

describe('matchWorksToVideos', () => {
  it('links a work to the one video of its vendor that names it', () => {
    expect(
      matchWorksToVideos(
        [work('「甲の家」 ～こうのいえ～')],
        [
          video('aaaaaaaaaaa', '【ルームツアー】甲の家 - こうのいえ -'),
          video('bbbbbbbbbbb', '別の話'),
        ],
      ),
    ).toEqual([{ sourceUrl: work('「甲の家」 ～こうのいえ～').sourceUrl, videoId: 'aaaaaaaaaaa' }])
  })

  it('prefers the tour video when several name the work', () => {
    const pairs = matchWorksToVideos(
      [work('乙の家')],
      [video('aaaaaaaaaaa', '「乙の家」を例に解説'), video('bbbbbbbbbbb', '【room tour】乙の家')],
    )
    expect(pairs.map((p) => p.videoId)).toEqual(['bbbbbbbbbbb'])
  })

  it('links nothing when it cannot tell which one', () => {
    expect(
      matchWorksToVideos(
        [work('丙の家')],
        [
          video('aaaaaaaaaaa', 'ルームツアー 丙の家 前編'),
          video('bbbbbbbbbbb', 'ルームツアー 丙の家 後編'),
        ],
      ),
    ).toEqual([])
  })

  it('skips works that already have a video, other vendors, shorts, short names and claimed videos', () => {
    const videos = [
      video('aaaaaaaaaaa', 'ルームツアー 丁の家'),
      video('bbbbbbbbbbb', 'ルームツアー 戊の家', { vendorId: 'v2' }),
      video('ccccccccccc', 'ルームツアー 己の家', { kind: 'short' }),
      video('ddddddddddd', '緒 ルームツアー'),
      video('eeeeeeeeeee', 'ルームツアー 庚の家'),
    ]
    expect(
      matchWorksToVideos(
        [
          work('丁の家', { youtubeVideoId: 'zzzzzzzzzzz' }),
          work('戊の家'),
          work('己の家'),
          work('緒'),
          work('辛の家', { vendorId: null }),
          // The site already gave this video to another work
          work('庚の家'),
          work('別の庚', { youtubeVideoId: 'eeeeeeeeeee' }),
        ],
        videos,
      ),
    ).toEqual([])
  })

  it('links neither when two works claim the same video', () => {
    expect(
      matchWorksToVideos(
        [work('壬の家'), work('「壬の家」 二期')],
        [video('aaaaaaaaaaa', 'ルームツアー 壬の家')],
      ),
    ).toEqual([])
  })
})

describe('workVideoLinkSql', () => {
  it('sets the video only where there is none, then carries over the watched mark', () => {
    const [link, watched] = workVideoLinkSql([
      { sourceUrl: "https://example.com/works/o'k", videoId: 'aaaaaaaaaaa' },
    ])
    expect(link).toBe(
      "UPDATE works SET youtube_video_id = 'aaaaaaaaaaa', video_source = 'title', updated_at = datetime('now') WHERE source_url = 'https://example.com/works/o''k' AND youtube_video_id IS NULL;",
    )
    expect(watched).toContain('WHERE watched_at IS NULL AND youtube_video_id IN')
    expect(workVideoLinkSql([])).toHaveLength(1)
  })
})
