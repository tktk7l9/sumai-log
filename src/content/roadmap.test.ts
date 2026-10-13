import { describe, expect, it } from 'vitest'

import { findTerm } from '../lib/glossary'
import { ROADMAP_STAGES } from '../lib/roadmap'
import { GLOSSARY } from './glossary'
import { ROADMAP_GUIDE } from './roadmap'

describe('roadmap guide', () => {
  it('has a guide with every section for every stage', () => {
    for (const stage of ROADMAP_STAGES) {
      const guide = ROADMAP_GUIDE[stage.id]
      expect(guide.overview.length, stage.id).toBeGreaterThan(0)
      expect(guide.duration.length, stage.id).toBeGreaterThan(0)
      expect(guide.tasks.length, stage.id).toBeGreaterThan(0)
      expect(guide.decisions.length, stage.id).toBeGreaterThan(0)
      expect(guide.cautions.length, stage.id).toBeGreaterThan(0)
    }
  })

  it('links only glossary terms that exist', () => {
    for (const stage of ROADMAP_STAGES) {
      for (const id of ROADMAP_GUIDE[stage.id].related) {
        expect(findTerm(GLOSSARY, id), `${stage.id} -> ${id}`).not.toBeNull()
      }
    }
  })
})
