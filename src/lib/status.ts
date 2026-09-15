/** 候補（業者・マンション物件）の状態。並びは一覧の表示順でもある */
export const CANDIDATE_STATUSES = [
  'shortlisted',
  'consulting',
  'visited',
  'interested',
  'dropped',
] as const

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number]

export const STATUS_LABEL: Record<CandidateStatus, string> = {
  shortlisted: '本命',
  consulting: '相談中',
  visited: '見学済',
  interested: '気になる',
  dropped: '見送り',
}

export const STATUS_COLOR: Record<CandidateStatus, string> = {
  shortlisted: 'clay',
  consulting: 'orange',
  visited: 'teal',
  interested: 'blue',
  dropped: 'gray',
}

export function statusRank(status: CandidateStatus): number {
  return CANDIDATE_STATUSES.indexOf(status)
}
