/**
 * A row of filter chips. On a phone it scrolls sideways (styles.css .chip-row) so the list
 * starts within the first screen; on a wide screen it wraps. Use inside a Chip.Group or on
 * its own for independent chips
 */
export function ChipRow({
  children,
  label,
}: {
  children: React.ReactNode
  /** Name of the group for assistive technology (e.g. 「チャンネル」) */
  label: string
}) {
  return (
    <div className="chip-row" role="group" aria-label={label}>
      {children}
    </div>
  )
}
