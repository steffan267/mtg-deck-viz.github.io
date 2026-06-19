<template>
  <SectionBlock class="deck-list" title="Decklist" :subtitle="summary" id="decklist" data-testid="persistent-decklist">
    <div v-if="deckCards.length" class="deck-list__cards" role="list" aria-label="Current decklist">
      <div
        v-for="node in deckCards"
        :key="node.id"
        role="listitem"
      >
        <button
          class="deck-list__card"
          :class="{ 'is-selected': node.id === selectedId }"
          type="button"
          @click="emit('select-card', node.id)"
        >
          <span class="deck-list__qty">{{ node.qty || 1 }}</span>
          <span class="deck-list__body">
            <strong>{{ node.id }}</strong>
            <small>{{ cardSummary(node) }}</small>
          </span>
        </button>
      </div>
    </div>
    <EmptyState v-else title="No deck cards" message="Import or load a deck to show its card list." />
  </SectionBlock>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EmptyState from '../common/EmptyState.vue'
import SectionBlock from '../common/SectionBlock.vue'
import { cardFaceListSummary } from '../../services/cardFaceDisplay'
import type { DeckNode } from '../../types/deck'

const props = withDefaults(defineProps<{
  nodes: DeckNode[]
  selectedId?: string | null
  roleLabels?: Record<string, string>
}>(), {
  nodes: () => [],
  selectedId: null,
  roleLabels: undefined,
})

const emit = defineEmits<{
  'select-card': [id: string]
}>()

const deckCards = computed(() => props.nodes.filter(node => node.role !== 'zone'))
const nonlandCount = computed(() => deckCards.value.filter(node => node.role !== 'land').length)
const summary = computed(() => `${deckCards.value.length} cards · ${nonlandCount.value} nonlands`)

function roleLabel(node: DeckNode): string {
  return props.roleLabels?.[node.role] || node.role
}

function cardSummary(node: DeckNode): string {
  return [
    roleLabel(node),
    `MV ${node.cmc || 0}`,
    `${node.degree || 0} links`,
    cardFaceListSummary(node),
  ].filter(Boolean).join(' · ')
}
</script>

<style scoped>
.deck-list {
  background: var(--panel, #17151d);
  position: sticky;
  top: 0;
  z-index: 3;
}

.deck-list__cards {
  display: grid;
  gap: 5px;
  max-height: min(34vh, 260px);
  min-height: 96px;
  overflow: auto;
  padding-right: 2px;
}

.deck-list__card {
  align-items: center;
  background: rgba(255, 255, 255, .03);
  border: 1px solid transparent;
  border-radius: 9px;
  color: var(--text, #e7eef9);
  cursor: pointer;
  display: grid;
  font: inherit;
  gap: 7px;
  grid-template-columns: 28px minmax(0, 1fr);
  padding: 6px 8px;
  text-align: left;
  width: 100%;
}

.deck-list__card:hover,
.deck-list__card.is-selected {
  background: var(--panel2, #1f1c28);
  border-color: rgba(90, 166, 255, .45);
}

.deck-list__card.is-selected {
  box-shadow: 0 0 0 1px rgba(90, 166, 255, .12);
}

.deck-list__qty {
  align-items: center;
  background: rgba(255, 255, 255, .05);
  border: 1px solid var(--line, rgba(255, 255, 255, .12));
  border-radius: 999px;
  color: var(--dim, #8b98a8);
  display: inline-flex;
  font-size: 11px;
  font-weight: 800;
  height: 24px;
  justify-content: center;
  line-height: 1;
  width: 24px;
}

.deck-list__body {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.deck-list__body strong,
.deck-list__body small {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.deck-list__body strong {
  font-size: 12px;
}

.deck-list__body small {
  color: var(--dim, #8b98a8);
  font-size: 10px;
}

@media (max-width: 860px) {
  .deck-list {
    position: relative;
    top: auto;
  }

  .deck-list__cards {
    max-height: 26dvh;
  }
}
</style>
