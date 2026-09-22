import {
  Button,
  Card,
  Group,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { extractFormError } from '../../lib/formError'
import type { BuildPlan } from '../../lib/research'
import { saveBuildPlan } from '../../server/research'

type Values = {
  floors: '1' | '2'
  tsuboMin: number | ''
  tsuboMax: number | ''
  budgetManYen: number | ''
}

/**
 * 設定の「建築計画」。階数・延床の坪数レンジ・土地以外の総予算だけを持つ
 * （土地や資金の一次情報はアプリの外。design.md §1）。比較表と業者詳細の
 * 「計画に対する目安」がこれを使う。
 */
export function BuildPlanCard({ plan }: { plan: BuildPlan | null }) {
  const router = useRouter()
  const save = useServerFn(saveBuildPlan)
  const [saving, setSaving] = useState(false)
  const form = useForm<Values>({
    initialValues: {
      floors: plan ? (String(plan.floors) as '1' | '2') : '1',
      tsuboMin: plan?.tsuboMin ?? '',
      tsuboMax: plan?.tsuboMax ?? '',
      budgetManYen: plan?.budgetManYen ?? '',
    },
    validate: {
      tsuboMin: (v) => (v === '' ? '坪数は必須です' : null),
      tsuboMax: (v, values) =>
        v === ''
          ? '坪数は必須です'
          : values.tsuboMin !== '' && v < values.tsuboMin
            ? '下限≦上限にしてください'
            : null,
    },
  })

  async function submit(values: Values) {
    setSaving(true)
    try {
      await save({
        data: {
          floors: values.floors === '1' ? 1 : 2,
          tsuboMin: values.tsuboMin as number,
          tsuboMax: values.tsuboMax as number,
          budgetManYen: values.budgetManYen,
        },
      })
      await router.invalidate()
      notifications.show({ message: '建築計画を保存しました' })
    } catch (error) {
      const { message, path } = extractFormError(error)
      notifications.show({ message, color: 'red' })
      if (path) form.setFieldError(path, message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Title order={2}>建築計画</Title>
        <Text size="sm" c="dimmed">
          候補の比較表と業者詳細で「計画に対する目安（本体・総額）」を出すのに使います。予算は土地以外の総額です。
        </Text>
        <form onSubmit={form.onSubmit(submit)}>
          <Stack gap="sm">
            <SegmentedControl
              fullWidth
              aria-label="階数"
              data={[
                { value: '1', label: '平屋' },
                { value: '2', label: '2 階建て' },
              ]}
              {...form.getInputProps('floors')}
            />
            <Group grow>
              <NumberInput
                label="延床 下限（坪）"
                min={5}
                max={300}
                {...form.getInputProps('tsuboMin')}
              />
              <NumberInput
                label="延床 上限（坪）"
                min={5}
                max={300}
                {...form.getInputProps('tsuboMax')}
              />
            </Group>
            <NumberInput
              label="予算（万円・土地以外）"
              min={0}
              max={1_000_000}
              step={100}
              thousandSeparator=","
              {...form.getInputProps('budgetManYen')}
            />
            <Group justify="flex-end">
              <Button type="submit" loading={saving}>
                保存
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Card>
  )
}
