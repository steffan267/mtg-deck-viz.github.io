<template>
  <button
    v-if="selectable"
    class="signal-row signal-row--button"
    type="button"
    :title="computedTitle"
    @click="emit('select', signal)"
  >
    <span class="signal-row__label">{{ signal.label }}</span>
    <span class="signal-row__track"><span class="signal-row__bar" :class="`signal-row__bar--${signal.tone || 'success'}`" :style="barStyle" /></span>
    <span class="signal-row__value">{{ displayValue }}</span>
  </button>
  <div v-else class="signal-row" :title="computedTitle">
    <span class="signal-row__label">{{ signal.label }}</span>
    <span class="signal-row__track"><span class="signal-row__bar" :class="`signal-row__bar--${signal.tone || 'success'}`" :style="barStyle" /></span>
    <span class="signal-row__value">{{ displayValue }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SignalBar } from '../../types/ui'

const props = withDefaults(defineProps<{
  signal: SignalBar
  selectable?: boolean
}>(), {
  selectable: false,
})

const emit = defineEmits<{
  select: [signal: SignalBar]
}>()

const maxValue = computed(() => props.signal.max && props.signal.max > 0 ? props.signal.max : 100)
const percent = computed(() => Math.max(0, Math.min(100, (props.signal.value / maxValue.value) * 100)))
const barStyle = computed(() => ({ width: `${percent.value}%` }))
const displayValue = computed(() => Number.isInteger(props.signal.value) ? props.signal.value : props.signal.value.toFixed(1))
const computedTitle = computed(() => {
  const cards = props.signal.cards?.length ? ` Cards: ${props.signal.cards.join(', ')}` : ''
  return `${props.signal.title || props.signal.label}.${cards}`
})
</script>

<style scoped>
.signal-row{align-items:center;background:transparent;border:0;color:inherit;display:grid;font:inherit;font-size:11px;gap:7px;grid-template-columns:86px minmax(48px,1fr) 34px;margin:3px 0;padding:0;text-align:left;width:100%}.signal-row--button{cursor:pointer}.signal-row--button:hover .signal-row__bar{filter:brightness(1.18)}.signal-row__label{color:var(--dim,#8b98a8);overflow:hidden;text-align:right;text-overflow:ellipsis;white-space:nowrap}.signal-row__track{background:rgba(255,255,255,.08);border-radius:3px;height:6px;overflow:hidden}.signal-row__bar{border-radius:3px;display:block;height:100%;min-width:2px}.signal-row__bar--default,.signal-row__bar--info{background:#5aa6ff}.signal-row__bar--success{background:#54c98a}.signal-row__bar--warning{background:#e0c85a}.signal-row__bar--danger{background:#ff7a3d}.signal-row__value{color:var(--text,#e7eef9);font-variant-numeric:tabular-nums;text-align:right}
</style>
