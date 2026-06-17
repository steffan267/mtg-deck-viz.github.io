<template>
  <SectionBlock :title="title" :subtitle="subtitle">
    <EmptyState v-if="!groups.length" title="No ranked cards" message="Interaction ranks will appear after graph analysis." />
    <div v-else class="card-ranks">
      <section v-for="group in groups" :key="group.id" class="card-ranks__group" :aria-labelledby="`${group.id}-rank-title`">
        <h3 :id="`${group.id}-rank-title`" class="card-ranks__heading">{{ group.label }}</h3>
        <ol class="card-ranks__list">
          <li v-for="row in group.rows" :key="row.id">
            <button v-if="selectable" class="card-ranks__row card-ranks__row--button" type="button" :title="row.title || row.label" @click="emit('select-card', row.id)">
              <span class="card-ranks__label">{{ row.label }}</span>
              <span class="card-ranks__bar-track"><span class="card-ranks__bar" :style="barStyle(row, maxByGroup[group.id] || 1)" /></span>
              <span class="card-ranks__value">{{ row.value }}</span>
            </button>
            <div v-else class="card-ranks__row" :title="row.title || row.label">
              <span class="card-ranks__label">{{ row.label }}</span>
              <span class="card-ranks__bar-track"><span class="card-ranks__bar" :style="barStyle(row, maxByGroup[group.id] || 1)" /></span>
              <span class="card-ranks__value">{{ row.value }}</span>
            </div>
          </li>
        </ol>
      </section>
    </div>
  </SectionBlock>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CardRankRow, RankGroup } from '../../types/ui'
import EmptyState from '../common/EmptyState.vue'
import SectionBlock from '../common/SectionBlock.vue'

const props = withDefaults(defineProps<{
  groups: RankGroup[]
  title?: string
  subtitle?: string
  selectable?: boolean
}>(), {
  groups: () => [],
  title: 'Card ranks',
  subtitle: undefined,
  selectable: false,
})

const emit = defineEmits<{
  'select-card': [cardId: string]
}>()

const maxByGroup = computed(() => Object.fromEntries(
  props.groups.map((group) => [group.id, Math.max(1, ...group.rows.map((row) => row.value))]),
))

function barStyle(row: CardRankRow, max: number) {
  const width = `${Math.max(2, Math.min(100, (row.value / max) * 100))}%`
  return { width, backgroundColor: row.color || '#888' }
}
</script>

<style scoped>
.card-ranks__group + .card-ranks__group{margin-top:10px}.card-ranks__heading{color:var(--text,#e7eef9);font-size:12px;margin:0 0 5px}.card-ranks__list{display:grid;gap:3px;list-style:none;margin:0;padding:0}.card-ranks__row{align-items:center;background:transparent;border:0;color:inherit;display:grid;font:inherit;font-size:11px;gap:7px;grid-template-columns:minmax(70px,1fr) 120px 28px;padding:1px 0;text-align:left;width:100%}.card-ranks__row--button{cursor:pointer}.card-ranks__row--button:hover .card-ranks__label{color:var(--text,#e7eef9)}.card-ranks__label{color:var(--dim,#8b98a8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.card-ranks__bar-track{background:rgba(255,255,255,.08);border-radius:3px;height:6px;overflow:hidden}.card-ranks__bar{border-radius:3px;display:block;height:100%;min-width:2px}.card-ranks__value{color:var(--text,#e7eef9);font-variant-numeric:tabular-nums;text-align:right}
@media(max-width:520px){.card-ranks__row{grid-template-columns:minmax(52px,1fr) minmax(60px,.8fr) 24px}}
</style>
