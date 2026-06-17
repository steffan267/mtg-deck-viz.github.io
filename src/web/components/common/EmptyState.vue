<template>
  <div class="empty-state">
    <div v-if="icon || $slots.icon" class="empty-state__icon"><slot name="icon">{{ icon }}</slot></div>
    <strong v-if="title" class="empty-state__title">{{ title }}</strong>
    <p v-if="message || $slots.default" class="empty-state__message"><slot>{{ message }}</slot></p>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  message?: string
  icon?: string
}>(), {
  title: 'Nothing to show',
  message: undefined,
  icon: undefined,
})
</script>

<style scoped>
.empty-state{border:1px dashed var(--line,rgba(255,255,255,.18));border-radius:8px;color:var(--dim,#8b98a8);font-size:12px;line-height:1.4;padding:14px;text-align:center}.empty-state__icon{font-size:20px;margin-bottom:6px}.empty-state__title{color:var(--text,#e7eef9);display:block}.empty-state__message{margin:4px 0 0}
</style>
