<template>
  <div class="graph-canvas-shell">
    <canvas ref="canvasRef" class="graph-canvas" aria-label="Deck interaction graph"></canvas>
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw } from 'vue'
import { emptyGraph, useCanvasGraph, watchCanvasGraphInput } from '../../composables/useCanvasGraph'
import type { DeckGraph, GraphRenderInput, GraphViewport, RenderNode } from '../../types/graph'

const props = withDefaults(defineProps<{
  graph?: DeckGraph | null
  layoutMode?: string
  roleVisibility?: Readonly<Record<string, boolean>>
  hideIsolated?: boolean
  searchTerm?: string
  selectedNodeId?: string | null
  selectedFamily?: string | null
  spotlightCombos?: boolean
  frozen?: boolean
  roleColors?: Record<string, string>
  cardPower?: (node: RenderNode) => number
}>(), {
  graph: null,
  layoutMode: 'blend',
  roleVisibility: undefined,
  hideIsolated: false,
  searchTerm: '',
  selectedNodeId: null,
  selectedFamily: null,
  spotlightCombos: false,
  frozen: false,
  roleColors: undefined,
  cardPower: undefined,
})

const emit = defineEmits<{
  'node:hover': [node: RenderNode | null, position: { x: number; y: number } | null]
  'node:select': [node: RenderNode | null]
  'viewport:change': [viewport: GraphViewport]
}>()

const canvasGraph = useCanvasGraph({
  roleColors: props.roleColors,
  cardPower: props.cardPower,
  nodeHover: (node, position) => emit('node:hover', node, position),
  nodeSelect: (node) => emit('node:select', node),
  viewportChange: (viewport) => emit('viewport:change', viewport),
})

const renderInput = computed<GraphRenderInput>(() => markRaw({
  graph: markRaw(props.graph || emptyGraph()),
  layoutMode: props.layoutMode,
  roleVisibility: props.roleVisibility,
  hideIsolated: props.hideIsolated,
  searchTerm: props.searchTerm,
  selectedNodeId: props.selectedNodeId,
  selectedFamily: props.selectedFamily,
  spotlightCombos: props.spotlightCombos,
  frozen: props.frozen,
}))

watchCanvasGraphInput(renderInput, canvasGraph)

const { canvasRef } = canvasGraph

defineExpose({
  resetView: canvasGraph.resetView,
  relayout: canvasGraph.relayout,
  resize: canvasGraph.resize,
})
</script>

<style scoped>
.graph-canvas-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.graph-canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
}

.graph-canvas.dragging {
  cursor: grabbing;
}
</style>
