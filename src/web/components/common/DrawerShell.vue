<template>
  <Teleport to="body" :disabled="!teleport">
    <aside v-if="open" class="drawer-shell" :class="`drawer-shell--${side}`" :aria-labelledby="titleId" role="dialog" aria-modal="true" tabindex="-1" ref="drawerRef" @keydown.esc="emit('close')">
      <header class="drawer-shell__header">
        <slot name="title"><h2 :id="titleId" class="drawer-shell__title">{{ title }}</h2></slot>
        <button class="drawer-shell__close" type="button" :aria-label="closeLabel" @click="emit('close')">×</button>
      </header>
      <div v-if="subtitle || $slots.subtitle" class="drawer-shell__subtitle"><slot name="subtitle">{{ subtitle }}</slot></div>
      <div class="drawer-shell__body"><slot /></div>
    </aside>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  subtitle?: string
  id?: string
  closeLabel?: string
  side?: 'left' | 'right'
  teleport?: boolean
}>(), {
  title: '',
  subtitle: '',
  id: 'drawer-shell',
  closeLabel: 'Close drawer',
  side: 'right',
  teleport: true,
})

const emit = defineEmits<{
  close: []
}>()

const drawerRef = ref<HTMLElement | null>(null)
const titleId = `${props.id}-title`

watch(() => props.open, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  drawerRef.value?.focus()
})
</script>

<style scoped>
.drawer-shell{background:var(--panel,#101821);border-left:1px solid var(--line,rgba(255,255,255,.14));bottom:0;box-shadow:0 0 60px rgba(0,0,0,.35);color:var(--text,#e7eef9);max-width:92vw;outline:none;position:fixed;top:0;width:390px;z-index:45}.drawer-shell--right{right:0}.drawer-shell--left{border-left:0;border-right:1px solid var(--line,rgba(255,255,255,.14));left:0}.drawer-shell__header{align-items:center;display:flex;gap:12px;justify-content:space-between;padding:14px 16px 6px}.drawer-shell__title{font-size:16px;margin:0}.drawer-shell__subtitle{color:var(--dim,#8b98a8);font-size:11px;line-height:1.35;padding:0 16px 12px}.drawer-shell__body{height:calc(100% - 58px);overflow:auto;padding:0 16px 16px}.drawer-shell__close{background:transparent;border:0;color:var(--dim,#8b98a8);cursor:pointer;font-size:24px;line-height:1}.drawer-shell__close:hover{color:var(--text,#e7eef9)}
</style>
