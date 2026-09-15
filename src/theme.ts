import { createTheme } from '@mantine/core'

export const theme = createTheme({
  primaryColor: 'clay',
  colors: {
    // 暖色の中立パレット（テラコッタ寄り）。Phase 3 の frontend-design で磨く
    clay: [
      '#fbf3ef',
      '#f3e2da',
      '#e8c6b8',
      '#dca894',
      '#d28f74',
      '#cc7f5f',
      '#ca7654',
      '#b36445',
      '#a0583c',
      '#8c4a32',
    ],
  },
  defaultRadius: 'lg',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", "Yu Gothic", Meiryo, "Segoe UI", sans-serif',
  fontSizes: { xs: '0.8125rem', sm: '0.9375rem', md: '1.0625rem', lg: '1.1875rem', xl: '1.375rem' },
  lineHeights: { xs: '1.5', sm: '1.6', md: '1.7', lg: '1.7', xl: '1.6' },
  headings: {
    fontWeight: '700',
    sizes: {
      h1: { fontSize: '1.625rem', lineHeight: '1.4' },
      h2: { fontSize: '1.375rem', lineHeight: '1.45' },
      h3: { fontSize: '1.125rem', lineHeight: '1.5' },
    },
  },
  components: {
    TextInput: { defaultProps: { size: 'md' } },
    NumberInput: { defaultProps: { size: 'md' } },
    Textarea: { defaultProps: { size: 'md' } },
    Select: { defaultProps: { size: 'md' } },
    TagsInput: { defaultProps: { size: 'md' } },
    Button: { defaultProps: { size: 'md' } },
  },
})
