import { Badge, Group, Stack, Text } from '@mantine/core'

import {
  BUDGET_VERDICT_LABEL,
  FLOORS_LABEL,
  estimateCost,
  formatManYen,
  formatManYenRange,
  formatTsuboRange,
  judgeBudget,
  type BuildPlan,
  type BudgetVerdict,
} from '../../lib/research'

const VERDICT_COLOR: Record<BudgetVerdict, string> = {
  within: 'teal',
  tight: 'yellow',
  over: 'red',
}

/**
 * 「建築計画に対する目安」。坪単価×計画の坪数で本体、本体÷0.7 で総額を出す
 * （src/lib/research.ts の estimateCost）。坪単価が無ければ「坪単価が未登録」と書く
 * （空の枠を出さない）。
 */
export function CostEstimate({
  vendor,
  plan,
  compact = false,
}: {
  vendor: { pricePerTsuboMin: number | null; pricePerTsuboMax: number | null }
  plan: BuildPlan
  /** 比較表のセル用: 1 行に詰めて出す */
  compact?: boolean
}) {
  const estimate = estimateCost(vendor, plan)
  const verdict = judgeBudget(estimate, plan.budgetManYen)
  if (!estimate) {
    return (
      <Text size="sm" c="dimmed">
        坪単価が未登録
      </Text>
    )
  }
  if (compact) {
    return (
      <Stack gap={2}>
        <Text size="sm">総額 {formatManYenRange(estimate.totalMin, estimate.totalMax)}</Text>
        <Text size="xs" c="dimmed">
          本体 {formatManYenRange(estimate.bodyMin, estimate.bodyMax)}
        </Text>
        {verdict ? (
          <Badge size="sm" variant="light" color={VERDICT_COLOR[verdict]} w="fit-content">
            {BUDGET_VERDICT_LABEL[verdict]}
          </Badge>
        ) : null}
      </Stack>
    )
  }
  return (
    <Stack gap={4}>
      <Group gap="xs" wrap="wrap">
        <Text size="sm" c="dimmed">
          {FLOORS_LABEL[plan.floors]} {formatTsuboRange(plan)}
          {plan.budgetManYen !== null ? `・予算 ${formatManYen(plan.budgetManYen)}` : ''}
        </Text>
        {verdict ? (
          <Badge size="sm" variant="light" color={VERDICT_COLOR[verdict]}>
            {BUDGET_VERDICT_LABEL[verdict]}
          </Badge>
        ) : null}
      </Group>
      <Text size="sm">
        本体 {formatManYenRange(estimate.bodyMin, estimate.bodyMax)}／総額の目安{' '}
        {formatManYenRange(estimate.totalMin, estimate.totalMax)}
      </Text>
      <Text size="xs" c="dimmed">
        本体＝坪単価×坪数、総額＝本体÷0.7（本体 7 割・付帯 2 割・諸費用 1
        割の一般的な構成比）。坪単価の中身は会社ごとに違うので、比較のための換算です。
      </Text>
    </Stack>
  )
}
