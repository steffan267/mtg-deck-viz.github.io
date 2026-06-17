<template>
  <div v-if="signals.length" class="signal-list" :aria-label="label">
    <SignalBarRow
      v-for="signal in signals"
      :key="signal.id"
      :signal="signal"
      :selectable="selectable"
      @select="emit('select', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import type { SignalBar } from '../../types/ui'
import SignalBarRow from './SignalBarRow.vue'

withDefaults(defineProps<{
  signals: SignalBar[]
  label?: string
  selectable?: boolean
}>(), {
  signals: () => [],
  label: 'Score signals',
  selectable: false,
})

const emit = defineEmits<{
  select: [signal: SignalBar]
}>()
</script>

<style scoped>
.signal-list{margin-top:8px}
</style>
