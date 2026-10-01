/** Areas are stored in tsubo. 1 tsubo = 3.305785 m2 */
const SQM_PER_TSUBO = 3.305785

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function sqmToTsubo(sqm: number): number {
  return round2(sqm / SQM_PER_TSUBO)
}

/** First decimal number in the text. NFKC folds full-width digits and the dot */
export function parseNumber(text: string): number | null {
  const match = /\d+(?:\.\d+)?/.exec(text.normalize('NFKC'))
  return match ? Number(match[0]) : null
}

/** '50.50坪' -> 50.5, '120㎡' -> 36.3. NFKC turns ㎡ and m² into 'm2'. null without a unit */
export function parseArea(text: string): number | null {
  const match = /(\d+(?:\.\d+)?)\s*(坪|m2)/.exec(text.normalize('NFKC'))
  if (!match) return null
  const value = Number(match[1])
  return match[2] === '坪' ? round2(value) : sqmToTsubo(value)
}

/** The area right after a label, e.g. parseLabeledArea('延床面積 30.20坪', '延床面積') */
export function parseLabeledArea(text: string, label: string): number | null {
  const at = text.indexOf(label)
  if (at < 0) return null
  return parseArea(text.slice(at + label.length, at + label.length + 20))
}
