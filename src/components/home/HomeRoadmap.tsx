import { Button, Card, Group, Radio, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { extractErrorMessage } from '../../lib/formError'
import {
  ROADMAP_HEIGHT,
  ROADMAP_STAGES,
  ROADMAP_WIDTH,
  roadPath,
  roadmapDescription,
  roadmapNodes,
  stageIndex,
  stageState,
  type Roadmap,
  type RoadmapStageId,
} from '../../lib/roadmap'
import { saveRoadmap } from '../../server/roadmap'
import { FormDrawer } from '../FormDrawer'

const NODE_RADIUS = 9
const CURRENT_RADIUS = 12

/**
 * "家づくりのロードマップ" (House-building roadmap) on the home page: the 8 stages of
 * building the house drawn as a road that winds in 2 rows, with the stages already passed
 * filled in and a "現在地" (You are here) pin on the current one. Either of the two can move
 * the pin from "現在地を変更" (the setting `roadmap`; `src/lib/roadmap.ts`).
 *
 * Colours are the app's accent for the way travelled and a neutral for the way ahead
 * (`--sumai-road-*` in styles.css, different steps in light and dark). The text wears the
 * text colours, not the road colour.
 */
export function HomeRoadmap({ roadmap }: { roadmap: Roadmap }) {
  const [opened, setOpened] = useState(false)
  const current = stageIndex(roadmap.stage)
  const stage = ROADMAP_STAGES[current]
  return (
    <Stack gap="sm">
      <Title order={2}>家づくりのロードマップ</Title>
      <Card withBorder padding="md">
        <Stack gap="sm">
          <RoadmapFigure current={current} description={roadmapDescription(roadmap.stage)} />
          <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Text size="xs" c="dimmed">
                現在地（{current + 1} / {ROADMAP_STAGES.length}）
              </Text>
              <Text fw={700}>{stage.label}</Text>
              <Text size="sm" c="dimmed">
                {stage.hint}
              </Text>
            </Stack>
            <Button
              variant="light"
              size="compact-sm"
              onClick={() => setOpened(true)}
              style={{ flexShrink: 0 }}
            >
              現在地を変更
            </Button>
          </Group>
        </Stack>
      </Card>
      <StagePicker
        opened={opened}
        onClose={() => setOpened(false)}
        stage={roadmap.stage}
        key={roadmap.stage}
      />
    </Stack>
  )
}

/** The drawing. `current` is the 0-based stage */
function RoadmapFigure({ current, description }: { current: number; description: string }) {
  const nodes = roadmapNodes()
  const full = roadPath(ROADMAP_STAGES.length - 1)
  const done = roadPath(current)
  const here = nodes[current]
  return (
    <svg
      className="home-roadmap"
      viewBox={`0 0 ${ROADMAP_WIDTH} ${ROADMAP_HEIGHT}`}
      role="img"
      aria-label={description}
    >
      {/* The whole road, then the part travelled on top of it */}
      <path className="home-roadmap-road" d={full} />
      <path className="home-roadmap-done" d={done} />
      {ROADMAP_STAGES.map((s, i) => {
        const node = nodes[i]
        const state = stageState(i, current)
        const r = state === 'current' ? CURRENT_RADIUS : NODE_RADIUS
        return (
          <g key={s.id} className="home-roadmap-stage" data-state={state}>
            <circle cx={node.x} cy={node.y} r={r} />
            {state === 'done' ? (
              // A check mark, so that "passed" does not rely on colour alone
              <path className="home-roadmap-check" d={`M ${node.x - 4} ${node.y} l 3 3 l 6 -6`} />
            ) : (
              <text className="home-roadmap-number" x={node.x} y={node.y} dy="0.35em">
                {i + 1}
              </text>
            )}
            <text className="home-roadmap-label" x={node.x} y={node.labelY}>
              {s.label}
            </text>
          </g>
        )
      })}
      {/* The "現在地" pin above the current stage */}
      <g className="home-roadmap-pin" transform={`translate(${here.x} ${here.pinY})`}>
        <path d="M -24 0 h 48 a 5 5 0 0 1 5 5 v 12 a 5 5 0 0 1 -5 5 h -18 l -6 6 l -6 -6 h -18 a 5 5 0 0 1 -5 -5 v -12 a 5 5 0 0 1 5 -5 z" />
        <text x="0" y="11" dy="0.35em">
          現在地
        </text>
      </g>
    </svg>
  )
}

/** The Drawer that moves the pin. One radio per stage with its hint */
function StagePicker({
  opened,
  onClose,
  stage,
}: {
  opened: boolean
  onClose: () => void
  stage: RoadmapStageId
}) {
  const router = useRouter()
  const save = useServerFn(saveRoadmap)
  const [value, setValue] = useState<RoadmapStageId>(stage)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await save({ data: { stage: value } })
      await router.invalidate()
      notifications.show({ message: '現在地を変更しました' })
      onClose()
    } catch (error) {
      notifications.show({ message: extractErrorMessage(error), color: 'red' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDrawer opened={opened} onClose={onClose} title="現在地を変更">
      <form onSubmit={submit}>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            いまの段階を選びます。前の段階は「通った道」として塗られます。
          </Text>
          <Radio.Group
            value={value}
            onChange={(v) => setValue(v as RoadmapStageId)}
            aria-label="いまの段階"
          >
            <Stack gap="sm">
              {ROADMAP_STAGES.map((s, i) => (
                <Radio
                  key={s.id}
                  value={s.id}
                  label={`${i + 1}. ${s.label}`}
                  description={s.hint}
                />
              ))}
            </Stack>
          </Radio.Group>
          <div className="form-actions">
            <Button type="submit" fullWidth loading={saving}>
              現在地を保存
            </Button>
          </div>
        </Stack>
      </form>
    </FormDrawer>
  )
}
