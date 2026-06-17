<template>
  <div class="score-band" :title="title">
    <span class="score-band__value" :style="valueStyle">{{ value }}</span>
    <span v-if="max" class="score-band__max">/ {{ max }}</span>
    <span v-if="band" class="score-band__label">{{ band }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Tone } from '../../types/ui'

const props = withDefaults(defineProps<{
  value: number | string
  max?: number
  band?: string
  title?: string
  tone?: Tone
}>(), {
  max: undefined,
  band: undefined,
  title: undefined,
  tone: 'default',
})

const toneColor: Record<Tone, string | undefined> = {
  default: undefined,
  info: '#5aa6ff',
  success: '#54c98a',
  warning: '#e0c85a',
  danger: '#ff7a3d',
}

const valueStyle = computed(() => toneColor[props.tone] ? { color: toneColor[props.tone] } : undefined)
</script>

<style scoped>
.score-band{align-items:baseline;display:flex;gap:5px}.score-band__value{color:var(--text,#e7eef9);font-size:30px;font-weight:800;line-height:1}.score-band__max{color:var(--dim,#8b98a8);font-size:12px}.score-band__label{color:var(--dim,#8b98a8);font-size:10px;letter-spacing:.08em;text-transform:uppercase}
</style>
