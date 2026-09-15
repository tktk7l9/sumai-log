import { describe, expect, it } from 'vitest'

import { CANDIDATE_STATUSES, STATUS_COLOR, STATUS_LABEL, statusRank } from './status'

describe('status', () => {
  it('5 つの状態に日本語ラベルと色がある', () => {
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

  it('本命が先・見送りが最後に並ぶ', () => {
    expect(statusRank('shortlisted')).toBeLessThan(statusRank('interested'))
    expect(statusRank('interested')).toBeLessThan(statusRank('dropped'))
  })
})
