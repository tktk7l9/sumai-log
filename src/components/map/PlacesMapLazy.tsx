import { Skeleton } from '@mantine/core'
import { ClientOnly } from '@tanstack/react-router'
import { lazy, Suspense, type ComponentProps } from 'react'

const Inner = lazy(() => import('./PlacesMap').then((m) => ({ default: m.PlacesMap })))

/**
 * The Google Maps JavaScript API depends on window, so it cannot be evaluated in SSR.
 * `ClientOnly` waits until after hydration, and `lazy` additionally makes the import of
 * PlacesMap itself (= the import of the API loader) run only on the client.
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
