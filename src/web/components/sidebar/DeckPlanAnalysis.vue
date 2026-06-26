<template>
  <section v-if="analysis" class="deck-plan-analysis" aria-label="Deck plan analysis">
    <header class="deck-plan-analysis__header">
      <div>
        <p>Deck plan analysis</p>
        <h2>{{ analysis.primaryPlan }}</h2>
      </div>
      <span>{{ analysis.score }}/100</span>
    </header>

    <p class="deck-plan-analysis__summary">{{ analysis.summary }}</p>

    <div class="deck-plan-analysis__signals">
      <div v-for="signal in analysis.signals" :key="signal.id" class="plan-signal" :title="signal.summary">
        <span>{{ signal.label }}</span>
        <b :class="`plan-signal__value--${signal.tone}`">{{ signal.value }}</b>
        <i><i :class="`plan-signal__bar--${signal.tone}`" :style="{ width: `${Math.min(100, Math.max(0, signal.value))}%` }" /></i>
      </div>
    </div>

    <div v-if="analysis.packages.length" class="deck-plan-analysis__section">
      <h3>Engine packages</h3>
      <button
        v-for="pkg in analysis.packages.slice(0, 5)"
        :key="pkg.id"
        type="button"
        class="plan-package"
        @click="selectCards(pkg.cards)"
      >
        <span>{{ pkg.label }}</span>
        <b>{{ pkg.count }}</b>
        <small>{{ pkg.summary }}</small>
      </button>
    </div>

    <div class="deck-plan-analysis__columns">
      <section>
        <h3>Core engine</h3>
        <button v-for="card in analysis.coreEngine.slice(0, 8)" :key="card.id" type="button" @click="selectCard(card.id)">
          <span>{{ card.label }}</span>
          <small>{{ card.note }}</small>
        </button>
      </section>
      <section>
        <h3>Support shell</h3>
        <button v-for="card in analysis.supportShell.slice(0, 8)" :key="card.id" type="button" @click="selectCard(card.id)">
          <span>{{ card.label }}</span>
          <small>{{ card.note }}</small>
        </button>
      </section>
    </div>

    <div v-if="analysis.weakSpots.length || analysis.offPlanCards.length" class="deck-plan-analysis__section">
      <h3>Review queue</h3>
      <button v-for="spot in analysis.weakSpots" :key="spot.id" type="button" class="plan-review">
        <span>{{ spot.label }}</span>
        <b>{{ spot.value }}</b>
        <small>{{ spot.note }}</small>
      </button>
      <button v-for="card in analysis.offPlanCards.slice(0, 8)" :key="card.id" type="button" class="plan-review" @click="selectCard(card.id)">
        <span>{{ card.label }}</span>
        <b>{{ card.role }}</b>
        <small>{{ card.note }}</small>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { DeckPlanAnalysis } from '../../services/deckPlanAnalysis'

defineProps<{
  analysis: DeckPlanAnalysis | null
}>()

const emit = defineEmits<{
  (event: 'select-card', id: string): void
  (event: 'select-cards', ids: string[]): void
}>()

function selectCard(id: string) {
  emit('select-card', id)
}

function selectCards(ids: string[]) {
  emit('select-cards', ids)
}
</script>

<style scoped>
.deck-plan-analysis{background:rgba(255,255,255,.025);border:1px solid var(--line,#2c2838);border-radius:14px;display:grid;gap:12px;padding:14px}.deck-plan-analysis__header{align-items:flex-start;display:flex;gap:12px;justify-content:space-between}.deck-plan-analysis__header p{color:var(--dim,#8b98a8);font-size:11px;font-weight:900;letter-spacing:.08em;margin:0;text-transform:uppercase}.deck-plan-analysis__header h2{font-size:22px;line-height:1.15;margin:4px 0 0}.deck-plan-analysis__header>span{background:rgba(84,201,138,.13);border:1px solid rgba(84,201,138,.28);border-radius:999px;color:#8be0b0;font-size:13px;font-weight:900;padding:5px 9px;white-space:nowrap}.deck-plan-analysis__summary{color:#cfc8dc;font-size:13px;line-height:1.45;margin:0}.deck-plan-analysis__signals{display:grid;gap:7px;grid-template-columns:repeat(5,minmax(0,1fr))}.plan-signal{background:rgba(255,255,255,.035);border:1px solid var(--line,#2c2838);border-radius:10px;display:grid;gap:5px;padding:9px}.plan-signal span{color:var(--dim,#8b98a8);font-size:10px;font-weight:900;letter-spacing:.05em;text-transform:uppercase}.plan-signal b{font-size:20px;line-height:1}.plan-signal__value--ok{color:#8be0b0}.plan-signal__value--watch{color:#ead77c}.plan-signal__value--warn{color:#ff9a6d}.plan-signal>i{background:rgba(255,255,255,.08);border-radius:999px;display:block;height:5px;overflow:hidden}.plan-signal>i>i{border-radius:999px;display:block;height:100%}.plan-signal__bar--ok{background:#54c98a}.plan-signal__bar--watch{background:#e0c85a}.plan-signal__bar--warn{background:#ff7a3d}.deck-plan-analysis__section{display:grid;gap:7px}.deck-plan-analysis h3{color:var(--dim,#8b98a8);font-size:11px;font-weight:900;letter-spacing:.08em;margin:0;text-transform:uppercase}.plan-package,.deck-plan-analysis__columns button,.plan-review{background:rgba(255,255,255,.035);border:1px solid transparent;border-radius:10px;color:var(--text,#e8e4f0);cursor:pointer;display:grid;font:inherit;gap:3px 8px;grid-template-columns:minmax(0,1fr) auto;padding:9px;text-align:left;width:100%}.plan-package:hover,.deck-plan-analysis__columns button:hover,.plan-review:hover{border-color:rgba(90,166,255,.45)}.plan-package span,.deck-plan-analysis__columns span,.plan-review span{font-size:13px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.plan-package b,.plan-review b{background:rgba(90,166,255,.14);border-radius:999px;color:#9cc8ff;font-size:11px;padding:2px 7px}.plan-package small,.deck-plan-analysis__columns small,.plan-review small{color:var(--dim,#8b98a8);font-size:11px;grid-column:1 / -1;line-height:1.35}.deck-plan-analysis__columns{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr))}.deck-plan-analysis__columns section{display:grid;gap:7px}
@media(max-width:760px){.deck-plan-analysis__signals,.deck-plan-analysis__columns{grid-template-columns:1fr}.deck-plan-analysis__header{display:grid}.deck-plan-analysis__header>span{justify-self:start}}
</style>
