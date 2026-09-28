import { Link, createFileRoute, notFound } from '@tanstack/react-router'

import { RouteNotFoundState } from '../components/ErrorStates'
import { BackButton } from '../components/PageShell'
import { VideoDetail } from '../components/videos/VideoDetail'
import { listCommentsFor } from '../server/comments'
import { getVideo, videoFormOptions } from '../server/videos'
import { isIdLike } from '../lib/ids'

export const Route = createFileRoute('/records_/videos/$id')({
  component: Page,
  notFoundComponent: NotFound,
  loader: async ({ params }) => {
    // A malformed id can never exist; answer with the in-app 404 instead of a validator 500
    if (!isIdLike(params.id)) throw notFound()
    const [detail, options, commentData] = await Promise.all([
      getVideo({ data: { id: params.id } }),
      videoFormOptions(),
      listCommentsFor({ data: { targetType: 'video', targetId: params.id } }),
    ])
    return { ...detail, options, ...commentData }
  },
})

function Page() {
  const { video, vendor, options, comments, me, members } = Route.useLoaderData()
  return (
    <VideoDetail
      video={video}
      vendor={vendor}
      options={options}
      comments={comments}
      me={me}
      members={members}
    />
  )
}

function NotFound() {
  return (
    <RouteNotFoundState
      back={
        <BackButton
          label="記録"
          renderLink={(p) => <Link {...p} to={'/records'} search={{ tab: 'videos' }} />}
        />
      }
    />
  )
}
