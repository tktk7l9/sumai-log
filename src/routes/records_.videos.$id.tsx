import { createFileRoute } from '@tanstack/react-router'

import { VideoDetail } from '../components/videos/VideoDetail'
import { listCommentsFor } from '../server/comments'
import { getVideo, videoFormOptions } from '../server/videos'

export const Route = createFileRoute('/records_/videos/$id')({
  component: Page,
  loader: async ({ params }) => {
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
