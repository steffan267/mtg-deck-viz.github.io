<template>
  <SectionBlock :id="section.id">
    <template v-if="$slots.actions" #actions><slot name="actions" /></template>
    <details class="score-card">
      <summary class="score-card__summary-row">
        <span class="score-card__headline">
          <span class="score-card__label">{{ section.label }}:</span>
          <span class="score-card__value" :style="{ color: scoreColor(section) }">{{ section.value }}</span>
          <span v-if="section.band" class="score-card__band">- {{ section.band }}</span>
        </span>
        <span class="score-card__chevron" aria-hidden="true">⌄</span>
        <span v-if="section.subtitle" class="score-card__subtitle">{{ section.subtitle }}</span>
      </summary>
      <div class="score-card__details-card">
        <p v-if="section.summary" class="score-card__summary">{{ section.summary }}</p>
        <EvidenceBadgeList :items="section.evidence || []" />
        <MetricGrid :metrics="section.metrics || []" />
        <SignalBarList :signals="section.signals || []" :selectable="selectableSignals" @select="emit('signal-select', $event, section)" />
        <slot :section="section" />
      </div>
    </details>
  </SectionBlock>
</template>

<script setup lang="ts">
import type { ScoreSection, SignalBar } from '../../types/ui'
import SectionBlock from '../common/SectionBlock.vue'
import EvidenceBadgeList from './EvidenceBadgeList.vue'
import MetricGrid from './MetricGrid.vue'
import SignalBarList from './SignalBarList.vue'

withDefaults(defineProps<{
  section: ScoreSection
  selectableSignals?: boolean
}>(), {
  selectableSignals: false,
})

const emit = defineEmits<{
  'signal-select': [signal: SignalBar, section: ScoreSection]
}>()

function scoreColor(section: ScoreSection): string | undefined {
  const value = typeof section.value === 'number' ? section.value : Number(section.value)
  if (!Number.isFinite(value)) return undefined
  if (section.id === 'win') {
    if (value >= 86) return '#54c98a'
    if (value >= 74) return '#9ad17a'
    if (value >= 58) return '#e0c85a'
    if (value >= 42) return '#e0a85a'
    return '#ff7a3d'
  }
  if (value >= 70) return '#54c98a'
  if (value >= 50) return '#9ad17a'
  if (value >= 32) return '#e0a85a'
  return '#ff7a3d'
}
</script>

<style scoped>
.score-card{display:grid;gap:8px}.score-card__summary-row{align-items:center;background:transparent;border:0;color:inherit;cursor:pointer;display:grid;gap:6px 8px;grid-template-columns:minmax(0,1fr) auto;list-style:none;padding:0}.score-card__summary-row::-webkit-details-marker{display:none}.score-card__headline{align-items:baseline;display:flex;flex-wrap:wrap;gap:6px;min-width:0}.score-card__label{color:var(--text,#e7eef9);font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}.score-card__value{color:var(--text,#e7eef9);font-size:30px;font-weight:800;line-height:1}.score-card__band{color:var(--dim,#8b98a8);font-size:12px;letter-spacing:.1em;text-transform:uppercase}.score-card__subtitle{color:var(--dim,#8b98a8);font-size:12px;grid-column:1 / -1;line-height:1.35}.score-card__chevron{color:var(--dim,#8b98a8);font-size:16px;line-height:1;transition:transform .16s ease}.score-card[open] .score-card__chevron{transform:rotate(180deg)}.score-card__details-card{background:rgba(255,255,255,.035);border:1px solid var(--line,rgba(255,255,255,.12));border-radius:12px;display:grid;gap:8px;margin-top:8px;padding:10px}.score-card__summary{color:var(--text,#e7eef9);font-size:12px;line-height:1.4;margin:0}
</style>
