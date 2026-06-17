<template>
  <dl v-if="metrics.length" class="metric-grid">
    <div v-for="metric in metrics" :key="metric.id" class="metric-grid__item" :title="metric.title">
      <dt class="metric-grid__label">{{ metric.label }}</dt>
      <dd class="metric-grid__value">{{ metric.value }}</dd>
    </div>
  </dl>
</template>

<script setup lang="ts">
import type { MetricItem } from '../../types/ui'

withDefaults(defineProps<{
  metrics: MetricItem[]
}>(), {
  metrics: () => [],
})
</script>

<style scoped>
.metric-grid{display:grid;gap:4px 10px;grid-template-columns:1fr 1fr;margin:8px 0 0}.metric-grid__item{display:contents}.metric-grid__label{color:var(--dim,#8b98a8);font-size:12px;margin:0}.metric-grid__value{color:var(--text,#e7eef9);font-size:12px;font-weight:700;margin:0;text-align:right}
</style>
