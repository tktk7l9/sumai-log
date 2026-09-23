import {
  Accordion,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  SegmentedControl,
  SimpleGrid,
  Slider,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import {
  ArrowDownToLine,
  ArrowUpToLine,
  CircleAlert,
  CircleCheck,
  CircleX,
  House,
} from 'lucide-react'
import { useState } from 'react'

import { PageShell } from '../components/PageShell'
import { SiteCanvas } from '../components/site/SiteCanvas'
import { extractErrorMessage } from '../lib/formError'
import {
  DEFAULT_SITE_PLAN,
  ROAD_SIDES,
  accessRect,
  ROAD_SIDE_LABEL,
  buildingDepth,
  effectiveFloorAreaRatio,
  evaluateSite,
  formatLotLines,
  m2ToTsubo,
  moveSectionToBack,
  moveSectionToFront,
  normalizePlan,
  parseLotLines,
  placeBuildingNorth,
  sectionDepth,
  type CheckStatus,
  type RoadSide,
  type SitePlan,
} from '../lib/sitePlan'
import { getSitePlan, saveSitePlan } from '../server/sitePlan'

/**
 * 区画シミュレーター（所有者の要望、2026-09-23）。大きな土地のうち一部（例: 100 坪）を
 * 自分たちの敷地として使うとき、道路側（手前）に取るか奥に取るかを図で動かして比べる。
 * 土地は長方形で近似し、保存するのは寸法の数値だけ（所在地・地番は持たない。design.md §1）。
 * 保存は二人で共有（設定 `sitePlan`）。
 */
export const Route = createFileRoute('/site')({
  component: Page,
  loader: () => getSitePlan(),
})

const STATUS_ICON: Record<CheckStatus, { Icon: typeof CircleCheck; color: string; label: string }> =
  {
    ok: { Icon: CircleCheck, color: 'var(--mantine-color-teal-7)', label: 'OK' },
    warn: { Icon: CircleAlert, color: 'var(--mantine-color-yellow-8)', label: '注意' },
    ng: { Icon: CircleX, color: 'var(--mantine-color-red-7)', label: 'NG' },
  }

function initialPlan(saved: SitePlan | null, buildPlan: { tsuboMax: number } | null): SitePlan {
  if (saved) return saved
  // 保存が無ければ既定値から。建物の坪数は建築計画（設定）の上限を使い、南側に庭が
  // 取れるよう北へ寄せて置く
  return placeBuildingNorth(
    normalizePlan({ ...DEFAULT_SITE_PLAN, buildingTsubo: buildPlan?.tsuboMax ?? 35 }),
  )
}

function num(v: string | number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function Page() {
  const { plan: saved, buildPlan } = Route.useLoaderData()
  const router = useRouter()
  const save = useServerFn(saveSitePlan)
  const [plan, setPlan] = useState<SitePlan>(() => initialPlan(saved, buildPlan))
  const [saving, setSaving] = useState(false)
  // 筆界は「10.5, 20」のような文字で入れる。打ちかけの値を消さないよう文字のまま持つ
  const [lotText, setLotText] = useState(() => formatLotLines(plan.lotLines))
  const dirty = saved === null || JSON.stringify(saved) !== JSON.stringify(plan)
  const e = evaluateSite(plan)
  const sDepth = sectionDepth(plan)
  // 区画を左右に動かせる範囲（駐車場への通路があれば、その帯を避ける）
  const lane = accessRect(plan)
  const xRange = {
    min: lane && plan.accessSide === 'left' ? plan.accessWidth : 0,
    max:
      (lane && plan.accessSide === 'right' ? plan.landWidth - plan.accessWidth : plan.landWidth) -
      plan.sectionWidth,
  }

  function update(patch: Partial<SitePlan>) {
    setPlan((p) => normalizePlan({ ...p, ...patch }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const { plan: stored } = await save({ data: plan })
      setPlan(stored)
      setLotText(formatLotLines(stored.lotLines))
      await router.invalidate()
      notifications.show({ message: '区画を保存しました' })
    } catch (error) {
      notifications.show({ message: extractErrorMessage(error), color: 'red' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell
      title="区画シミュレーター"
      description="土地を長方形で近似し、使う区画と平屋の置き方を試します。区画と建物は図の上で指で動かせます。法規の数値は目安なので、実際は市の窓口で確かめてください。"
    >
      <Stack gap="md">
        <Group gap="xs" wrap="wrap">
          <Button
            variant="default"
            size="xs"
            leftSection={<ArrowDownToLine size={14} aria-hidden />}
            onClick={() => setPlan(moveSectionToFront(plan))}
          >
            道路側に寄せる
          </Button>
          <Button
            variant="default"
            size="xs"
            leftSection={<ArrowUpToLine size={14} aria-hidden />}
            onClick={() => setPlan(moveSectionToBack(plan))}
          >
            奥に寄せる
          </Button>
          <Button
            variant="default"
            size="xs"
            leftSection={<House size={14} aria-hidden />}
            onClick={() => setPlan(placeBuildingNorth(plan))}
          >
            建物を北側へ
          </Button>
        </Group>

        <Card withBorder padding="xs">
          <SiteCanvas plan={plan} onChange={setPlan} />
        </Card>

        <SimpleGrid cols={3} spacing="xs">
          <Stat
            label="敷地"
            value={`${m2ToTsubo(e.siteArea).toFixed(1)}坪`}
            sub={`${e.siteArea.toFixed(0)}㎡`}
          />
          <Stat
            label="敷地内の通路"
            value={e.flagArea > 0 ? `${m2ToTsubo(e.flagArea).toFixed(1)}坪` : 'なし'}
            sub={e.flagArea > 0 ? `${e.flagArea.toFixed(0)}㎡` : '道路に接する'}
          />
          <Stat
            label="残りの土地"
            value={`${m2ToTsubo(Math.max(e.remainingArea, 0)).toFixed(1)}坪`}
            sub={`全体 ${m2ToTsubo(e.landArea).toFixed(0)}坪`}
          />
        </SimpleGrid>

        <Card withBorder padding="md">
          <Stack gap="xs">
            {e.checks.map((c) => {
              const { Icon, color, label } = STATUS_ICON[c.status]
              return (
                <Group key={c.id} gap="xs" wrap="nowrap" align="flex-start">
                  <Icon
                    size={18}
                    color={color}
                    aria-label={label}
                    style={{ flexShrink: 0, marginTop: 2 }}
                  />
                  <Stack gap={0}>
                    <Text size="sm" fw={600}>
                      {c.label}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {c.detail}
                    </Text>
                  </Stack>
                </Group>
              )
            })}
          </Stack>
        </Card>

        <Accordion variant="separated" multiple defaultValue={['section', 'parking']}>
          <Accordion.Item value="land">
            <Accordion.Control>土地（長方形で近似）</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Group grow>
                  <NumberInput
                    label="間口（m）"
                    description="道路に面する辺"
                    min={1}
                    max={500}
                    step={0.5}
                    decimalScale={1}
                    value={plan.landWidth}
                    onChange={(v) => update({ landWidth: num(v, plan.landWidth) })}
                  />
                  <NumberInput
                    label="奥行（m）"
                    min={1}
                    max={500}
                    step={0.5}
                    decimalScale={1}
                    value={plan.landDepth}
                    onChange={(v) => update({ landDepth: num(v, plan.landDepth) })}
                  />
                </Group>
                <Text size="xs" c="dimmed">
                  全体 {(plan.landWidth * plan.landDepth).toFixed(0)}㎡（
                  {m2ToTsubo(plan.landWidth * plan.landDepth).toFixed(1)}坪）
                </Text>
                <TextInput
                  label="筆界（左端からの距離 m）"
                  description="2 筆以上をまとめて 1 つの土地にしているとき。複数あれば「10.5, 20」のように区切る"
                  placeholder="なし"
                  value={lotText}
                  onChange={(ev) => {
                    setLotText(ev.currentTarget.value)
                    update({ lotLines: parseLotLines(ev.currentTarget.value) })
                  }}
                />
                <Text size="xs" c="dimmed">
                  公図・登記所備付地図は図上の概略で、寸法も面積も登記地積と数％〜1
                  割ずれることがあります。区画を決める前に現況測量で確かめてください。
                </Text>
                <NumberInput
                  label="前面道路の幅員（m）"
                  description="容積率の上限（幅員×0.4）・延焼ライン・南の空きに使います"
                  min={0}
                  max={50}
                  step={0.5}
                  decimalScale={1}
                  value={plan.roadWidth}
                  onChange={(v) => update({ roadWidth: num(v, plan.roadWidth) })}
                />
                <Stack gap={4}>
                  <Text size="sm" fw={500}>
                    道路の方角
                  </Text>
                  <SegmentedControl
                    fullWidth
                    aria-label="道路の方角"
                    value={plan.roadSide}
                    onChange={(v) => update({ roadSide: v as RoadSide })}
                    data={ROAD_SIDES.map((s) => ({ value: s, label: `${ROAD_SIDE_LABEL[s]}側` }))}
                  />
                </Stack>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="section">
            <Accordion.Control>区画</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Group grow>
                  <NumberInput
                    label="使う広さ（坪）"
                    min={10}
                    max={2000}
                    step={5}
                    value={plan.targetTsubo}
                    onChange={(v) => update({ targetTsubo: num(v, plan.targetTsubo) })}
                  />
                  <NumberInput
                    label="区画の幅（m）"
                    description={`奥行は ${sDepth.toFixed(1)}m`}
                    min={1}
                    max={plan.landWidth}
                    step={0.5}
                    decimalScale={1}
                    value={plan.sectionWidth}
                    onChange={(v) => update({ sectionWidth: num(v, plan.sectionWidth) })}
                  />
                </Group>
                <Stack gap={4}>
                  <Text size="sm" fw={500}>
                    道路からの距離 {plan.sectionY.toFixed(1)}m
                  </Text>
                  <Slider
                    min={0}
                    max={Math.max(plan.landDepth - sDepth, 0)}
                    step={0.5}
                    value={plan.sectionY}
                    onChange={(v) => update({ sectionY: v })}
                    label={(v) => `${v}m`}
                    disabled={plan.landDepth - sDepth <= 0}
                    aria-label="道路からの距離"
                  />
                </Stack>
                <Stack gap={4}>
                  <Text size="sm" fw={500}>
                    左端からの距離 {plan.sectionX.toFixed(1)}m
                  </Text>
                  <Slider
                    min={xRange.min}
                    max={Math.max(xRange.max, xRange.min)}
                    step={0.5}
                    value={plan.sectionX}
                    onChange={(v) => update({ sectionX: v })}
                    label={(v) => `${v}m`}
                    disabled={xRange.max - xRange.min <= 0}
                    aria-label="左端からの距離"
                  />
                </Stack>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="flag">
            <Accordion.Control>自分たちの通路（区画が奥のとき）</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Text size="xs" c="dimmed">
                  区画が道路に接しないとき、道路から区画までの通路（路地状部分）を敷地に含めます。建築基準法で敷地は道路に
                  2m
                  以上接する必要があります（神奈川県の条例に、通路の長さで幅を広げる規定はありません）。車で出入りするなら
                  3m 程度は欲しいところです。
                </Text>
                <Group grow align="flex-end">
                  <NumberInput
                    label="通路の幅（m）"
                    min={0}
                    max={plan.sectionWidth}
                    step={0.5}
                    decimalScale={1}
                    value={plan.flagWidth}
                    onChange={(v) => update({ flagWidth: num(v, plan.flagWidth) })}
                  />
                  <SegmentedControl
                    aria-label="通路の位置"
                    value={plan.flagSide}
                    onChange={(v) => update({ flagSide: v as 'left' | 'right' })}
                    data={[
                      { value: 'left', label: '左' },
                      { value: 'right', label: '右' },
                    ]}
                  />
                </Group>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="parking">
            <Accordion.Control>駐車場への通路（残りの土地）</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Text size="xs" c="dimmed">
                  道路に面する辺が 1
                  つしかない土地で、区画を道路側に取っても奥の残りの土地（月極駐車場など）へ
                  車で出入りできるよう、土地の端に道路から奥までの通路を空けます。通路は残りの土地の一部で、区画はここにかかりません。
                </Text>
                <Switch
                  label="残りの土地への通路を確保する"
                  checked={plan.parkingAccess}
                  onChange={(ev) => update({ parkingAccess: ev.currentTarget.checked })}
                />
                <Group grow align="flex-end">
                  <NumberInput
                    label="通路の幅（m）"
                    description="車 1 台なら 3m、すれ違うなら 5m 程度"
                    min={0}
                    max={plan.landWidth - 1}
                    step={0.5}
                    decimalScale={1}
                    disabled={!plan.parkingAccess}
                    value={plan.accessWidth}
                    onChange={(v) => update({ accessWidth: num(v, plan.accessWidth) })}
                  />
                  <SegmentedControl
                    aria-label="通路の位置"
                    disabled={!plan.parkingAccess}
                    value={plan.accessSide}
                    onChange={(v) => update({ accessSide: v as 'left' | 'right' })}
                    data={[
                      { value: 'left', label: '左端' },
                      { value: 'right', label: '右端' },
                    ]}
                  />
                </Group>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="building">
            <Accordion.Control>建物（平屋）</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Group grow>
                  <NumberInput
                    label="広さ（坪）"
                    min={5}
                    max={300}
                    step={1}
                    value={plan.buildingTsubo}
                    onChange={(v) => update({ buildingTsubo: num(v, plan.buildingTsubo) })}
                  />
                  <NumberInput
                    label="幅（m）"
                    description={`奥行は ${buildingDepth(plan).toFixed(1)}m`}
                    min={1}
                    max={plan.sectionWidth}
                    step={0.5}
                    decimalScale={1}
                    value={plan.buildingWidth}
                    onChange={(v) => update({ buildingWidth: num(v, plan.buildingWidth) })}
                  />
                </Group>
                <Text size="xs" c="dimmed">
                  平屋なので建築面積＝延床面積として見ています（軒・ポーチ・ウッドデッキは含みません）。
                </Text>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="rules">
            <Accordion.Control>法規の目安</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Group grow>
                  <NumberInput
                    label="建ぺい率（%）"
                    min={10}
                    max={100}
                    step={10}
                    value={plan.coverageRatio}
                    onChange={(v) => update({ coverageRatio: num(v, plan.coverageRatio) })}
                  />
                  <NumberInput
                    label="容積率（%）"
                    min={10}
                    max={1000}
                    step={10}
                    value={plan.floorAreaRatio}
                    onChange={(v) => update({ floorAreaRatio: num(v, plan.floorAreaRatio) })}
                  />
                </Group>
                <Text size="xs" c="dimmed">
                  容積率の上限は、前面道路の幅員が 12m 未満なら「幅員×0.4」と指定の小さい方（いまは{' '}
                  {effectiveFloorAreaRatio(plan)}%）。
                </Text>
                <NumberInput
                  label="境界からの離れ（m）"
                  description="外壁の後退距離の指定が無ければ、民法 234 条の 0.5m が目安"
                  min={0}
                  max={10}
                  step={0.5}
                  decimalScale={1}
                  value={plan.setback}
                  onChange={(v) => update({ setback: num(v, plan.setback) })}
                />
                <Switch
                  label="準防火地域"
                  description="隣地境界線・道路中心線から 3m 以内（図の橙の点線の外側）にかかる窓は防火設備になります"
                  checked={plan.quasiFireZone}
                  onChange={(ev) => update({ quasiFireZone: ev.currentTarget.checked })}
                />
                <Text size="xs" c="dimmed">
                  用途地域ごとの建ぺい率・容積率・外壁の後退距離・最低敷地面積・防火の指定は、市の都市計画図や窓口で確認して入力してください（防火の指定は都市計画図に描かれていないことがあるので、市の都市計画の告示で確かめる）。
                </Text>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>

        <Group justify="space-between" align="center">
          {dirty ? (
            <Badge variant="light" color="yellow">
              未保存の変更
            </Badge>
          ) : (
            <Text size="xs" c="dimmed">
              保存済み（二人で共有）
            </Text>
          )}
          <Group gap="xs">
            {saved ? (
              <Button
                variant="default"
                disabled={!dirty}
                onClick={() => {
                  setPlan(saved)
                  setLotText(formatLotLines(saved.lotLines))
                }}
              >
                元に戻す
              </Button>
            ) : null}
            <Button onClick={handleSave} loading={saving} disabled={!dirty}>
              保存
            </Button>
          </Group>
        </Group>
      </Stack>
    </PageShell>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card withBorder padding="xs">
      <Stack gap={0} align="center">
        <Text size="xs" c="dimmed">
          {label}
        </Text>
        <Text fw={700}>{value}</Text>
        <Text size="xs" c="dimmed">
          {sub}
        </Text>
      </Stack>
    </Card>
  )
}
