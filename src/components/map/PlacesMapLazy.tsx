import { Skeleton } from '@mantine/core'
import { ClientOnly } from '@tanstack/react-router'
import { lazy, Suspense, type ComponentProps } from 'react'

const Inner = lazy(() => import('./PlacesMap').then((m) => ({ default: m.PlacesMap })))

/**
 * Google Maps JavaScript API は window に依存するため SSR では評価できない。
 * `ClientOnly` でハイドレーション後まで待ち、さらに `lazy` で PlacesMap 自体の
 * import（＝API ローダーの import）もクライアントでしか走らせない。
 */
export function PlacesMapLazy(props: ComponentProps<typeof Inner>) {
  return (
    <ClientOnly fallback={<Skeleton h="100%" mih={200} />}>
      <Suspense fallback={<Skeleton h="100%" mih={200} />}>
        <Inner {...props} />
      </Suspense>
    </ClientOnly>
  )
}
