/**
 * The halves of the combined spec rows on the vendor detail ("UA値 / C値" and
 * "耐震等級 / 長期優良"). A half that is not registered is null, so the screen shows only the
 * present half and drops the whole row when both are null (no 「—」, SHIG 1, 37).
 *
 * `cValuePublished` is a boolean whose false means both "not checked yet" and "confirmed not
 * public", so false is shown as nothing rather than 「非公開」 (SHIG 56). Telling the two apart
 * needs a tri-state column (left to the owner).
 */
export function vendorSpecHalves(v: {
  uaValue: number | null
  cValuePublished: boolean
  seismicGrade: number | null
  longTermCertified: boolean
}): { ua: string | null; c: string | null; seismic: string | null; longTerm: string | null } {
  return {
    ua: v.uaValue == null ? null : String(v.uaValue),
    c: v.cValuePublished ? '実測公開' : null,
    seismic: v.seismicGrade == null ? null : String(v.seismicGrade),
    longTerm: v.longTermCertified ? '対応' : null,
  }
}
