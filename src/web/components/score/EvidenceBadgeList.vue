<template>
  <ul v-if="items.length" class="evidence-badges" :aria-label="label">
    <li v-for="item in items" :key="item.id" class="evidence-badges__item" :class="`evidence-badges__item--${item.tone || 'default'}`" :title="item.title">
      {{ item.label }}
    </li>
  </ul>
</template>

<script setup lang="ts">
import type { EvidenceBadge } from '../../types/ui'

withDefaults(defineProps<{
  items: EvidenceBadge[]
  label?: string
}>(), {
  items: () => [],
  label: 'Evidence',
})
</script>

<style scoped>
.evidence-badges{display:flex;flex-wrap:wrap;gap:6px;list-style:none;margin:8px 0 0;padding:0}.evidence-badges__item{background:rgba(90,166,255,.13);border:1px solid rgba(90,166,255,.28);border-radius:999px;color:#9dccff;font-size:11px;padding:2px 7px}.evidence-badges__item--success{background:rgba(84,201,138,.13);border-color:rgba(84,201,138,.32);color:#8be0b0}.evidence-badges__item--warning{background:rgba(224,200,90,.13);border-color:rgba(224,200,90,.32);color:#ead77c}.evidence-badges__item--danger{background:rgba(255,122,61,.13);border-color:rgba(255,122,61,.32);color:#ffae85}
</style>
