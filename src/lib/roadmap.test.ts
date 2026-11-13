import { describe, expect, it } from 'vitest'

import {
  DEFAULT_ROADMAP,
  ROADMAP_HEIGHT,
  ROADMAP_STAGES,
  ROADMAP_STAGE_IDS,
  ROADMAP_WIDTH,
  isRoadmapStageId,
  parseRoadmap,
  roadPath,
  roadmapDescription,
  roadmapNodes,
  roadmapTermLinks,
  stageIndex,
  stageOf,
  stageState,
} from './roadmap'

describe('parseRoadmap', () => {
  it('falls back to the default when nothing is saved or the value is broken', () => {
    expect(parseRoadmap(null)).toEqual(DEFAULT_ROADMAP)
    expect(parseRoadmap(undefined)).toEqual(DEFAULT_ROADMAP)
    expect(parseRoadmap('')).toEqual(DEFAULT_ROADMAP)
    expect(parseRoadmap('{not json')).toEqual(DEFAULT_ROADMAP)
    expect(parseRoadmap('"contract"')).toEqual(DEFAULT_ROADMAP)
    expect(parseRoadmap('null')).toEqual(DEFAULT_ROADMAP)
    expect(parseRoadmap('{"stage":"unknown"}')).toEqual(DEFAULT_ROADMAP)
  })

  it('reads the saved stage', () => {
    expect(parseRoadmap('{"version":1,"stage":"contract"}')).toEqual({
      version: 1,
      stage: 'contract',
    })
  })
})

describe('stages', () => {
  it('knows the ids and their order', () => {
    expect(isRoadmapStageId('vendor')).toBe(true)
    expect(isRoadmapStageId('other')).toBe(false)
    expect(isRoadmapStageId(1)).toBe(false)
    expect(stageIndex('research')).toBe(0)
    expect(stageIndex('handover')).toBe(ROADMAP_STAGES.length - 1)
    expect(stageIndex('nope')).toBe(0)
    expect(stageOf('plan').label).toBe('プラン')
  })

  it('tells done, current and todo apart', () => {
    expect(stageState(0, 2)).toBe('done')
    expect(stageState(2, 2)).toBe('current')
    expect(stageState(3, 2)).toBe('todo')
  })

  it('describes the drawing in words', () => {
    expect(roadmapDescription('vendor')).toBe(
      '家づくりのロードマップ。8 段階のうち、いまは 2 番目の「業者選び」',
    )
  })
})

describe('geometry', () => {
  it('places every stage inside the drawing, 4 per row, the second row right to left', () => {
    const nodes = roadmapNodes()
    expect(nodes).toHaveLength(ROADMAP_STAGES.length)
    for (const n of nodes) {
      expect(n.x).toBeGreaterThan(0)
      expect(n.x).toBeLessThan(ROADMAP_WIDTH)
      expect(n.pinY).toBeGreaterThan(0)
      expect(n.labelY).toBeLessThan(ROADMAP_HEIGHT)
    }
    expect(nodes.slice(0, 4).map((n) => n.x)).toEqual(
      nodes
        .slice(4)
        .map((n) => n.x)
        .reverse(),
    )
    expect(new Set(nodes.slice(0, 4).map((n) => n.y)).size).toBe(1)
    expect(nodes[4].y).toBeGreaterThan(nodes[3].y)
  })

  it('draws the road straight in the first row and through the U-turn after it', () => {
    const nodes = roadmapNodes()
    expect(roadPath(0)).toBe(`M 14 ${nodes[0].y} H ${nodes[0].x}`)
    expect(roadPath(3)).toBe(`M 14 ${nodes[0].y} H ${nodes[3].x}`)
    expect(roadPath(4)).toContain(`A 36 36 0 0 1 ${nodes[4].x} ${nodes[4].y}`)
    expect(roadPath(4)).not.toMatch(/A [^A]* H /)
    expect(roadPath(7)).toMatch(new RegExp(`H ${nodes[7].x}$`))
  })

  it('clamps an index outside the road', () => {
    expect(roadPath(-3)).toBe(roadPath(0))
    expect(roadPath(99)).toBe(roadPath(ROADMAP_STAGES.length - 1))
  })
})

describe('roadmapTermLinks', () => {
  const guide = Object.fromEntries(
    ROADMAP_STAGE_IDS.map((id) => [id, { related: [] as string[] }]),
  ) as Record<(typeof ROADMAP_STAGE_IDS)[number], { related: string[] }>

  it('gives every stage the id and name of its terms, in the order of the guide', () => {
    const links = roadmapTermLinks(
      { ...guide, contract: { related: ['b', 'a'] }, build: { related: ['a'] } },
      [
        { id: 'a', term: '用語A' },
        { id: 'b', term: '用語B' },
        { id: 'c', term: '用語C' },
      ],
    )
    expect(Object.keys(links)).toEqual(ROADMAP_STAGE_IDS)
    expect(links.contract).toEqual([
      { id: 'b', term: '用語B' },
      { id: 'a', term: '用語A' },
    ])
    expect(links.build).toEqual([{ id: 'a', term: '用語A' }])
    expect(links.research).toEqual([])
  })

  it('carries only the id and the name, not the rest of a term', () => {
    const term = { id: 'a', term: '用語A', summary: '説明', body: ['本文'] }
    const links = roadmapTermLinks({ ...guide, plan: { related: ['a'] } }, [term])
    expect(links.plan).toEqual([{ id: 'a', term: '用語A' }])
  })

  it('drops an id the glossary does not have', () => {
    const links = roadmapTermLinks({ ...guide, land: { related: ['gone', 'a'] } }, [
      { id: 'a', term: '用語A' },
    ])
    expect(links.land).toEqual([{ id: 'a', term: '用語A' }])
  })
})
