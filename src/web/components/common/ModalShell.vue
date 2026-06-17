<template>
  <Teleport to="body" :disabled="!teleport">
    <div v-if="open" class="modal-shell" role="presentation" @click.self="emit('close')">
      <section class="modal-shell__panel" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1" ref="panelRef" @keydown.esc="emit('close')">
        <header class="modal-shell__header">
          <slot name="title"><h2 :id="titleId" class="modal-shell__title">{{ title }}</h2></slot>
          <button class="modal-shell__close" type="button" :aria-label="closeLabel" @click="emit('close')">×</button>
        </header>
        <div class="modal-shell__body"><slot /></div>
        <footer v-if="$slots.footer" class="modal-shell__footer"><slot name="footer" /></footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  id?: string
  closeLabel?: string
  teleport?: boolean
}>(), {
  title: '',
  id: 'modal-shell',
  closeLabel: 'Close modal',
  teleport: true,
})

const emit = defineEmits<{
  close: []
}>()

const panelRef = ref<HTMLElement | null>(null)
const titleId = `${props.id}-title`

watch(() => props.open, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  panelRef.value?.focus()
})
</script>

<style scoped>
.modal-shell{background:rgba(8,7,11,.82);display:grid;inset:0;padding:24px;place-items:center;position:fixed;z-index:50}.modal-shell__panel{background:var(--panel,#17151d);border:1px solid var(--line,rgba(255,255,255,.14));border-radius:16px;box-shadow:0 18px 80px rgba(0,0,0,.55);color:var(--text,#e7eef9);max-height:min(86vh,900px);max-width:min(980px,92vw);outline:none;overflow:auto;width:100%}.modal-shell__header,.modal-shell__footer{align-items:center;display:flex;gap:12px;justify-content:space-between;padding:16px 18px}.modal-shell__header{border-bottom:1px solid var(--line,rgba(255,255,255,.12))}.modal-shell__footer{border-top:1px solid var(--line,rgba(255,255,255,.12))}.modal-shell__title{font-size:18px;margin:0}.modal-shell__body{padding:18px}.modal-shell__close{background:transparent;border:0;color:var(--dim,#8b98a8);cursor:pointer;font-size:24px;line-height:1}.modal-shell__close:hover{color:var(--text,#e7eef9)}
</style>
