<template>
  <section class="deck-metrics-guide" aria-label="Deck building guideline signals">
    <header class="deck-metrics-guide__header">
      <p>Current deck vs guidelines</p>
      <span>{{ completedCount }}/{{ metrics.length }}</span>
    </header>
    <div v-if="metrics.length" class="deck-metrics-guide__signals">
      <div v-for="metric in metrics" :key="metric.id" class="deck-guide-signal" :title="metric.title">
        <span class="deck-guide-signal__label">{{ metric.label }}</span>
        <span class="deck-guide-signal__track"><span class="deck-guide-signal__bar" :class="`deck-guide-signal__bar--${metric.tone}`" :style="{ width: `${metric.percent}%` }" /></span>
        <span class="deck-guide-signal__value"><span class="deck-guide-signal__current" :class="{ 'deck-guide-signal__current--over': metric.overRecommended }">{{ metric.currentLabel }}</span><span>/{{ metric.targetLabel }}</span></span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import type { DeckMetricStatus } from '../../services/deckGuideMetrics'

const props = withDefaults(defineProps<{
  metrics: DeckMetricStatus[]
}>(), {
  metrics: () => [],
})

const completedCount = computed(() => props.metrics.filter(metric => metric.tone === 'ok').length)
</script>

<style scoped>
.deck-metrics-guide{background:rgba(255,255,255,.025);border:1px solid var(--line,#2c2838);border-radius:12px;display:grid;gap:8px;margin-top:10px;padding:10px}.deck-metrics-guide__header{align-items:center;display:flex;gap:8px;justify-content:space-between}.deck-metrics-guide__header p{color:var(--dim,#8b98a8);font-size:11px;font-weight:800;letter-spacing:.06em;margin:0;text-transform:uppercase}.deck-metrics-guide__header span{color:#9cc8ff;font-size:11px;font-weight:800}.deck-metrics-guide__signals{display:grid;gap:3px}.deck-guide-signal{align-items:center;display:grid;font-size:11px;gap:7px;grid-template-columns:92px minmax(48px,1fr) 52px;min-width:0}.deck-guide-signal__label{color:var(--dim,#8b98a8);overflow:hidden;text-align:right;text-overflow:ellipsis;white-space:nowrap}.deck-guide-signal__track{background:rgba(255,255,255,.08);border-radius:3px;height:6px;overflow:hidden}.deck-guide-signal__bar{border-radius:3px;display:block;height:100%;min-width:2px}.deck-guide-signal__bar--ok{background:#54c98a}.deck-guide-signal__bar--watch{background:#e0c85a}.deck-guide-signal__bar--warn{background:#ff7a3d}.deck-guide-signal__value{color:var(--text,#e7eef9);font-variant-numeric:tabular-nums;text-align:right}.deck-guide-signal__current--over{color:#e0c85a}
@media(max-width:520px){.deck-guide-signal{grid-template-columns:76px minmax(36px,1fr) 44px}.deck-metrics-guide__header{align-items:flex-start;flex-direction:column;gap:2px}.deck-guide-signal__label{text-align:left}}
</style>
