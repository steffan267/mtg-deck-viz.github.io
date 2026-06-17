<template>
  <div v-if="show" class="loading-overlay" role="status" aria-live="polite">
    <span class="loading-overlay__spinner" aria-hidden="true" />
    <span><slot>{{ message }}</slot></span>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  show: boolean
  message?: string
}>(), {
  message: 'Loading…',
})
</script>

<style scoped>
.loading-overlay{align-items:center;background:rgba(4,8,12,.72);border-radius:10px;color:var(--text,#e7eef9);display:flex;font-size:12px;gap:10px;inset:0;justify-content:center;position:absolute;z-index:10}.loading-overlay__spinner{animation:spin .8s linear infinite;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;height:16px;width:16px}@keyframes spin{to{transform:rotate(360deg)}}
</style>
