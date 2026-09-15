import { createTheme } from '@mantine/core'

/**
 * 「二人の家づくりノート」の見た目。管理画面ではなく、紙のノートに近い温かさを狙う。
 *
 * 色は 3 本だけ覚えればよい:
 *   - 地（ページ）= #faf7f2 / ダークは dark[7]
 *   - 面（カード・ヘッダ・下タブ）= white / dark[6]。地より一段明るい（暗い）面に乗せる
 *   - clay = 唯一のアクセント。FAB・選択中のタブ・リンク・用語集の図に使う
 *
 * Mantine が light で決め打ちしている `--mantine-color-body`（地）と
 * `--mantine-color-text` だけは CSS 変数で上書きする（src/styles.css）。
 * それ以外はここのパレットから導かれる。
 */

export const theme = createTheme({
  primaryColor: 'clay',
  /** 面の色。light の card / input / header / footer はすべてこれになる */
  white: '#fffdfa',
  /** 文字の黒。純黒は紙に乗せると硬いので、赤みのある焦げ茶にする */
  black: '#2b2420',
  colors: {
    /**
     * アクセントのテラコッタ。2〜4 は用語集の図の塗り（`var(--mantine-color-clay-N)`）なので
     * 薄いまま保つ。6 は light の primary（白字が 5.4:1）、8 は dark の primary（白字が 8.9:1）、
     * 4 は dark の文字色（地に対して 6.5:1）。
     */
    clay: [
      '#fdf4ef',
      '#f7e4d9',
      '#ecc7b4',
      '#dfa88e',
      '#d18e6e',
      '#bd7148',
      '#a3542f',
      '#8d4626',
      '#743920',
      '#5c2c19',
    ],
    /**
     * 暖色のニュートラル。0 = ホバー、2 = 一段沈めた面（空状態・写真のプレースホルダ）、
     * 4 = カードや下タブの 1px 線、5 = 入力欄の枠とプレースホルダ（地に対して 3.1:1）、
     * 6 = 補助文字（5.5:1）。
     */
    gray: [
      '#f4eee4',
      '#e9e0d3',
      '#ddd1c0',
      '#d2c4b0',
      '#c6b6a0',
      '#9c8b79',
      '#6f6257',
      '#574c43',
      '#3f3731',
      '#2b2420',
    ],
    /**
     * ダークも同じ温度で。7 = 地、6 = 面、5 = ホバー、4 = 線、3 = 入力欄の枠、
     * 2 = 補助文字（6.5:1）、0 = 本文（14.8:1）。
     */
    dark: [
      '#f0ebe4',
      '#ded6cc',
      '#a79c92',
      '#8f8279',
      '#4e453e',
      '#302b28',
      '#252120',
      '#1c1917',
      '#161312',
      '#0f0d0c',
    ],
  },
  /** カード・ボタン・入力欄すべて 10px。丸すぎると付箋アプリに見える */
  defaultRadius: 'md',
  radius: { xs: '0.25rem', sm: '0.375rem', md: '0.625rem', lg: '0.875rem', xl: '2rem' },
  /** 16px を基準に、左右 16px・カード間 12px・セクション間 24px */
  spacing: { xs: '0.5rem', sm: '0.75rem', md: '1rem', lg: '1.5rem', xl: '2rem' },
  fontFamily:
    'system-ui, -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", "Yu Gothic", Meiryo, "Segoe UI", sans-serif',
  /** スマホで読める 16px を本文に。上下は 1 段ずつ */
  fontSizes: { xs: '0.75rem', sm: '0.875rem', md: '1rem', lg: '1.125rem', xl: '1.25rem' },
  /** 日本語は行間を広めに取ると読みやすい。小さい文字ほど詰める */
  lineHeights: { xs: '1.5', sm: '1.6', md: '1.7', lg: '1.6', xl: '1.5' },
  headings: {
    fontWeight: '700',
    sizes: {
      // ページ見出し 24 → 節見出し 19 → 小見出し 17 → 本文 16 → 補助 14 → メタ 12
      h1: { fontSize: '1.5rem', lineHeight: '1.35' },
      h2: { fontSize: '1.1875rem', lineHeight: '1.45' },
      h3: { fontSize: '1.0625rem', lineHeight: '1.5' },
    },
  },
  components: {
    TextInput: { defaultProps: { size: 'md' } },
    NumberInput: { defaultProps: { size: 'md' } },
    Textarea: { defaultProps: { size: 'md' } },
    Select: { defaultProps: { size: 'md' } },
    TagsInput: { defaultProps: { size: 'md' } },
    Button: { defaultProps: { size: 'md' } },
    // カードの間は 12px。一覧はどのタブでも同じ間隔で並ぶ
    SimpleGrid: { defaultProps: { spacing: 'sm', verticalSpacing: 'sm' } },
    // 丸薬型のバッジは既製品の顔になるので、角の小さいラベルにする
    Badge: { defaultProps: { radius: 'sm' } },
  },
})
