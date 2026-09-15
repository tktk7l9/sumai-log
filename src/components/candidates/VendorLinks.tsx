import { ActionIcon, Group } from '@mantine/core'
import { Globe } from 'lucide-react'

import { PLATFORM_LABEL, detectPlatform } from '../../lib/social'
import { BrandIcon } from '../icons/BrandIcon'

export function VendorLinks({
  websiteUrl,
  socialUrls,
  size = 'sm',
}: {
  websiteUrl: string | null
  socialUrls: string[]
  size?: 'sm' | 'md'
}) {
  if (!websiteUrl && socialUrls.length === 0) return null
  const px = size === 'sm' ? 16 : 20
  return (
    <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
      {websiteUrl ? (
        <ActionIcon
          component="a"
          href={websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          variant="subtle"
          size={size}
          aria-label="公式サイト"
        >
          <Globe size={px} aria-hidden />
        </ActionIcon>
      ) : null}
      {socialUrls.map((url) => {
        const p = detectPlatform(url)
        return (
          <ActionIcon
            key={url}
            component="a"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            variant="subtle"
            size={size}
            aria-label={PLATFORM_LABEL[p]}
          >
            <BrandIcon platform={p} size={px} />
          </ActionIcon>
        )
      })}
    </Group>
  )
}
