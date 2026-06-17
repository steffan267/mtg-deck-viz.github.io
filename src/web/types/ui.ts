export type Tone = 'default' | 'info' | 'success' | 'warning' | 'danger'

export interface ActionItem {
  id: string
  label: string
  title?: string
  disabled?: boolean
  active?: boolean
  loading?: boolean
  tone?: Tone
}

export interface MetricItem {
  id: string
  label: string
  value: string | number
  title?: string
}

export interface EvidenceBadge {
  id: string
  label: string
  value?: string | number
  title?: string
  tone?: Tone
}

export interface SignalBar {
  id: string
  label: string
  value: number
  max?: number
  title?: string
  cards?: string[]
  selectableFamily?: string
  tone?: Tone
}

export interface ScoreSection {
  id: string
  label: string
  value: number | string
  max?: number
  band?: string
  axis?: 'win' | 'cohesion' | 'selfSufficiency'
  summary?: string
  subtitle?: string
  title?: string
  evidence?: EvidenceBadge[]
  signals?: SignalBar[]
  metrics?: MetricItem[]
  tone?: Tone
}

export interface RoleLegendItem {
  id: string
  label: string
  color: string
  count: number
  enabled: boolean
  title?: string
}

export interface CardRankRow {
  id: string
  label: string
  value: number
  color?: string
  title?: string
  role?: string
}

export interface RankGroup {
  id: string
  label: string
  rows: CardRankRow[]
}
