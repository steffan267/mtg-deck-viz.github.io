<template>
  <SectionBlock :title="title">
    <div class="deck-tabs" role="list" :aria-label="title">
      <EmptyState v-if="!tabs.length" title="No decks loaded" message="Imported decks will appear here." />
      <div v-for="(tab, index) in tabs" :key="tab.id" class="deck-tabs__row" :class="{ 'is-active': tab.id === activeId }" role="listitem">
        <span class="deck-tabs__index">{{ index + 1 }}</span>
        <button
          class="deck-tabs__tab"
          type="button"
          role="tab"
          :aria-selected="tab.id === activeId ? 'true' : 'false'"
          @click="emit('select-tab', tab.id)"
        >
          <span class="deck-tabs__label">{{ tab.label }}</span>
          <span v-if="tab.score !== undefined" class="deck-tabs__score" title="Win tuning">{{ tab.score }}</span>
        </button>
        <button v-if="tab.closeable" class="deck-tabs__close" type="button" :aria-label="`Close ${tab.label}`" @click="emit('close-tab', tab.id)">×</button>
      </div>
      <slot name="after" :next-index="tabs.length + 1" />
    </div>
  </SectionBlock>
</template>

<script setup lang="ts">
import EmptyState from '../common/EmptyState.vue'
import SectionBlock from '../common/SectionBlock.vue'

export interface DeckTabItem {
  id: string
  label: string
  score?: number | string
  closeable?: boolean
}

withDefaults(defineProps<{
  tabs: DeckTabItem[]
  activeId?: string
  title?: string
}>(), {
  tabs: () => [],
  activeId: undefined,
  title: 'Decks',
})

const emit = defineEmits<{
  'select-tab': [tabId: string]
  'close-tab': [tabId: string]
}>()
</script>

<style scoped>
.deck-tabs{display:grid;gap:6px}.deck-tabs__row{align-items:center;background:var(--panel,#17151d);border:1px solid var(--line,rgba(255,255,255,.12));border-radius:10px;display:grid;gap:6px;grid-template-columns:auto minmax(0,1fr) auto;padding:6px}.deck-tabs__row:hover,.deck-tabs__row.is-active{background:var(--panel2,#1f1c28);border-color:var(--accent,#d9434f)}.deck-tabs__index{align-items:center;background:rgba(255,255,255,.04);border:1px solid var(--line,rgba(255,255,255,.12));border-radius:999px;color:var(--dim,#8b98a8);display:inline-flex;font-size:11px;font-weight:800;height:22px;justify-content:center;line-height:1;width:22px}.deck-tabs__tab{align-items:center;background:transparent;border:0;color:var(--text,#e7eef9);cursor:pointer;display:grid;font:inherit;font-size:12px;gap:8px;grid-template-columns:minmax(0,1fr) auto;padding:2px;text-align:left;width:100%}.deck-tabs__label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.deck-tabs__score{color:var(--dim,#8b98a8);font-variant-numeric:tabular-nums}.deck-tabs__close{background:transparent;border:0;color:var(--dim,#8b98a8);cursor:pointer;font-size:16px;line-height:1;padding:0 4px}.deck-tabs__close:hover{color:#ff9a6d}
</style>
