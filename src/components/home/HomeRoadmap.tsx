import { Badge, Button, Card, Group, List, Radio, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { GLOSSARY } from '../../content/glossary'
import { ROADMAP_GUIDE } from '../../content/roadmap'
import { extractErrorMessage } from '../../lib/formError'
import { findTerm } from '../../lib/glossary'
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
  type StageState,
} from '../../lib/roadmap'
import { saveRoadmap } from '../../server/roadmap'
import { FormDrawer } from '../FormDrawer'

const NODE_RADIUS = 9
const CURRENT_RADIUS = 12
/** The tappable area around a stage (the circle alone is 18px on a phone) */
const HIT_HALF_WIDTH = 38

const STATE_LABEL: Record<StageState, string> = {
  done: '通った段階',
  current: 'いまここ',
  todo: 'これから',
}

/**
 * "家づくりのロードマップ" (House-building roadmap) on the home page: the 8 stages of
 * building the house drawn as a road that winds in 2 rows, with the stages already passed
 * filled in and a "現在地" (You are here) pin on the current one. Tapping a stage opens what
 * that stage generally involves (`src/content/roadmap.ts`), and either of the two can move
 * the pin from there or from "現在地を変更" (the setting `roadmap`; `src/lib/roadmap.ts`).
 *
 * Colours are the app's accent for the way travelled and a neutral for the way ahead
 * (`--sumai-road-*` in styles.css, different steps in light and dark). The text wears the
 * text colours, not the road colour.
 */
export function HomeRoadmap({ roadmap }: { roadmap: Roadmap }) {
  const [pickerOpened, setPickerOpened] = useState(false)
  const [guideStage, setGuideStage] = useState<RoadmapStageId | null>(null)
  const current = stageIndex(roadmap.stage)
  const stage = ROADMAP_STAGES[current]
  return (
    <Stack gap="sm">
      <Title order={2}>家づくりのロードマップ</Title>
      <Card withBorder padding="md">
        <Stack gap="sm">
          <RoadmapFigure
            current={current}
            description={roadmapDescription(roadmap.stage)}
            onSelect={(id) => setGuideStage(id)}
          />
          <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Text size="xs" c="dimmed">
                現在地（{current + 1} / {ROADMAP_STAGES.length}）
              </Text>
              <Text fw={700}>{stage.label}</Text>
              <Text size="sm" c="dimmed">
                {stage.hint}
              </Text>
              <Text size="xs" c="dimmed">
                段階をタップすると、その段階でやることの説明が開きます
              </Text>
            </Stack>
            <Button
              variant="light"
              size="compact-sm"
              onClick={() => setPickerOpened(true)}
              style={{ flexShrink: 0 }}
            >
              現在地を変更
            </Button>
          </Group>
        </Stack>
      </Card>
      <StagePicker
        opened={pickerOpened}
        onClose={() => setPickerOpened(false)}
        stage={roadmap.stage}
        key={roadmap.stage}
      />
      <StageGuide
        stage={guideStage}
        current={current}
        onClose={() => setGuideStage(null)}
        onMoved={() => setGuideStage(null)}
      />
    </Stack>
  )
}

