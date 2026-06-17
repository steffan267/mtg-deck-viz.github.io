import { describe, expect, it, vi, afterEach } from 'vitest'
import { createGraphRenderer } from '../../src/web/services/graphRenderer'
import type { DeckGraph } from '../../src/web/types'

function node(id: string, role = 'utility', degree = 1) {
  return {
    id,
    role,
    degree,
    qty: 1,
    cmc: 1,
    type: 'Artifact',
    mana: '',
    text: '',
    ci: [],
    edh: null,
    produces: {},
    consumes: {},
    zones: [],
  }
}

function graph(): DeckGraph {
  return {
    nodes: [node('Selected', 'ramp'), node('Linked', 'draw'), node('Unrelated', 'removal', 0)],
    edges: [
      { source: 'Selected', target: 'Linked', interactions: [{ family: 'mana→draw', strength: 'moderate' }], events: ['mana→draw'] },
    ],
  }
}

function fakeCanvasContext(fillAlphas: number[]) {
  return {
    globalAlpha: 1,
    canvas: {},
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill(this: { globalAlpha: number }) { fillAlphas.push(this.globalAlpha) },
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    save: vi.fn(),
    restore: vi.fn(),
    closePath: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    shadowColor: '',
    shadowBlur: 0,
    font: '',
    textAlign: 'center',
  } as unknown as CanvasRenderingContext2D
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('graph renderer selection highlighting', () => {
  it('keeps all nodes visible but fades nodes that are neither selected nor directly linked', () => {
    let frame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    const fillAlphas: number[] = []
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'clientWidth', { value: 800, configurable: true })
    Object.defineProperty(canvas, 'clientHeight', { value: 600, configurable: true })
    vi.spyOn(canvas, 'getContext').mockReturnValue(fakeCanvasContext(fillAlphas))

    const renderer = createGraphRenderer()
    renderer.mount(canvas)
    renderer.update({ graph: graph(), selectedNodeId: 'Selected', layoutMode: 'blend' })

    expect(frame).toBeTypeOf('function')
    const drawFrame = frame as FrameRequestCallback
    drawFrame(0)

    expect(fillAlphas).toContain(0.16)
    expect(fillAlphas.filter(alpha => alpha === 1).length).toBeGreaterThanOrEqual(2)
    expect(fillAlphas.length).toBeGreaterThanOrEqual(3)

    renderer.destroy()
  })
})
