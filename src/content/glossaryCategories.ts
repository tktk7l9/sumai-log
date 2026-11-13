/**
 * The categories of the glossary, apart from the terms (`glossary.ts`, 164 KB of text).
 *
 * A route's `validateSearch` and `loader` are not code-split, so what they import is in the
 * entry chunk of every page. The search validator needs only these ids; importing them from
 * `glossary.ts` put every term into every page (src/lib/clientBundle.test.ts keeps it out).
 * `glossary.ts` re-exports these names.
 */

export const GLOSSARY_CATEGORIES = [
  { id: 'performance', label: '性能' },
  { id: 'land', label: '土地・法規' },
  { id: 'structure', label: '構造・工法' },
  { id: 'money', label: 'お金' },
  { id: 'process', label: '進め方' },
  { id: 'condo', label: 'マンション' },
] as const

export type GlossaryCategory = (typeof GLOSSARY_CATEGORIES)[number]
export type CategoryId = GlossaryCategory['id']
