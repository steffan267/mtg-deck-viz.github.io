import { createGraphModel, edgeFamily, edgeStrength } from './graphModel'
import { getLayoutStrategy } from './graphLayoutStrategies'
import type { DeckGraph, GraphRenderInput, GraphRenderer, GraphRendererEvents, GraphViewport, RenderGraphModel, RenderLink, RenderNode } from '../types/graph'

const DEFAULT_ROLE_COLORS: Record<string, string> = {
  commander: '#f0c040',
  ramp: '#54c98a',
  draw: '#5aa6ff',
  payoff: '#d9434f',
  finisher: '#ff7a3d',
  political: '#c061f0',
  reanimation: '#9a6cff',
  tutor: '#ffd166',
  removal: '#ff5d7a',
  wipe: '#ff3b3b',
  creature: '#e0a8ff',
  land: '#6b6478',
  utility: '#8a8298',
}

interface GraphRendererOptions extends GraphRendererEvents {
  roleColors?: Record<string, string>
  cardPower?: (node: RenderNode) => number
}

interface PointerState {
  dragNode: RenderNode | null
  panning: boolean
  lastX: number
  lastY: number
}

const EMPTY_GRAPH: DeckGraph = { nodes: [], edges: [] }
const STR_BASE: Record<number, string> = {
  1: 'rgba(150,140,170,0.10)',
  2: 'rgba(120,150,210,0.28)',
  3: 'rgba(110,200,150,0.45)',
  4: 'rgba(255,140,80,0.75)',
}

