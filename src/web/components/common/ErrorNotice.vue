<template>
  <div v-if="message || $slots.default" class="error-notice" role="alert">
    <strong v-if="title" class="error-notice__title">{{ title }}</strong>
    <slot>{{ message }}</slot>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  message?: string
}>(), {
  title: undefined,
  message: undefined,
})
</script>

<style scoped>
.error-notice{background:rgba(255,122,61,.12);border:1px solid rgba(255,122,61,.35);border-radius:8px;color:#ffc0a0;font-size:12px;line-height:1.4;padding:10px}.error-notice__title{color:#ff9a6d;display:block;margin-bottom:3px}
</style>
