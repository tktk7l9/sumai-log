import { createTheme } from '@mantine/core'

/**
 * The look of "a house-building notebook for two". Aims for a warmth close to a paper
 * notebook, not an admin screen.
 *
 * Only 3 colors need to be remembered:
 *   - ground (page) = #faf7f2 / dark[7] in dark
 *   - surface (cards, header, bottom tabs) = white / dark[6]. Put things on a surface one
 *     step lighter (darker) than the ground
 *   - clay = the only accent. Used for the FAB, the selected tab, links, and the glossary
 *     figures
 *
 * Only `--mantine-color-body` (ground) and `--mantine-color-text`, which Mantine
 * hard-codes for light, are overridden with CSS variables (src/styles.css).
 * Everything else is derived from the palette here.
 */

export const theme = createTheme({
  primaryColor: 'clay',
  /** Surface color. Every card / input / header / footer in light becomes this */
  white: '#fffdfa',
  /** The black of text. Pure black is harsh on paper, so use a reddish dark brown */
  black: '#2b2420',
  colors: {
    /**
     * Terracotta accent. 2-4 are the fills of the glossary figures
     * (`var(--mantine-color-clay-N)`), so keep them light. 6 is the primary in light (white
     * text is 5.4:1), 8 is the primary in dark (white text is 8.9:1), 4 is the text color in
     * dark (6.5:1 against the ground).
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
     * Warm neutral. 0 = hover, 2 = a surface sunk one step (empty state, photo placeholder),
     * 4 = the 1px line of cards and bottom tabs, 5 = input border and placeholder (3.1:1
     * against the ground), 6 = secondary text (5.5:1).
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
     * Dark uses the same temperature. 7 = ground, 6 = surface, 5 = hover, 4 = line,
     * 3 = input border, 2 = secondary text (6.5:1), 0 = body text (14.8:1).
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
  /** Cards, buttons and inputs are all 10px. Too round looks like a sticky-note app */
  defaultRadius: 'md',
  radius: { xs: '0.25rem', sm: '0.375rem', md: '0.625rem', lg: '0.875rem', xl: '2rem' },
  /** Based on 16px: 16px left and right, 12px between cards, 24px between sections */
  spacing: { xs: '0.5rem', sm: '0.75rem', md: '1rem', lg: '1.5rem', xl: '2rem' },
  fontFamily:
    'system-ui, -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", "Yu Gothic", Meiryo, "Segoe UI", sans-serif',
  /** Body text is 16px, readable on a phone. One step each up and down */
  fontSizes: { xs: '0.75rem', sm: '0.875rem', md: '1rem', lg: '1.125rem', xl: '1.25rem' },
  /** Japanese reads better with a wider line height. The smaller the text, the tighter */
  lineHeights: { xs: '1.5', sm: '1.6', md: '1.7', lg: '1.6', xl: '1.5' },
  headings: {
    fontWeight: '700',
    sizes: {
      // page heading 24 → section heading 19 → subheading 17 → body 16 → secondary 14 → meta 12
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
    // 12px between cards. Lists line up with the same spacing on every tab
    SimpleGrid: { defaultProps: { spacing: 'sm', verticalSpacing: 'sm' } },
    // Pill-shaped badges look off-the-shelf, so make them labels with small corners
    Badge: { defaultProps: { radius: 'sm' } },
  },
})
