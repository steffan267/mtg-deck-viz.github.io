<template>
  <button
    class="toolbar-button"
    :class="[`toolbar-button--${tone}`, { 'is-active': active, 'is-loading': loading }]"
    type="button"
    :disabled="disabled || loading"
    :aria-pressed="active ? 'true' : undefined"
    @click="emit('click')"
  >
    <span v-if="loading" class="toolbar-button__spinner" aria-hidden="true" />
    <slot>{{ label }}</slot>
  </button>
</template>

<script setup lang="ts">
import type { Tone } from '../../types/ui'

withDefaults(defineProps<{
  label?: string
  active?: boolean
  disabled?: boolean
  loading?: boolean
  tone?: Tone
}>(), {
  label: '',
  active: false,
  disabled: false,
  loading: false,
  tone: 'default',
})

const emit = defineEmits<{
  click: []
}>()
</script>

<style scoped>
.toolbar-button{align-items:center;background:var(--panel,#17151d);border:1px solid var(--line,rgba(255,255,255,.16));border-radius:8px;color:var(--text,#e7eef9);cursor:pointer;display:inline-flex;font:inherit;font-size:12px;gap:6px;min-height:28px;padding:6px 10px}.toolbar-button:hover:not(:disabled),.toolbar-button.is-active{border-color:var(--accent,#d9434f)}.toolbar-button:disabled{cursor:not-allowed;opacity:.55}.toolbar-button--success{color:#54c98a}.toolbar-button--warning{color:#e0c85a}.toolbar-button--danger{color:#ff7a3d}.toolbar-button__spinner{animation:spin .8s linear infinite;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;height:12px;width:12px}@keyframes spin{to{transform:rotate(360deg)}}
</style>
