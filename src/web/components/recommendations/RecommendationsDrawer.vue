<template>
  <aside class="recommendations-drawer" :class="{ closed: !open }" aria-label="Recommendations">
    <header class="recommendations-drawer__header">
      <h2>Recommendations</h2>
      <button type="button" class="btn" @click="emit('close')">✕</button>
    </header>

    <div class="recommendations-drawer__controls">
      <button type="button" class="btn" :class="{ active: tab === 'global' }" @click="tab = 'global'">Suggestions</button>
      <button type="button" class="btn" :class="{ active: tab === 'deck' }" @click="tab = 'deck'">Deck cards</button>
      <select v-model="mode" :disabled="tab !== 'global'">
        <option v-for="entry in recommendationModes" :key="entry.id" :value="entry.id">{{ entry.label }}</option>
      </select>
    </div>

    <div v-if="loading" class="recommendations-drawer__status">
      Preparing recommendations… {{ progress.done }}/{{ progress.total }}
      <progress :value="progress.done" :max="progress.total || 1" />
    </div>
    <ErrorNotice v-else-if="error" :message="error" title="Recommendations failed" />

    <div v-else-if="tab === 'global'" class="recommendations-drawer__list" data-testid="recommendations-list">
      <p v-if="!rows.length" class="recommendations-drawer__empty">No positive recommendations found for this mode.</p>
      <RecommendationCard
        v-for="row in rows"
        :key="row.name"
        :row="row"
        :detail="recommendationDetail(row, mode)"
        :mode="mode"
        :candidate="candidateByLowerName.get(row.name.toLowerCase())"
        :role-labels="roleLabels"
      />
    </div>

    <div v-else class="recommendations-drawer__list" data-testid="recommendations-list">
      <input v-model.trim="deckSearch" type="search" placeholder="Search deck cards…" />
      <AppPanel v-for="node in filteredDeckCards" :key="node.id" as="article" padding="none" class="rec-card">
        <button type="button" class="rec-head" @click="emit('select-card', node.id)">
          <span>
            <strong class="rec-name">{{ node.id }}</strong>
            <small class="rec-meta">{{ roleLabels?.[node.role] || node.role }} · MV {{ node.cmc || 0 }} · {{ nodeConnectivitySummary(node) }}</small>
          </span>
        </button>
      </AppPanel>
      <p v-if="!filteredDeckCards.length" class="recommendations-drawer__empty">No deck cards match the search.</p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CandidateCard, DeckNode } from '../../types/deck'
import type { RecommendationMode, RecommendationRow } from '../../services/recommendations'
import { candidateByName, recommendationDetail, recommendationModes } from '../../services/recommendations'
import { nodeConnectivitySummary } from '../../services/nodeConnectivity'
import RecommendationCard from './RecommendationCard.vue'
import AppPanel from '../common/AppPanel.vue'
import ErrorNotice from '../common/ErrorNotice.vue'

const props = defineProps<{
  open: boolean
  loading?: boolean
  progress: { done: number; total: number }
  error?: string | null
  rows: RecommendationRow[]
  deckCards: DeckNode[]
  candidates: CandidateCard[]
  roleLabels?: Record<string, string>
  mode?: RecommendationMode
}>()

const emit = defineEmits<{
  close: []
  'select-card': [id: string]
  'update:mode': [mode: RecommendationMode]
}>()

const tab = ref<'global' | 'deck'>('global')
const deckSearch = ref('')
const mode = computed<RecommendationMode>({
  get: () => props.mode || 'total',
  set: nextMode => emit('update:mode', nextMode),
})

const candidateByLowerName = computed(() => candidateByName(props.candidates))
const filteredDeckCards = computed(() => {
  const query = deckSearch.value.toLowerCase()
  return props.deckCards.filter(node => node.role !== 'zone' && (!query || node.id.toLowerCase().includes(query)))
})
</script>

<style scoped>
.recommendations-drawer {
  background: var(--panel, #17151d);
  border-left: 1px solid var(--line, rgba(255, 255, 255, .14));
  bottom: 0;
  box-shadow: -14px 0 40px rgba(0, 0, 0, .35);
  display: flex;
  flex-direction: column;
  gap: .85rem;
  max-width: 92vw;
  min-height: 0;
  overflow: hidden;
  padding: 1rem;
  position: fixed;
  right: 0;
  top: 52px;
  width: min(420px, 92vw);
  z-index: 20;
}

.recommendations-drawer.closed {
  display: none;
}

.recommendations-drawer__header {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: .5rem;
  justify-content: space-between;
}

.recommendations-drawer__header h2 {
  font-size: 18px;
  margin: 0;
}

.recommendations-drawer__controls {
  border-bottom: 1px solid var(--line);
  border-top: 1px solid var(--line);
  display: grid;
  flex: 0 0 auto;
  gap: .6rem;
  grid-template-columns: auto auto;
  justify-content: start;
  padding: .75rem 0;
}

.recommendations-drawer__controls select {
  grid-column: 1 / -1;
  min-height: 38px;
}

.recommendations-drawer__list {
  display: grid;
  flex: 1 1 auto;
  gap: .85rem;
  grid-auto-rows: max-content;
  min-height: 0;
  overflow: auto;
  padding-right: .1rem;
}

.recommendations-drawer__status,
.recommendations-drawer__empty {
  color: var(--dim, #94a3b8);
}

.recommendations-drawer__status {
  display: grid;
  flex: 0 0 auto;
  font-weight: 700;
  gap: .5rem;
}

.recommendations-drawer__status progress {
  accent-color: var(--accent, #d9434f);
  display: block;
  width: 100%;
}

.recommendations-drawer .btn {
  align-items: center;
  background: linear-gradient(180deg, var(--panel2, #1f1c28), var(--panel, #17151d));
  border: 1px solid var(--line, rgba(255, 255, 255, .14));
  border-radius: 9px;
  color: var(--text, #e8e4f0);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  justify-content: center;
  line-height: 1;
  padding: .45rem .75rem;
}

.recommendations-drawer .btn:hover,
.recommendations-drawer .btn.active {
  border-color: var(--accent, #d9434f);
  box-shadow: 0 0 0 1px rgba(217, 67, 79, .2);
}

.recommendations-drawer select,
.recommendations-drawer input {
  background: var(--panel2, #1f1c28);
  border: 1px solid var(--line, rgba(255, 255, 255, .14));
  border-radius: 10px;
  color: var(--text, #e8e4f0);
  font: inherit;
  width: 100%;
}

.rec-card {
  background: var(--panel2, #1f1c28);
  border: 1px solid var(--line, #334155);
  border-radius: .75rem;
  overflow: hidden;
}

.rec-head {
  align-items: center;
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  display: grid;
  gap: .6rem;
  grid-template-columns: minmax(0, 1fr);
  min-height: 54px;
  padding: .75rem;
  text-align: left;
  width: 100%;
}

.rec-head:hover {
  background: rgba(255, 255, 255, .04);
}

.rec-name,
.rec-meta {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rec-name {
  font-size: 13px;
}

.rec-meta {
  color: var(--dim, #94a3b8);
  font-size: 11px;
}
</style>
