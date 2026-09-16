import type { ScheduleLabels } from '@mantine/schedule'

/**
 * @mantine/schedule の日本語ラベル。書いていないキーはライブラリの既定（英語）のまま出る
 * （ScheduleLabels は Partial で渡す設計）。
 */
export const SCHEDULE_LABELS_JA: Partial<ScheduleLabels> = {
  day: '日',
  week: '週',
  month: '月',
  year: '年',
  allDay: '終日',
  today: '今日',
  next: '次へ',
  previous: '前へ',
  more: 'さらに',
  noEvents: '予定はありません',
  moreLabel: (hiddenEventsCount) => `他 ${hiddenEventsCount} 件`,
  switchToDayView: '日表示に切り替え',
  switchToWeekView: '週表示に切り替え',
  switchToMonthView: '月表示に切り替え',
  switchToYearView: '年表示に切り替え',
  viewSelectLabel: '表示を選択',
  agenda: '一覧',
}
