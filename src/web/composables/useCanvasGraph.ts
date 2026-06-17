import { markRaw, onBeforeUnmount, onMounted, shallowRef, watch, type ComputedRef, type Ref } from 'vue'
import { createGraphRenderer } from '../services/graphRenderer'
import type { DeckGraph, GraphRenderInput, GraphRenderer, GraphRendererEvents, RenderNode } from '../types/graph'

export interface UseCanvasGraphOptions extends GraphRendererEvents {
  cardPower?: (node: RenderNode) => number
  roleColors?: Record<string, string>
}

export interface UseCanvasGraphState {
  canvasRef: Ref<HTMLCanvasElement | null>
  renderer: Ref<GraphRenderer | null>
  mount: () => void
  update: (input: GraphRenderInput) => void
  resize: () => void
  resetView: () => void
  relayout: () => void
}

export function useCanvasGraph(options: UseCanvasGraphOptions = {}): UseCanvasGraphState {
  const canvasRef = shallowRef<HTMLCanvasElement | null>(null)
  const renderer = shallowRef<GraphRenderer | null>(null)
  let resizeObserver: ResizeObserver | null = null
  let pendingInput: GraphRenderInput | null = null

  function mount() {
    if (!canvasRef.value || renderer.value) return
    const nextRenderer = markRaw(createGraphRenderer(options))
    nextRenderer.mount(canvasRef.value)
    renderer.value = nextRenderer
    if (pendingInput) nextRenderer.update(pendingInput)

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => nextRenderer.resize())
      resizeObserver.observe(canvasRef.value)
    }
  }

  function update(input: GraphRenderInput) {
    pendingInput = markRaw(input)
    renderer.value?.update(pendingInput)
  }

  function resize() {
    renderer.value?.resize()
  }

  function resetView() {
    renderer.value?.resetView()
  }

  function relayout() {
    renderer.value?.relayout()
  }

  onMounted(mount)
  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
    renderer.value?.destroy()
    renderer.value = null
  })

  return { canvasRef, renderer, mount, update, resize, resetView, relayout }
}

export function watchCanvasGraphInput(input: Ref<GraphRenderInput> | ComputedRef<GraphRenderInput>, graph: UseCanvasGraphState) {
  watch(
    input,
    (nextInput) => {
      graph.update(nextInput)
    },
    { immediate: true, deep: false },
  )
}

export function emptyGraph(): DeckGraph {
  return { nodes: [], edges: [] }
}
