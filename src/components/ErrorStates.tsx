import { Alert, Button, Code, Group, Stack, Text, Title } from '@mantine/core'
import { Link, useRouter } from '@tanstack/react-router'
import { CircleAlert, House, RotateCw, SearchX } from 'lucide-react'

/**
 * 読み込みに失敗したときの画面。
 *
 * 台帳なので「取得できなかった」ことを黙って空表示にしない。
 * 空っぽの一覧と、読めなかった一覧を取り違えると判断を誤る。
 */
export function RouteErrorState({ error }: { error: unknown }) {
  const router = useRouter()
  // TanStack Router の errorComponent は error を unknown で渡す（実装は必ず Error を投げるとは限らない）。
  const message = error instanceof Error ? error.message : String(error)

  return (
    <Stack gap="lg" p="md">
      <Stack gap={4}>
        <Title order={1}>表示できませんでした</Title>
        <Text c="dimmed" size="sm">
          データの読み込みに失敗しました。表示されていない情報がある状態です。
        </Text>
      </Stack>

      <Alert
        variant="light"
        color="red"
        icon={<CircleAlert size={18} aria-hidden />}
        title="この画面の内容は信用しないでください"
      >
        一覧が空に見えても、データが無いとは限りません。読み直しても直らない場合は、
        時間をおくか、デプロイ直後であれば少し待ってから開いてください。
      </Alert>

      {message ? (
        <Stack gap={4}>
          <Text size="xs" c="dimmed">
            エラーの内容
          </Text>
          <Code block className="breakable">
            {message}
          </Code>
        </Stack>
      ) : null}

      <Group>
        <Button
          leftSection={<RotateCw size={16} aria-hidden />}
          onClick={() => router.invalidate()}
        >
          読み直す
        </Button>
        <Button
          variant="default"
          component={Link}
          to="/"
          leftSection={<House size={16} aria-hidden />}
        >
          ホームへ
        </Button>
      </Group>
    </Stack>
  )
}

/** 存在しないURLを開いたとき。 */
export function RouteNotFoundState() {
  return (
    <Stack gap="lg" p="md">
      <Stack gap={4}>
        <Title order={1}>見つかりません</Title>
        <Text c="dimmed" size="sm">
          指定されたページはありません。削除されたか、URL が違う可能性があります。
        </Text>
      </Stack>

      <Alert variant="light" color="gray" icon={<SearchX size={18} aria-hidden />}>
        物件やメモを削除したあとの古いリンクを開くと、この画面になります。
      </Alert>

      <Group>
        <Button component={Link} to="/" leftSection={<House size={16} aria-hidden />}>
          ホームへ
        </Button>
      </Group>
    </Stack>
  )
}