/** The drawing. `current` is the 0-based stage. Every stage is a button that opens its guide */
function RoadmapFigure({
  current,
  description,
  onSelect,
}: {
  current: number
  description: string
  onSelect: (id: RoadmapStageId) => void
}) {
  const nodes = roadmapNodes()
  const full = roadPath(ROADMAP_STAGES.length - 1)
  const done = roadPath(current)
  const here = nodes[current]
  return (
    <svg
      className="home-roadmap"
      viewBox={`0 0 ${ROADMAP_WIDTH} ${ROADMAP_HEIGHT}`}
      role="group"
      aria-label={description}
    >
      {/* The whole road, then the part travelled on top of it */}
      <path className="home-roadmap-road" d={full} />
      <path className="home-roadmap-done" d={done} />
      {ROADMAP_STAGES.map((s, i) => {
        const node = nodes[i]
        const state = stageState(i, current)
        const r = state === 'current' ? CURRENT_RADIUS : NODE_RADIUS
        const open = () => onSelect(s.id)
        return (
          <g
            key={s.id}
            className="home-roadmap-stage"
            data-state={state}
            role="button"
            tabIndex={0}
            aria-label={`${i + 1}. ${s.label}（${STATE_LABEL[state]}）の説明を見る`}
            onClick={open}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                open()
              }
            }}
          >
            {/* Invisible hit area over the circle and its label */}
            <rect
              className="home-roadmap-hit"
              x={node.x - HIT_HALF_WIDTH}
              y={node.y - CURRENT_RADIUS - 4}
              width={HIT_HALF_WIDTH * 2}
              height={node.labelY - node.y + CURRENT_RADIUS + 8}
              rx={6}
            />
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
      {/* The "現在地" pin above the current stage. It does not catch taps (the stage under it does) */}
      <g className="home-roadmap-pin" transform={`translate(${here.x} ${here.pinY})`}>
        <path d="M -24 0 h 48 a 5 5 0 0 1 5 5 v 12 a 5 5 0 0 1 -5 5 h -18 l -6 6 l -6 -6 h -18 a 5 5 0 0 1 -5 -5 v -12 a 5 5 0 0 1 5 -5 z" />
        <text x="0" y="11" dy="0.35em">
          現在地
        </text>
      </g>
    </svg>
  )
}

/** Saves the current stage, refreshes the page data and tells the user */
function useMoveStage() {
  const router = useRouter()
  const save = useServerFn(saveRoadmap)
  const [saving, setSaving] = useState(false)
  async function move(stage: RoadmapStageId): Promise<boolean> {
    setSaving(true)
    try {
      await save({ data: { stage } })
      await router.invalidate()
      notifications.show({ message: '現在地を変更しました' })
      return true
    } catch (error) {
      notifications.show({ message: extractErrorMessage(error), color: 'red' })
      return false
    } finally {
      setSaving(false)
    }
  }
  return { move, saving }
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
  const [value, setValue] = useState<RoadmapStageId>(stage)
  const { move, saving } = useMoveStage()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (await move(value)) onClose()
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

/**
 * The Drawer with what a stage generally involves (`ROADMAP_GUIDE`). Opened by tapping a
 * stage in the drawing. "ここを現在地にする" moves the pin to this stage without going
 * through the picker
 */
function StageGuide({
  stage,
  current,
  onClose,
  onMoved,
}: {
  /** null = closed */
  stage: RoadmapStageId | null
  current: number
  onClose: () => void
  onMoved: () => void
}) {
  const { move, saving } = useMoveStage()
  const index = stage ? stageIndex(stage) : -1
  const info = stage ? ROADMAP_STAGES[index] : null
  const guide = stage ? ROADMAP_GUIDE[stage] : null
  const state = stage ? stageState(index, current) : null
  const related = guide
    ? guide.related.map((id) => findTerm(GLOSSARY, id)).filter((t) => t !== null)
    : []
  return (
    <FormDrawer
      opened={stage !== null}
      onClose={onClose}
      title={info ? `${index + 1}. ${info.label}` : ''}
    >
      {info && guide && state ? (
        <Stack gap="md">
          <Group gap="xs">
            <Badge variant={state === 'current' ? 'filled' : 'light'} color="clay">
              {STATE_LABEL[state]}
            </Badge>
            <Text size="sm" c="dimmed">
              目安 {guide.duration}
            </Text>
          </Group>
          <Text>{guide.overview}</Text>
          <GuideSection title="この段階でやること" items={guide.tasks} />
          <GuideSection title="決めること・確かめること" items={guide.decisions} />
          <GuideSection title="気をつけること" items={guide.cautions} />
          {related.length > 0 ? (
            <Stack gap={4}>
              <Text fw={700} size="sm">
                用語集で読む
              </Text>
              <Group gap="xs">
                {related.map((t) => (
                  <Link
                    key={t.id}
                    to="/glossary/$termId"
                    params={{ termId: t.id }}
                    onClick={onClose}
                    style={{ textDecoration: 'none' }}
                  >
                    <Button component="span" variant="default" size="compact-sm">
                      {t.term}
                    </Button>
                  </Link>
                ))}
              </Group>
            </Stack>
          ) : null}
          <Text size="xs" c="dimmed">
            一般的な流れの説明です。期間や順番は会社や土地の事情で変わります。
          </Text>
          {state !== 'current' ? (
            <div className="form-actions">
              <Button
                fullWidth
                loading={saving}
                onClick={async () => {
                  if (await move(stage as RoadmapStageId)) onMoved()
                }}
              >
                ここを現在地にする
              </Button>
            </div>
          ) : null}
        </Stack>
      ) : null}
    </FormDrawer>
  )
}

function GuideSection({ title, items }: { title: string; items: string[] }) {
  return (
    <Stack gap={4}>
      <Text fw={700} size="sm">
        {title}
      </Text>
      <List size="sm" spacing={4}>
        {items.map((item) => (
          <List.Item key={item}>{item}</List.Item>
        ))}
      </List>
    </Stack>
  )
}
