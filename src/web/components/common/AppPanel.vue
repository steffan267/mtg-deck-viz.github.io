<template>
  <component :is="as" class="app-panel" :class="[`app-panel--${padding}`]">
    <slot />
  </component>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  as?: 'aside' | 'article' | 'div' | 'section'
  padding?: 'none' | 'sm' | 'md'
}>(), {
  as: 'div',
  padding: 'md',
})
</script>

<style scoped>
.app-panel{background:var(--panel,#101821);border:1px solid var(--line,rgba(255,255,255,.12));color:var(--text,#e7eef9)}.app-panel--none{padding:0}.app-panel--sm{padding:10px}.app-panel--md{padding:14px}
</style>
