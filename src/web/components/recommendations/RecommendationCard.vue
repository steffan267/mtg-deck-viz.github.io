<template>
  <article class="rec-card" :class="{ open }">
    <button class="rec-head" type="button" @click="open = !open">
      <span class="rec-title">
        <strong class="rec-name">{{ row.name }}</strong>
        <small class="rec-meta">{{ roleLabel }} · MV {{ row.cmc || 0 }} · {{ row.newEdges || 0 }} new links</small>
      </span>
      <span class="rec-score">{{ detail }}</span>
    </button>
    <div v-if="open" class="rec-body">
      <span class="rec-chip">win {{ signed(row.deltaWin) }}</span>
      <span class="rec-chip">cohesion {{ signed(row.deltaCohesion) }}</span>
      <span class="rec-chip">self {{ signed(row.deltaSelf) }}</span>
      <span class="rec-chip">power {{ row.power }}</span>
      <p v-if="text" class="rec-text">{{ text }}</p>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CandidateCard } from '../../types/deck'
import type { RecommendationRow } from '../../services/recommendations'
import { shortText } from '../../services/recommendations'

const props = defineProps<{
  row: RecommendationRow
  detail: string
  candidate?: CandidateCard
  roleLabels?: Record<string, string>
}>()

const open = ref(false)
const roleLabel = computed(() => props.roleLabels?.[props.row.role] || props.row.role)
const text = computed(() => shortText(props.candidate?.text || ''))

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}`
}
</script>

<style scoped>
.rec-card{background:var(--panel2,#1f1c28);border:1px solid var(--line,#334155);border-radius:14px;overflow:hidden}.rec-card.open{border-color:rgba(217,67,79,.55)}.rec-head{align-items:center;background:transparent;border:0;color:inherit;cursor:pointer;display:grid;gap:.75rem;grid-template-columns:minmax(0,1fr) max-content;min-height:58px;padding:.75rem 1rem;text-align:left;width:100%}.rec-head:hover{background:rgba(255,255,255,.045)}.rec-title{display:grid;gap:3px;min-width:0}.rec-name,.rec-meta{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rec-name{font-size:14px;line-height:1.2}.rec-meta{color:var(--dim,#94a3b8);font-size:11px}.rec-score{color:var(--accent,#d9434f);font-variant-numeric:tabular-nums;font-weight:800;justify-self:end;white-space:nowrap}.rec-body{border-top:1px solid var(--line,#334155);display:flex;flex-wrap:wrap;gap:.4rem;padding:.75rem 1rem}.rec-chip{background:rgba(255,255,255,.035);border:1px solid var(--line,#334155);border-radius:999px;font-size:.78rem;padding:.18rem .5rem;white-space:nowrap}.rec-text{color:var(--dim,#94a3b8);flex-basis:100%;font-size:12px;line-height:1.4;margin:.35rem 0 0}@media(max-width:420px){.rec-head{grid-template-columns:minmax(0,1fr)}.rec-score{justify-self:start}}
</style>
