import type { RoadmapStageId } from '../lib/roadmap'

/**
 * What each stage of 「家づくりのロードマップ」 (House-building roadmap) generally involves.
 * Opened by tapping a stage on the home page. **Data only**, general to a custom house in
 * Japan; nothing here is about the two of them, their land, their vendors or their money
 * (AGENTS.md rule 1, design.md §1). `related` holds ids of `GLOSSARY` (src/content/glossary.ts).
 */
export type RoadmapStageGuide = {
  /** What this stage is for, in 1 to 2 sentences */
  overview: string
  /** Rough length of the stage. Shown as a rough guide, not a promise */
  duration: string
  /** What is usually done */
  tasks: string[]
  /** What has to be decided or checked before moving on */
  decisions: string[]
  /** Things that often go wrong or are forgotten */
  cautions: string[]
  /** Glossary ids worth reading at this stage */
  related: string[]
}

export const ROADMAP_GUIDE: Record<RoadmapStageId, RoadmapStageGuide> = {
  research: {
    overview:
      '家づくりの全体像をつかみ、自分たちの「こうしたい」と「ゆずれない」をはっきりさせる段階です。',
    duration: '1〜3 か月（長い人は 1 年以上）',
    tasks: [
      '住宅展示場・完成見学会・モデルハウスに足を運ぶ',
      '工務店やハウスメーカーの動画・SNS・施工例を見る',
      '断熱・気密・耐震などの性能の言葉を知る（用語集）',
      '家族で「暮らし方」を話し合い、希望を書き出す',
    ],
    decisions: [
      '戸建てかマンションか、新築か中古か',
      '住みたいエリアと、通勤・通学・親との距離',
      'おおよその予算感（土地・建物・諸費用の 3 つに分けて）',
    ],
    cautions: [
      '展示場のモデルハウスは標準より大きく豪華なことが多い',
      '営業担当に名前と連絡先を渡すと、その後の連絡が増える',
      '見たものを記録しないと、数か月後にはどこで何を見たか分からなくなる',
    ],
    related: ['open-house', 'model-house', 'insulation-grade', 'ua-value', 'tsubo-price'],
  },
  vendor: {
    overview:
      '候補の会社を 2〜3 社に絞り、話を聞きながら「この会社と建てる」を決めていく段階です。',
    duration: '2〜4 か月',
    tasks: [
      '候補の会社に相談し、希望と予算を伝える',
      '性能の数値・標準仕様・保証・アフターを比べる',
      'その会社で建てた人の家（完成見学会・OB 宅）を見る',
      '設計の進め方（設計者が誰か、何回打ち合わせできるか）を聞く',
    ],
    decisions: [
      '工務店・ハウスメーカー・設計事務所のどの形で建てるか',
      '相談を続ける会社と、やめる会社',
      '担当者と相性が合うか（長い付き合いになる）',
    ],
    cautions: [
      '坪単価は会社ごとに含まれる範囲が違うので、そのまま比べない',
      '「今月契約すれば値引き」は急がせるための言葉。期限で決めない',
      '会社ごとの話の記録を残し、後で見比べられるようにする',
    ],
    related: [
      'design-build-split',
      'supervision',
      'performance-label',
      'handover-warranty',
      'tsubo-price',
    ],
  },
  land: {
    overview:
      '建てる土地の条件を確かめ、お金の見通しを立てる段階です。土地が決まらないと間取りも金額も決まりません。',
    duration: '1〜3 か月（土地探しからなら半年以上）',
    tasks: [
      '敷地の形・接道・高低差・インフラ（水道・下水・ガス）を確かめる',
      '用途地域・建ぺい率・容積率・高さの制限を調べる',
      'ハザードマップで水害・土砂災害のリスクを見る',
      '住宅ローンの事前審査を受け、借りられる額を知る',
      '親族の土地なら、名義・境界・贈与や相続の扱いを整理する',
    ],
    decisions: [
      '土地を確定する（買う／親族の土地を使う／分筆する）',
      '自己資金・ローン・親からの支援の内訳',
      '総予算の上限（建物・外構・諸費用・引っ越し・家具まで）',
    ],
    cautions: [
      '測量や地盤改良で思わぬ費用が出る。予備費を見ておく',
      '親族の土地でも、境界や登記が曖昧だと建築や融資で止まることがある',
      '借りられる額と、無理なく返せる額は別',
    ],
    related: [
      'parent-land',
      'land-survey',
      'boundary',
      'road-access',
      'hazard-map',
      'loan-screening',
    ],
  },
  plan: {
    overview:
      '間取りの提案を受け、概算の見積と見比べながら「この家で行ける」と思える形に近づける段階です。',
    duration: '1〜3 か月',
    tasks: [
      '要望をもとにプラン（間取り・配置・外観）の提案を受ける',
      '延床面積・階数・部屋数を調整し、概算見積を出してもらう',
      '敷地への配置（日当たり・隣家との距離・駐車）を図で確かめる',
      '必要なら地盤調査を行い、地盤改良の要否を知る',
    ],
    decisions: [
      '間取りの大枠（平屋か 2 階建てか、LDK の広さ、部屋数）',
      '予算に収まる仕様の線引き（何を標準にし、何をオプションにするか）',
      '契約する会社を 1 社に決める',
    ],
    cautions: [
      '概算見積に外構・カーテン・照明・エアコン・地盤改良が入っているか確認する',
      '図面だけでは広さの感覚がつかみにくい。見学した家の面積と比べる',
      'この段階で詰めきれなくても、大枠が合っていれば契約後に調整できる項目もある',
    ],
    related: ['layout-terms', 'tsubo', 'floor-areas', 'extra-costs', 'design-fee'],
  },
  contract: {
    overview:
      '工事請負契約を結び、金額・工期・支払いの約束を書面にする段階です。ここから先は変更に費用がかかります。',
    duration: '2〜4 週間',
    tasks: [
      '契約書・約款・見積書・図面・仕様書の内容を読み合わせる',
      '支払いの時期と額（契約時・着工時・上棟時・引き渡し時）を確認する',
      '住宅ローンの本審査を申し込む',
      '契約金・印紙代を支払う',
    ],
    decisions: [
      '契約する金額と、含まれる工事の範囲',
      '工期と引き渡しの予定時期',
      '追加や変更が出たときの扱い（見積の出し方、承認の方法）',
    ],
    cautions: [
      '契約前に重要事項の説明を受ける。分からない項目はその場で聞く',
      '「別途工事」「施主支給」の項目は後から大きな出費になりやすい',
      'ローンが通らなかったときの解約条件（ローン特約）を確認する',
    ],
    related: [
      'important-matters',
      'payment-schedule',
      'stamp-registration-tax',
      'defect-insurance',
    ],
  },
  design: {
    overview:
      '間取りを確定し、窓・断熱・設備・内装・外装の仕様を細かく決め、建築確認を受ける段階です。打ち合わせが最も多い時期です。',
    duration: '2〜4 か月',
    tasks: [
      '窓の位置と大きさ、コンセント・照明・スイッチの位置を決める',
      'キッチン・浴室・トイレ・床・壁・建具をショールームで選ぶ',
      '外壁・屋根・玄関ドアの色と素材を決める',
      '構造計算と省エネ計算の結果を確認する',
      '建築確認申請を出し、確認済証を受ける',
    ],
    decisions: [
      '最終の図面と仕様書（これが工事の基準になる）',
      '追加・減額の確定金額',
      '外構を同じ会社に頼むか、別に頼むか',
    ],
    cautions: [
      '決めることが多く疲れる。優先順位を決め、こだわる所とお任せする所を分ける',
      '確認申請の後に間取りを変えると、再申請で時間と費用がかかる',
      '打ち合わせの決定事項は書面で残し、図面に反映されているかを確かめる',
    ],
    related: ['building-confirmation', 'window-spec', 'ground-survey-improvement', 'bcr-far'],
  },
  build: {
    overview:
      '工事が始まり、基礎・構造・屋根・内装と家の形ができていく段階です。現場を見に行くと、図面では分からないことが分かります。',
    duration: '4〜6 か月',
    tasks: [
      '地鎮祭（やるかどうかは自由）と近隣への挨拶',
      '基礎の配筋・コンクリートを確認する',
      '上棟（棟上げ）で構造が組み上がる',
      '断熱・気密の施工と気密測定（やる会社の場合）',
      '内装・設備の取り付け、外構の工事',
      'つなぎ融資や中間金の支払い',
    ],
    decisions: [
      '現場で出た質問（コンセントの高さ、棚の位置など）への回答',
      '気になった施工を指摘するかどうか（早いほど直しやすい）',
    ],
    cautions: [
      '天候や資材の遅れで工期は伸びることがある。引っ越しの予定は余裕をもつ',
      '現場に行くときは事前に連絡し、ヘルメットなど安全に配慮する',
      '写真を撮っておくと、壁の中の配線・配管の位置が後で分かる',
    ],
    related: ['ground-breaking', 'foundation', 'bridge-loan', 'payment-schedule'],
  },
  handover: {
    overview:
      '完成した家を検査し、鍵を受け取って住み始める段階です。入居後の手続きとアフターの付き合いが始まります。',
    duration: '2〜4 週間（入居後の手続きを含めると数か月）',
    tasks: [
      '完了検査（役所または検査機関）を受ける',
      '施主検査で傷・汚れ・動作を確かめ、直してもらう',
      '設備の使い方の説明を受け、保証書・図面・鍵を受け取る',
      '残金の支払い、ローンの実行、登記',
      '引っ越し、住所変更、火災保険の開始',
    ],
    decisions: ['引き渡し日と引っ越し日', '補修の期限と、残った工事（外構など）の扱い'],
    cautions: [
      '施主検査は明るい時間に、時間をかけて行う。遠慮せず指摘する',
      '住宅ローン控除・固定資産税・不動産取得税の手続きと時期を確認する',
      '引き渡し後も定期点検がある。気になった点は記録して点検時に伝える',
    ],
    related: ['completion-inspection', 'handover-warranty', 'mortgage-deduction', 'property-taxes'],
  },
}
