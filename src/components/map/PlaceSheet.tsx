import { Badge, Button, Drawer, Group, Stack, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'

import { PLACE_KIND_LABEL } from '../../db/schema'
import type { PlaceWithLinks } from '../../server/repository'

/** ピンをタップしたときに下から出す簡易カード */
export function PlaceSheet({
  place,
  onClose,
}: {
  place: PlaceWithLinks | null
  onClose: () => void
}) {
  return (
    <Drawer
      opened={place != null}
      onClose={onClose}
      position="bottom"
      // Mantine 9 は position="bottom" の Drawer で size="auto" を指定しても
      // コンテンツに合わせて縮まらず、常に画面いっぱいの高さになる
      // （top/bottom は flex-basis を強制的に 100% にする実装のため）。
      // 「タップで下からカード」という仕様どおり、固定高の縮小カードにする。
      // 300px は 名前見出し + 種別バッジ + 業者名 + マンション物件名 + 長め（2 行）の
      // 住所 + 「詳細を見る」ボタンをすべて表示しても収まることを実機（390×844 と
      // 1280×800）で確認した値。overflow は発生していない
      // （scrollHeight === clientHeight === 300 を確認済み）
      size={300}
      title={place?.name}
      padding="md"
      // 地図の上に重ねた操作コントロール（地図タブの現在地ボタンなど）は z-index: 1000 で
      // 描かれるため、Mantine の既定（modal: 200）のままだとシートの下に隠れる
      zIndex={1300}
    >
      {place ? (
        <Stack gap="xs">
          <Group gap="xs">
            <Badge variant="default">{PLACE_KIND_LABEL[place.kind]}</Badge>
          </Group>
          {place.vendorName ? <Text size="sm">業者: {place.vendorName}</Text> : null}
          {place.propertyName ? <Text size="sm">マンション物件: {place.propertyName}</Text> : null}
          {place.address ? (
            <Text size="sm" c="dimmed">
              {place.address}
            </Text>
          ) : null}
          <Link to="/places/$id" params={{ id: place.id }}>
            <Button component="span" fullWidth>
              詳細を見る
            </Button>
          </Link>
        </Stack>
      ) : null}
    </Drawer>
  )
}
