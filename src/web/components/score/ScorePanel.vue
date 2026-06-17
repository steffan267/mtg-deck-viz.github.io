<template>
  <div class="score-panel">
    <ErrorNotice v-if="error" title="Score unavailable" :message="error" />
    <EmptyState v-else-if="!sections.length" title="No scores yet" message="Load a deck to calculate win tuning, cohesion, and self-sufficiency." />
    <ScoreCard
      v-for="section in sections"
      v-else
      :key="section.id"
      :section="section"
      :selectable-signals="selectableSignals"
      @signal-select="emit('signal-select', $event, section)"
    >
      <template v-if="$slots.section" #default="slotProps"><slot name="section" v-bind="slotProps" /></template>
    </ScoreCard>
  </div>
</template>

<script setup lang="ts">
import type { ScoreSection, SignalBar } from '../../types/ui'
import EmptyState from '../common/EmptyState.vue'
import ErrorNotice from '../common/ErrorNotice.vue'
import ScoreCard from './ScoreCard.vue'

withDefaults(defineProps<{
  sections: ScoreSection[]
  error?: string
  selectableSignals?: boolean
}>(), {
  sections: () => [],
  error: undefined,
  selectableSignals: false,
})

const emit = defineEmits<{
  'signal-select': [signal: SignalBar, section: ScoreSection]
}>()
</script>

<style scoped>
.score-panel{font-size:12px}
</style>
