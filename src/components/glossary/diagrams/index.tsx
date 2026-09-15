/**
 * 用語集の図解一覧。`term.diagram` の id からコンポーネントを引く。
 * `Record<DiagramId, React.FC>` なので、14 個のどれか一つでも欠けると型検査で落ちる。
 */

import type { FC } from 'react'

import type { DiagramId } from '../../../content/glossary'
import { AirtightLeaksDiagram } from './AirtightLeaks'
import { BcrFarDiagram } from './BcrFar'
import { CostCompareDiagram } from './CostCompare'
import { EnvelopeHeatDiagram } from './EnvelopeHeat'
import { FloorAreasDiagram } from './FloorAreas'
import { FoundationDiagram } from './Foundation'
import { PaymentTimelineDiagram } from './PaymentTimeline'
import { SeismicScaleDiagram } from './SeismicScale'
import { SetbackDiagram } from './Setback'
import { SunEaveDiagram } from './SunEave'
import { VentilationDiagram } from './Ventilation'
import { WallCoreDiagram } from './WallCore'
import { WallSectionDiagram } from './WallSection'
import { WindowHeatDiagram } from './WindowHeat'

export const DIAGRAMS: Record<DiagramId, FC> = {
  'envelope-heat': EnvelopeHeatDiagram,
  'airtight-leaks': AirtightLeaksDiagram,
  'seismic-scale': SeismicScaleDiagram,
  ventilation: VentilationDiagram,
  'window-heat': WindowHeatDiagram,
  'sun-eave': SunEaveDiagram,
  'bcr-far': BcrFarDiagram,
  setback: SetbackDiagram,
  foundation: FoundationDiagram,
  'wall-section': WallSectionDiagram,
  'floor-areas': FloorAreasDiagram,
  'payment-timeline': PaymentTimelineDiagram,
  'wall-core': WallCoreDiagram,
  'cost-compare': CostCompareDiagram,
}
