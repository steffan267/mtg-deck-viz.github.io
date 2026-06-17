<template>
  <SectionBlock :title="title" :subtitle="subtitle">
    <EmptyState v-if="!roles.length" title="No roles" message="Role counts will appear after a deck is loaded." />
    <ul v-else class="role-legend" :aria-label="title">
      <li v-for="role in roles" :key="role.id">
        <button
          class="role-legend__item"
          :class="{ 'is-disabled': !role.enabled }"
          type="button"
          :title="role.title"
          :aria-pressed="role.enabled ? 'true' : 'false'"
          @click="emit('toggle-role', role.id)"
        >
          <span class="role-legend__swatch" :style="{ backgroundColor: role.color }" aria-hidden="true" />
          <span class="role-legend__label">{{ role.label }}</span>
          <span class="role-legend__count">{{ role.count }}</span>
        </button>
      </li>
    </ul>
  </SectionBlock>
</template>

<script setup lang="ts">
import type { RoleLegendItem } from '../../types/ui'
import EmptyState from '../common/EmptyState.vue'
import SectionBlock from '../common/SectionBlock.vue'

withDefaults(defineProps<{
  roles: RoleLegendItem[]
  title?: string
  subtitle?: string
}>(), {
  roles: () => [],
  title: 'Roles',
  subtitle: undefined,
})

const emit = defineEmits<{
  'toggle-role': [roleId: string]
}>()
</script>

<style scoped>
.role-legend{display:grid;gap:4px;list-style:none;margin:0;padding:0}.role-legend__item{align-items:center;background:transparent;border:0;border-radius:6px;color:var(--text,#e7eef9);cursor:pointer;display:grid;font:inherit;font-size:12px;gap:8px;grid-template-columns:10px 1fr auto;padding:4px 3px;text-align:left;width:100%}.role-legend__item:hover{background:rgba(255,255,255,.06)}.role-legend__item.is-disabled{opacity:.45}.role-legend__swatch{border-radius:50%;height:10px;width:10px}.role-legend__label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.role-legend__count{color:var(--dim,#8b98a8);font-variant-numeric:tabular-nums}
</style>
