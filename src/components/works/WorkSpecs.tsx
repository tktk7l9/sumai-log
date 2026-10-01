import { List, Text } from '@mantine/core'

import { specOf } from '../../lib/works/filter'
import type { WorkRow } from '../../server/repository/works'

/**
 * The "Data" block of one work, always in the same order (points, family, area, layout) so
 * that works from different sites line up. A block the site did not give is left out entirely
 * rather than shown as "—" (SHIG 47).
 */
export function WorkSpecs({ work }: { work: WorkRow }) {
  const spec = specOf(work)
  if (spec.isEmpty) return null
  return (
    <dl className="work-specs">
      {spec.points.length > 0 ? (
        <>
          <dt>ポイント</dt>
          <dd>
            <List size="sm" spacing={2}>
              {spec.points.map((point) => (
                <List.Item key={point}>{point}</List.Item>
              ))}
            </List>
          </dd>
        </>
      ) : null}
      {spec.family ? (
        <>
          <dt>家族構成</dt>
          <dd>
            <Text size="sm">{spec.family}</Text>
          </dd>
        </>
      ) : null}
      {spec.areas.length > 0 ? (
        <>
          <dt>面積</dt>
          <dd>
            {spec.areas.map((area) => (
              <Text key={area.label} size="sm">
                {area.label} {area.value}
              </Text>
            ))}
          </dd>
        </>
      ) : null}
      {spec.layout ? (
        <>
          <dt>間取り</dt>
          <dd>
            <Text size="sm">{spec.layout}</Text>
          </dd>
        </>
      ) : null}
    </dl>
  )
}
