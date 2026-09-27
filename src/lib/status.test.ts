import { describe, expect, it } from 'vitest'

import { CANDIDATE_STATUSES, STATUS_COLOR, STATUS_LABEL, statusRank } from './status'

describe('status', () => {
  it('has a Japanese label and a color for each of the 5 statuses', () => {
    expect(CANDIDATE_STATUSES).toEqual([
      'shortlisted',
      'consulting',
      'visited',
      'interested',
      'dropped',
    ])
    for (const s of CANDIDATE_STATUSES) {
      expect(STATUS_LABEL[s]).toMatch(/^[^\s]+$/)
      expect(STATUS_COLOR[s]).toMatch(/^[a-z]+$/)
    }
  })

  it('sorts shortlisted first and dropped last', () => {
    expect(statusRank('shortlisted')).toBeLessThan(statusRank('interested'))
    expect(statusRank('interested')).toBeLessThan(statusRank('dropped'))
  })
})
