/** Stand-in for src/components/site/SiteView3D.tsx (three.js needs WebGL, which jsdom lacks) */
export function SiteView3D({ sun }: { sun: { season: string; hour: number } | null }) {
  return <p>{`3D（テスト用）${sun ? `・影 ${sun.season} ${sun.hour}時` : '・影なし'}`}</p>
}
