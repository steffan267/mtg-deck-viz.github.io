<template>
  <form
    class="import-controls"
    :class="{ 'import-controls--dragging': dragging }"
    @submit.prevent="submitUrl"
    @dragenter.prevent="dragging = true"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="dropFile"
  >
    <div class="import-controls__split">
      <label class="import-controls__url">
        <span class="sr-only">Moxfield URL</span>
        <input
          v-model.trim="url"
          type="text"
          placeholder="Paste Moxfield URL + Enter…"
          :disabled="loading"
          @keydown.enter.prevent="submitUrl"
        />
      </label>
      <div class="import-controls__more">
        <button class="btn import-controls__more-button" type="button" :disabled="loading" :aria-expanded="showMenu ? 'true' : 'false'" aria-label="More import options" @click="showMenu = !showMenu">▾</button>
        <div v-if="showMenu" class="import-controls__menu" role="menu">
          <label class="import-controls__menu-item" role="menuitem">
            Import file…
            <input type="file" accept=".txt,text/plain" :disabled="loading" @change="selectFile" />
          </label>
          <button class="import-controls__menu-item" type="button" role="menuitem" :disabled="loading" @click="openPaste">Paste list</button>
        </div>
      </div>
    </div>

    <p v-if="progress" class="import-controls__progress">
      {{ progress.label }}<span v-if="progress.total"> — {{ progress.done || 0 }}/{{ progress.total }}</span>
    </p>
    <ErrorNotice v-if="error" :message="error" title="Import failed" />

    <div v-if="showPaste" class="import-controls__paste-backdrop" role="presentation" @click.self="showPaste = false">
      <section class="import-controls__paste-modal" role="dialog" aria-modal="true" aria-label="Paste decklist">
        <header class="import-controls__paste-header">
          <h3>Paste decklist</h3>
          <button class="import-controls__paste-close" type="button" aria-label="Close paste decklist" @click="showPaste = false">×</button>
        </header>
        <textarea v-model="deckText" rows="8" placeholder="Paste a plain text decklist, one card per line…"></textarea>
        <div class="import-controls__paste-actions">
          <button class="btn" type="button" @click="showPaste = false">Cancel</button>
          <button class="btn" type="button" :disabled="loading || !deckText.trim()" @click="submitText">Import pasted list</button>
        </div>
      </section>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import ErrorNotice from '../common/ErrorNotice.vue'
import type { DeckImportSource, ImportProgress } from '../../services/import'

const props = defineProps<{
  loading?: boolean
  progress?: ImportProgress | null
  error?: string | null
}>()

const emit = defineEmits<{
  import: [DeckImportSource]
}>()

const url = ref('')
const dragging = ref(false)
const showMenu = ref(false)
const showPaste = ref(false)
const deckText = ref('')
const pendingUrl = ref(false)
const pendingText = ref(false)

watch(() => [props.loading, props.error] as const, ([loading, error]) => {
  if (loading) return
  if (error) {
    pendingUrl.value = false
    pendingText.value = false
    return
  }
  clearCompletedImport()
})

function submitUrl() {
  if (!url.value || props.loading) return
  emit('import', { kind: 'url', url: url.value })
  pendingUrl.value = true
  window.setTimeout(clearCompletedImport, 0)
}

function selectFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('import', { kind: 'file', file })
  input.value = ''
  showMenu.value = false
}

function dropFile(event: DragEvent) {
  dragging.value = false
  if (props.loading) return
  const file = event.dataTransfer?.files?.[0]
  if (file) emit('import', { kind: 'file', file })
}

function openPaste() {
  showMenu.value = false
  showPaste.value = true
}

function submitText() {
  if (!deckText.value.trim() || props.loading) return
  emit('import', { kind: 'text', text: deckText.value, title: 'Pasted decklist' })
  pendingText.value = true
  window.setTimeout(clearCompletedImport, 0)
}

function clearCompletedImport() {
  if (props.loading || props.error) return
  if (pendingUrl.value) {
    url.value = ''
    pendingUrl.value = false
  }
  if (pendingText.value) {
    deckText.value = ''
    showPaste.value = false
    pendingText.value = false
  }
}
</script>

<style scoped>
.import-controls{display:grid;gap:.5rem;max-width:100%;position:relative}.import-controls--dragging{outline:2px dashed var(--accent);outline-offset:4px}.import-controls__split{display:grid;grid-template-columns:minmax(0,1fr) auto;position:relative}.import-controls__url input{border-radius:8px 0 0 8px;min-width:0;width:100%}.import-controls__more{position:relative}.import-controls__more-button{border-left:0;border-radius:0 8px 8px 0;min-width:38px;padding-left:.65rem;padding-right:.65rem}.import-controls__menu{background:var(--panel,#17151d);border:1px solid var(--line,rgba(255,255,255,.14));border-radius:10px;box-shadow:0 14px 40px rgba(0,0,0,.38);display:grid;gap:4px;min-width:150px;padding:6px;position:absolute;right:0;top:calc(100% + 6px);z-index:30}.import-controls__menu-item{background:transparent;border:0;border-radius:8px;color:var(--text,#e8e4f0);cursor:pointer;font:inherit;font-size:12px;font-weight:700;padding:8px 10px;text-align:left;width:100%}.import-controls__menu-item:hover{background:var(--panel2,#1f1c28)}.import-controls__menu-item input{display:none}.import-controls__progress{color:var(--dim);font-size:11px;margin:0}.import-controls__paste-backdrop{align-items:center;background:rgba(8,7,11,.72);display:flex;inset:0;justify-content:center;position:fixed;z-index:50}.import-controls__paste-modal{background:var(--panel,#17151d);border:1px solid var(--line,rgba(255,255,255,.14));border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.48);display:grid;gap:10px;max-width:min(520px,calc(100vw - 28px));padding:14px;width:520px}.import-controls__paste-header{align-items:center;display:flex;justify-content:space-between}.import-controls__paste-header h3{font-size:16px;margin:0}.import-controls__paste-close{background:transparent;border:0;color:var(--dim,#9a93ac);cursor:pointer;font-size:22px;line-height:1}.import-controls__paste-close:hover{color:var(--text,#e8e4f0)}.import-controls__paste-modal textarea{min-height:180px;resize:vertical;width:100%}.import-controls__paste-actions{display:flex;gap:8px;justify-content:flex-end}.sr-only{clip:rect(0,0,0,0);height:1px;overflow:hidden;position:absolute;width:1px}
@media(max-width:520px){.import-controls__paste-backdrop{align-items:stretch;padding:10px}.import-controls__paste-modal{align-self:center;max-height:calc(100dvh - 20px);overflow:auto;width:100%}.import-controls__paste-modal textarea{min-height:140px}.import-controls__paste-actions{display:grid;grid-template-columns:1fr}.import-controls__paste-actions .btn{justify-content:center;width:100%}}
</style>