export function createGraphRenderer(options: GraphRendererOptions = {}): GraphRenderer {
  let canvas: HTMLCanvasElement | null = null
  let context: CanvasRenderingContext2D | null = null
  let frameId = 0
  let width = 0
  let height = 0
  let dpr = 1
  let model = createGraphModel(EMPTY_GRAPH, { cardPower: options.cardPower })
  let input: GraphRenderInput = { graph: EMPTY_GRAPH, layoutMode: 'blend' }
  let alpha = 1
  let maxMass = 1
  const camera: GraphViewport = { x: 0, y: 0, k: 0.95 }
  const hoverNeighbors = new Set<string>()
  const selectedNeighbors = new Set<string>()
  const familyNodes = new Set<string>()
  const categoryNodes = new Set<string>()
  let hoverNode: RenderNode | null = null
  const pointer: PointerState = { dragNode: null, panning: false, lastX: 0, lastY: 0 }
  const roleColors = { ...DEFAULT_ROLE_COLORS, ...(options.roleColors || {}) }

  const renderer: GraphRenderer = {
    mount(nextCanvas) {
      canvas = nextCanvas
      context = canvas.getContext('2d')
      if (!context) throw new Error('Graph canvas 2D context is not available')
      attachEvents()
      this.resize()
      initPositions()
      settleAndFit()
      startLoop()
    },
    update(nextInput) {
      const graphChanged = nextInput.graph !== input.graph
      const layoutChanged = nextInput.layoutMode !== input.layoutMode
      input = { ...nextInput }
      if (graphChanged) {
        model = createGraphModel(nextInput.graph || EMPTY_GRAPH, { cardPower: options.cardPower })
        hoverNode = null
        hoverNeighbors.clear()
        selectedNeighbors.clear()
        categoryNodes.clear()
        computeSelectionState()
        initPositions()
        settleAndFit()
      } else {
        computeSelectionState()
      }
      if (layoutChanged) {
        initPositions()
        settleAndFit()
      }
    },
    resize() {
      if (!canvas || !context) return
      dpr = window.devicePixelRatio || 1
      width = canvas.clientWidth || canvas.width || 1
      height = canvas.clientHeight || canvas.height || 1
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
    },
    resetView() {
      fitGraphToView()
      emitViewport()
    },
    relayout() {
      initPositions()
      alpha = 1
      settleAndFit()
      emitViewport()
    },
    destroy() {
      stopLoop()
      detachEvents()
      canvas = null
      context = null
      hoverNeighbors.clear()
      selectedNeighbors.clear()
      familyNodes.clear()
    },
  }

  return renderer

  function startLoop() {
    stopLoop()
    const drawFrame = () => {
      draw()
      frameId = window.requestAnimationFrame(drawFrame)
    }
    frameId = window.requestAnimationFrame(drawFrame)
  }

  function stopLoop() {
    if (frameId) window.cancelAnimationFrame(frameId)
    frameId = 0
  }

  function attachEvents() {
    if (!canvas) return
    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseleave', onMouseLeave)
    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('click', onClick)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('mouseup', onMouseUp)
  }

  function detachEvents() {
    if (!canvas) return
    canvas.removeEventListener('mousemove', onMouseMove)
    canvas.removeEventListener('mouseleave', onMouseLeave)
    canvas.removeEventListener('mousedown', onMouseDown)
    canvas.removeEventListener('click', onClick)
    canvas.removeEventListener('wheel', onWheel)
    window.removeEventListener('mouseup', onMouseUp)
  }

  function currentStrategy() {
    return getLayoutStrategy(input.layoutMode)
  }

  function initPositions() {
    const strategy = currentStrategy()
    maxMass = Math.max(1, ...model.nodes.map(strategy.massOf))
    model.nodes.forEach((node, index) => {
      if (node === model.centerNode) {
        node.x = 0
        node.y = 0
        node.fx = 0
        node.fy = 0
        node.vx = 0
        node.vy = 0
        return
      }
      node.fx = null
      node.fy = null
      const angle = ((Math.sin(index * 12.9898) * 99) % (Math.PI * 2)) + index * 2.399
      const massFraction = strategy.massOf(node) / maxMass
      const radius = 120 + (1 - massFraction) * 360 + (index % 5) * 14
      node.x = Math.cos(angle) * radius
      node.y = Math.sin(angle) * radius
      node.vx = 0
      node.vy = 0
    })
  }

  function settleAndFit(iterations = 140) {
    for (let i = 0; i < iterations; i += 1) tick()
    fitGraphToView()
  }

  function tick() {
    if (input.frozen) return
    alpha *= 0.992
    if (alpha < 0.02) alpha = 0.02
    const forceScale = alpha

    for (let i = 0; i < model.nodes.length; i += 1) {
      const a = model.nodes[i]
      for (let j = i + 1; j < model.nodes.length; j += 1) {
        const b = model.nodes[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const distanceSquared = dx * dx + dy * dy || 0.01
        const distance = Math.sqrt(distanceSquared)
        const force = 1400 / distanceSquared
        a.vx += (dx / distance) * force * forceScale
        a.vy += (dy / distance) * force * forceScale
        b.vx -= (dx / distance) * force * forceScale
        b.vy -= (dy / distance) * force * forceScale
      }
    }

    for (const link of model.links) {
      const strength = edgeStrength(link)
      const stiffness = 0.006 + strength * 0.006
      const rest = 110 - strength * 12
      const dx = link.target.x - link.source.x
      const dy = link.target.y - link.source.y
      const distance = Math.sqrt(dx * dx + dy * dy) || 0.01
      const force = (distance - rest) * stiffness
      link.source.vx += (dx / distance) * force
      link.source.vy += (dy / distance) * force
      link.target.vx -= (dx / distance) * force
      link.target.vy -= (dy / distance) * force
    }

    const strategy = currentStrategy()
    const gravityBoost = 1 + Math.min(1.6, model.nodes.length / 70)
    for (let i = 0; i < model.nodes.length; i += 1) {
      const a = model.nodes[i]
      for (let j = i + 1; j < model.nodes.length; j += 1) {
        const b = model.nodes[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const distance = Math.sqrt(dx * dx + dy * dy) || 0.01
        const aMass = Math.min(1, strategy.massOf(a) / maxMass)
        const bMass = Math.min(1, strategy.massOf(b) / maxMass)
        const desired = nodeRadius(a) + nodeRadius(b) + 10 + (aMass + bMass) * 10 * gravityBoost
        if (distance >= desired) continue
        const push = ((desired - distance) / distance) * 0.16 * forceScale
        const x = dx * push
        const y = dy * push
        if (a.fx == null) {
          a.vx -= x
          a.vy -= y
        }
        if (b.fx == null) {
          b.vx += x
          b.vy += y
        }
      }
    }

    for (const node of model.nodes) {
      const gravity = 0.00055 + 0.0016 * Math.min(1, strategy.massOf(node) / maxMass)
      node.vx += -node.x * gravity
      node.vy += -node.y * gravity
      if (node.fx == null) {
        node.x += node.vx
        node.y += node.vy
      } else {
        node.x = node.fx
        node.y = node.fy == null ? node.y : node.fy
      }
      node.vx *= 0.86
      node.vy *= 0.86
    }
  }

  function fitGraphToView(overscan = 1.12) {
    const visible = model.nodes.filter(nodeVisible)
    if (!visible.length || !width || !height) return
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const node of visible) {
      const pad = nodeRadius(node) + 18
      minX = Math.min(minX, node.x - pad)
      maxX = Math.max(maxX, node.x + pad)
      minY = Math.min(minY, node.y - pad)
      maxY = Math.max(maxY, node.y + pad)
    }
    const graphWidth = Math.max(1, maxX - minX)
    const graphHeight = Math.max(1, maxY - minY)
    camera.x = -(minX + maxX) / 2
    camera.y = -(minY + maxY) / 2
    camera.k = Math.min(width / graphWidth, height / graphHeight) * overscan
    camera.k = clamp(camera.k, 0.3, 4)
  }

  function draw() {
    if (!context) return
    tick()
    context.clearRect(0, 0, width, height)
    drawEdges(context)
    drawNodes(context)
  }

  function drawEdges(ctx: CanvasRenderingContext2D) {
    for (const link of model.links) {
      if (!nodeVisible(link.source) || !nodeVisible(link.target)) continue
      const source = toScreen(link.source)
      const target = toScreen(link.target)
      const comboActive = Boolean(input.spotlightCombos && isComboLink(link))
      const familyActive = Boolean(input.selectedFamily && edgeFamily(link) === input.selectedFamily)
      const active = comboActive || (!input.spotlightCombos && ((hoverNode && (link.source === hoverNode || link.target === hoverNode)) || selectedLinkActive(link) || familyActive))
      const strength = edgeStrength(link)
      let color = STR_BASE[strength] || STR_BASE[1]
      if (comboActive) color = 'rgba(255,170,75,1)'
      else if (active) color = strength >= 4 ? 'rgba(255,140,80,0.95)' : 'rgba(217,67,79,0.85)'
      else if (hoverNode || input.selectedNodeId || input.selectedFamily || input.spotlightCombos) color = 'rgba(120,110,140,0.04)'

      ctx.strokeStyle = color
      ctx.lineWidth = comboActive ? 4.5 : active ? 1.5 + strength * 0.7 : 0.6 + strength * 0.4
      if (comboActive) {
        ctx.shadowColor = 'rgba(255,140,80,0.8)'
        ctx.shadowBlur = 10
      }
      ctx.beginPath()
      ctx.moveTo(source.x, source.y)
      ctx.lineTo(target.x, target.y)
      ctx.stroke()
      if (comboActive) ctx.shadowBlur = 0
    }
  }

  function drawNodes(ctx: CanvasRenderingContext2D) {
    for (const node of model.nodes) {
      if (!nodeVisible(node)) continue
      const point = toScreen(node)
      const dimmed = isDimmed(node)
      const radius = nodeRadius(node) * Math.sqrt(camera.k)
      ctx.globalAlpha = dimmed ? 0.16 : 1
      ctx.beginPath()
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = roleColors[node.role] || '#888'
      ctx.fill()

      if (node === model.centerNode) {
        ctx.lineWidth = 2.5
        ctx.strokeStyle = dimmed ? 'rgba(224,200,90,0.4)' : '#e0c85a'
        ctx.stroke()
      }
      if (node.id === input.selectedNodeId || node === hoverNode) {
        ctx.lineWidth = 2
        ctx.strokeStyle = '#fff'
        ctx.stroke()
      }

      const showLabel = node === model.centerNode || camera.k > 1.3 || node === hoverNode || node.id === input.selectedNodeId || (input.spotlightCombos && model.comboNodes.has(node.id)) || (selectedNeighbors.has(node.id)) || Number(node.degree || 0) >= 8
      if (showLabel && !dimmed) {
        ctx.globalAlpha = 1
        ctx.font = `${node === model.centerNode ? '600 12px' : '11px'} -apple-system,sans-serif`
        ctx.fillStyle = node === model.centerNode ? '#f0e3b0' : '#e8e4f0'
        ctx.textAlign = 'center'
        ctx.fillText(shortName(node), point.x, point.y - radius - 4)
      }
      ctx.globalAlpha = 1
    }
  }

  function computeSelectionState() {
    selectedNeighbors.clear()
    familyNodes.clear()
    categoryNodes.clear()
    const selected = input.selectedNodeId ? model.byId.get(input.selectedNodeId) || null : null
    computeNeighbors(selected, selectedNeighbors)
    for (const id of input.selectedNodeIds || []) {
      if (model.byId.has(id)) categoryNodes.add(id)
    }
    if (input.selectedFamily) {
      for (const link of model.links) {
        if (edgeFamily(link) === input.selectedFamily) {
          familyNodes.add(link.source.id)
          familyNodes.add(link.target.id)
        }
      }
    }
  }

  function nodeVisible(node: RenderNode) {
    if (input.roleVisibility && input.roleVisibility[node.role] === false) return false
    if (input.hideIsolated && node.role !== 'land' && Number(node.degree || 0) === 0) return false
    const searchTerm = (input.searchTerm || '').trim().toLowerCase()
    if (searchTerm && !node.id.toLowerCase().includes(searchTerm)) return false
    return true
  }

  function isDimmed(node: RenderNode) {
    if (input.spotlightCombos) return !model.comboNodes.has(node.id)
    if (hoverNode) return node !== hoverNode && !hoverNeighbors.has(node.id)
    if (input.selectedNodeId) return node.id !== input.selectedNodeId && !selectedNeighbors.has(node.id)
    if (input.selectedFamily) return !familyNodes.has(node.id)
    if (categoryNodes.size) return !categoryNodes.has(node.id)
    return false
  }

  function selectedLinkActive(link: RenderLink) {
    if (!input.selectedNodeId) return false
    return link.source.id === input.selectedNodeId || link.target.id === input.selectedNodeId
  }

  function nodeRadius(node: RenderNode) {
    if (node.role === 'land') return 4.5
    if (node === model.centerNode) return 13
    return 5 + Math.min(13, currentStrategy().sizeMassOf(node) * 1.1)
  }

  function pick(px: number, py: number) {
    let best: RenderNode | null = null
    let bestDistance = Infinity
    for (const node of model.nodes) {
      if (!nodeVisible(node)) continue
      const point = toScreen(node)
      const radius = Math.max(8, nodeRadius(node) * Math.sqrt(camera.k) + 4)
      const dx = px - point.x
      const dy = py - point.y
      const distance = dx * dx + dy * dy
      if (distance < radius * radius && distance < bestDistance) {
        best = node
        bestDistance = distance
      }
    }
    return best
  }

  function computeNeighbors(node: RenderNode | null, output: Set<string>) {
    output.clear()
    if (!node) return
    for (const link of model.links) {
      if (link.source === node) output.add(link.target.id)
      if (link.target === node) output.add(link.source.id)
    }
  }

  function isComboLink(link: RenderLink) {
    return (link.interactions || []).some((interaction) => interaction.strength === 'combo-critical')
  }

  function toScreen(node: RenderNode) {
    return { x: (node.x + camera.x) * camera.k + width / 2, y: (node.y + camera.y) * camera.k + height / 2 }
  }

  function fromScreen(px: number, py: number) {
    return { x: (px - width / 2) / camera.k - camera.x, y: (py - height / 2) / camera.k - camera.y }
  }

  function onMouseMove(event: MouseEvent) {
    if (!canvas) return
    const px = event.offsetX
    const py = event.offsetY
    if (pointer.dragNode) {
      const world = fromScreen(px, py)
      pointer.dragNode.fx = world.x
      pointer.dragNode.fy = world.y
      alpha = Math.max(alpha, 0.3)
      return
    }
    if (pointer.panning) {
      camera.x += (px - pointer.lastX) / camera.k
      camera.y += (py - pointer.lastY) / camera.k
      pointer.lastX = px
      pointer.lastY = py
      emitViewport()
      return
    }

    const nextHover = pick(px, py)
    if (nextHover !== hoverNode) {
      hoverNode = nextHover
      computeNeighbors(nextHover, hoverNeighbors)
      canvas.style.cursor = nextHover ? 'pointer' : 'grab'
      options.nodeHover?.(nextHover, nextHover ? { x: px, y: py } : null)
    } else if (nextHover) {
      options.nodeHover?.(nextHover, { x: px, y: py })
    }
  }

  function onMouseLeave() {
    hoverNode = null
    hoverNeighbors.clear()
    options.nodeHover?.(null, null)
  }

  function onMouseDown(event: MouseEvent) {
    if (!canvas) return
    const node = pick(event.offsetX, event.offsetY)
    if (node) {
      pointer.dragNode = node
      node.fx = node.x
      node.fy = node.y
      canvas.classList.add('dragging')
    } else {
      pointer.panning = true
      pointer.lastX = event.offsetX
      pointer.lastY = event.offsetY
      canvas.classList.add('dragging')
    }
  }

  function onMouseUp() {
    if (!canvas) return
    if (pointer.dragNode && pointer.dragNode !== model.centerNode) {
      pointer.dragNode.fx = null
      pointer.dragNode.fy = null
    }
    pointer.dragNode = null
    pointer.panning = false
    canvas.classList.remove('dragging')
  }

  function onClick(event: MouseEvent) {
    const node = pick(event.offsetX, event.offsetY)
    options.nodeSelect?.(node)
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault()
    const before = fromScreen(event.offsetX, event.offsetY)
    camera.k = clamp(camera.k * Math.exp(-event.deltaY * 0.0012), 0.3, 4)
    const after = fromScreen(event.offsetX, event.offsetY)
    camera.x += after.x - before.x
    camera.y += after.y - before.y
    emitViewport()
  }

  function emitViewport() {
    options.viewportChange?.({ ...camera })
  }
}

function shortName(node: RenderNode) {
  return node.id.split('//')[0].replace(/,.*$/, '').trim()
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
