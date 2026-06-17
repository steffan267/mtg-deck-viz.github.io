import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGraphRenderer } from '../../src/web/services/graphRenderer'
import type { DeckGraph } from '../../src/web/types'
import app from '../../src/web/App.vue?raw'
import sidebar from '../../src/web/components/sidebar/SidebarShell.vue?raw'
import imports from '../../src/web/components/import/ImportControls.vue?raw'
import graphCanvas from '../../src/web/components/graph/GraphCanvas.vue?raw'
import renderer from '../../src/web/services/graphRenderer.ts?raw'

describe('mobile browser responsive contracts', () => {
  it('stacks the app layout and keeps graph controls usable under tablet widths', () => {
    expect(app).toMatch(/@media\(max-width:860px\)/)
    expect(app).toMatch(/\.app\{display:flex;flex-direction:column/)
    expect(app).toMatch(/\.main\{display:flex;flex:1;flex-direction:column/)
    expect(app).toMatch(/\.topbar\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
    expect(app).toMatch(/:global\(\.graph-canvas-shell\)\{[^}]*min-height:360px/)
  })

  it('constrains drawers, detail cards, and tables to the mobile viewport', () => {
    expect(app).toMatch(/\.breakdown-drawer\{[^}]*max-height:46dvh[^}]*width:100%/)
    expect(app).toMatch(/\.category-card-drawer,\.detail-card\{[^}]*position:fixed[^}]*width:auto/)
    expect(app).toMatch(/\.compare-table\{[^}]*overflow-x:auto/)
    expect(app).toMatch(/@media\(max-width:520px\)[\s\S]*\.topbar\{grid-template-columns:1fr\}/)
  })

  it('keeps the sidebar and import dialog bounded on narrow screens', () => {
    expect(sidebar).toMatch(/@media\(max-width:860px\)/)
    expect(sidebar).toMatch(/\.sidebar-shell\{[^}]*max-height:44dvh[^}]*width:100%/)
    expect(imports).toMatch(/@media\(max-width:520px\)/)
    expect(imports).toMatch(/\.import-controls__paste-modal\{[^}]*max-height:calc\(100dvh - 20px\)[^}]*overflow:auto/)
  })

  it('uses touch-friendly canvas gestures instead of browser page gestures', () => {
    expect(graphCanvas).toMatch(/touch-action:\s*none/)
    expect(renderer).toContain("canvas.addEventListener('touchstart', onTouchStart, { passive: false })")
    expect(renderer).toContain("canvas.addEventListener('touchmove', onTouchMove, { passive: false })")
    expect(renderer).toMatch(/event\.preventDefault\(\)/)
    expect(renderer).toMatch(/options\.nodeSelect\?\.\(pick\(point\.x, point\.y\)\)/)
  })
})


function mobileNode(id: string) {
  return {
    id,
    role: 'commander',
    degree: 0,
    qty: 1,
    cmc: 1,
    type: 'Creature',
    mana: '',
    text: '',
    ci: [],
    edh: null,
    produces: {},
    consumes: {},
    zones: [],
  }
}

function mobileGraph(): DeckGraph {
  return { nodes: [mobileNode('Tap Target')], edges: [] }
}

function fakeCanvasContext() {
  return new Proxy({ canvas: {}, measureText: () => ({ width: 10 }) }, { get(target, key) { return key in target ? target[key as keyof typeof target] : () => {} } }) as unknown as CanvasRenderingContext2D
}

function touchEvent(type: string, point: { x: number; y: number }, active = true) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  const touch = { clientX: point.x, clientY: point.y }
  Object.defineProperty(event, 'touches', { value: active ? [touch] : [] })
  Object.defineProperty(event, 'changedTouches', { value: [touch] })
  return event
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('mobile touch graph interaction', () => {
  it('still selects a node when a tap includes tiny browser touch jitter', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'clientWidth', { value: 400, configurable: true })
    Object.defineProperty(canvas, 'clientHeight', { value: 300, configurable: true })
    Object.defineProperty(canvas, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300 }) })
    vi.spyOn(canvas, 'getContext').mockReturnValue(fakeCanvasContext())

    const selected: string[] = []
    const renderer = createGraphRenderer({ nodeSelect: node => { if (node) selected.push(node.id) } })
    renderer.mount(canvas)
    renderer.update({ graph: mobileGraph(), layoutMode: 'blend' })

    canvas.dispatchEvent(touchEvent('touchstart', { x: 200, y: 150 }))
    canvas.dispatchEvent(touchEvent('touchmove', { x: 203, y: 153 }))
    canvas.dispatchEvent(touchEvent('touchend', { x: 203, y: 153 }, false))

    expect(selected).toEqual(['Tap Target'])
    renderer.destroy()
  })

  it('cleans up canceled touches without selecting a node', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'clientWidth', { value: 400, configurable: true })
    Object.defineProperty(canvas, 'clientHeight', { value: 300, configurable: true })
    Object.defineProperty(canvas, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300 }) })
    vi.spyOn(canvas, 'getContext').mockReturnValue(fakeCanvasContext())

    const selected: string[] = []
    const renderer = createGraphRenderer({ nodeSelect: node => { if (node) selected.push(node.id) } })
    renderer.mount(canvas)
    renderer.update({ graph: mobileGraph(), layoutMode: 'blend' })

    canvas.dispatchEvent(touchEvent('touchstart', { x: 200, y: 150 }))
    canvas.dispatchEvent(touchEvent('touchcancel', { x: 200, y: 150 }, false))

    expect(selected).toEqual([])
    expect(canvas.classList.contains('dragging')).toBe(false)
    renderer.destroy()
  })

})
