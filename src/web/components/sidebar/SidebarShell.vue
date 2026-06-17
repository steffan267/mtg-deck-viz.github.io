<template>
  <AppPanel as="aside" padding="none" class="sidebar-shell">
    <header class="sidebar-shell__header">
      <slot name="title"><h1 class="sidebar-shell__title">{{ title }}</h1></slot>
      <p v-if="subtitle || $slots.subtitle" class="sidebar-shell__subtitle"><slot name="subtitle">{{ subtitle }}</slot></p>
      <div v-if="$slots.actions" class="sidebar-shell__actions"><slot name="actions" /></div>
    </header>
    <div class="sidebar-shell__body"><slot /></div>
  </AppPanel>
</template>

<script setup lang="ts">
import AppPanel from '../common/AppPanel.vue'

withDefaults(defineProps<{
  title?: string
  subtitle?: string
}>(), {
  title: 'MTG Deck Map',
  subtitle: undefined,
})
</script>

<style scoped>
.sidebar-shell{border-bottom:0;border-left:0;border-top:0;height:100%;min-width:330px;width:330px}.sidebar-shell__header{border-bottom:1px solid var(--line,rgba(255,255,255,.12));padding:15px 16px 11px}.sidebar-shell__title{font-size:16px;letter-spacing:.02em;margin:0 0 2px}.sidebar-shell__subtitle{color:var(--dim,#8b98a8);font-size:11px;line-height:1.35;margin:0}.sidebar-shell__actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.sidebar-shell__body{height:calc(100% - 64px);overflow:auto;padding:12px 16px}
</style>
