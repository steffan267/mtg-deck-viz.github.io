<template>
  <section class="section-block" :aria-labelledby="titleId">
    <header v-if="title || $slots.title || subtitle || $slots.actions" class="section-block__header">
      <div class="section-block__heading">
        <slot name="title">
          <h2 v-if="title" :id="titleId" class="section-block__title">{{ title }}</h2>
        </slot>
        <slot name="subtitle">
          <p v-if="subtitle" class="section-block__subtitle">{{ subtitle }}</p>
        </slot>
      </div>
      <div v-if="$slots.actions" class="section-block__actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="section-block__body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  title?: string
  subtitle?: string
  id?: string
}>(), {
  title: undefined,
  subtitle: undefined,
  id: undefined,
})

const titleId = props.id ? `${props.id}-title` : undefined
</script>

<style scoped>
.section-block{border-top:1px solid var(--line, rgba(255,255,255,.12));padding:12px 0}.section-block:first-child{border-top:0;padding-top:0}.section-block__header{display:flex;align-items:flex-start;gap:12px;justify-content:space-between;margin-bottom:8px}.section-block__heading{min-width:0}.section-block__title{color:var(--text,#e7eef9);font-size:12px;font-weight:700;letter-spacing:.04em;margin:0;text-transform:uppercase}.section-block__subtitle{color:var(--dim,#8b98a8);font-size:11px;line-height:1.35;margin:3px 0 0}.section-block__actions{display:flex;flex-shrink:0;gap:6px}.section-block__body{min-width:0}
</style>
