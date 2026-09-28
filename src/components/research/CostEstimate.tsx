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
 * "建築計画に対する目安" (Estimate against the build plan). The building cost is price per
 * tsubo × planned tsubo, and the total is building cost ÷ 0.7
 * (estimateCost in src/lib/research.ts). Without a price per tsubo it writes
 * "坪単価が未登録" (Price per tsubo not registered) (no empty frame is shown).
 */
export function CostEstimate({
  vendor,
  plan,
  compact = false,
}: {
  vendor: { pricePerTsuboMin: number | null; pricePerTsuboMax: number | null }
  plan: BuildPlan
  /** For a cell of the comparison table: packed into 1 line */
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
