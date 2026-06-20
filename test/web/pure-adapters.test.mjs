import assert from 'node:assert/strict'

const decklist = await import('../../src/web/services/import/decklist.ts')
const graphModel = await import('../../src/web/services/graphModel.ts')
const layout = await import('../../src/web/services/graphLayoutStrategies.ts')
const nodeConnectivity = await import('../../src/web/services/nodeConnectivity.ts')

function test(name, fn) {
  try {
    fn()
    process.stdout.write(`✓ ${name}\n`)
  } catch (error) {
    error.message = `${name}: ${error.message}`
    throw error
  }
}

function sampleGraph() {
  return {
    nodes: [
      { id: 'Commander', role: 'commander' },
      { id: 'Ramp', role: 'ramp' },
      { id: 'Sink', role: 'payoff' },
      { id: 'Combo A', role: 'engine' },
      { id: 'Combo B', role: 'engine' },
      { id: 'Zone', role: 'zone' },
    ],
    edges: [
      { source: 'Ramp', target: 'Sink', events: ['mana'], interactions: [{ family: 'ramp→sink', strength: 'strong' }] },
      { source: 'Combo A', target: 'Combo B', interactions: [{ family: 'untap loop', strength: 'combo-critical' }] },
      { source: 'Missing', target: 'Sink', interactions: [{ family: 'ignored', strength: 'weak' }] },
    ],
    eventLabels: { 'ramp→sink': 'Ramp into sink', 'untap loop': 'Untap loop' },
  }
}

test('parseDecklist skips section headers and comments', () => {
  assert.deepEqual(decklist.parseDecklist('Commander\n# comment\nDeck\n1 Sol Ring'), [{ qty: 1, name: 'Sol Ring' }])
})

test('parseDecklist defaults quantity to one when omitted', () => {
  assert.deepEqual(decklist.parseDecklist('Arcane Signet'), [{ qty: 1, name: 'Arcane Signet' }])
})

test('parseDecklist removes set codes and collector annotations from names', () => {
  assert.deepEqual(decklist.parseDecklist('2x Lightning Bolt (JMP) 342 *F*'), [{ qty: 2, name: 'Lightning Bolt' }])
})

test('titleFromFileName removes the final extension', () => {
  assert.equal(decklist.titleFromFileName('xantcha.deck.txt'), 'xantcha.deck')
})

test('createGraphModel filters zone nodes out of render nodes', () => {
  const model = graphModel.createGraphModel(sampleGraph())
  assert.equal(model.byId.has('Zone'), false)
})

test('createGraphModel drops edges that reference missing nodes', () => {
  const model = graphModel.createGraphModel(sampleGraph())
  assert.equal(model.links.some(link => link.source.id === 'Missing' || link.target.id === 'Missing'), false)
})

test('createGraphModel chooses the commander as the center node', () => {
  const model = graphModel.createGraphModel(sampleGraph())
  assert.equal(model.centerNode.id, 'Commander')
})

test('createGraphModel marks combo-critical link endpoints as combo nodes', () => {
  const model = graphModel.createGraphModel(sampleGraph())
  assert.deepEqual([...model.comboNodes].sort(), ['Combo A', 'Combo B'])
})

test('createGraphModel counts proof package membership separately from pairwise links', () => {
  const graph = sampleGraph()
  graph.nodes = graph.nodes.map(node => ({ ...node, degree: node.id === 'Sink' || node.id === 'Ramp' || node.id === 'Combo A' || node.id === 'Combo B' ? 1 : 0 }))
  graph.interactionProofs = [
    { id: 'proof-1', family: 'value-loop', familyTitle: 'Value loop', cards: ['Commander', 'Sink', 'Sink'], cardCount: 2 },
    { id: 'proof-2', family: 'value-loop', familyTitle: 'Value loop', cards: ['Commander', 'Combo A'], cardCount: 2 },
  ]

  const model = graphModel.createGraphModel(graph)

  assert.equal(model.byId.get('Commander').degree, 0)
  assert.equal(model.byId.get('Commander').comboPackageCount, 2)
  assert.equal(model.byId.get('Sink').comboPackageCount, 1)
  assert.equal(model.byId.get('Ramp').comboPackageCount, 0)
  assert.equal(model.comboNodes.has('Commander'), true)
})

test('nodeConnectivitySummary separates links from combo packages', () => {
  assert.equal(nodeConnectivity.nodeConnectivitySummary({ degree: 1, comboPackageCount: 2 }), '1 link · 2 combo packages')
  assert.equal(nodeConnectivity.nodeConnectivitySummary({ degree: 0, comboPackageCount: 0 }), '0 links')
})

test('nodeFamilies returns labeled families for incident links', () => {
  const model = graphModel.createGraphModel(sampleGraph())
  const sink = model.byId.get('Sink')
  assert.deepEqual(graphModel.nodeFamilies(model, sink), [{ family: 'ramp→sink', label: 'Ramp into sink', count: 1, w: 3 }])
})

test('edgeStrength falls back to moderate strength for event-only links', () => {
  assert.equal(graphModel.edgeStrength({ interactions: [] }), 2)
})

test('edgeFamily returns the strongest interaction family', () => {
  assert.equal(graphModel.edgeFamily({ interactions: [{ family: 'weak-family', strength: 'weak' }, { family: 'combo-family', strength: 'combo-critical' }] }), 'combo-family')
})

test('getLayoutStrategy falls back to blend for an unknown layout id', () => {
  assert.equal(layout.getLayoutStrategy('unknown').id, 'blend')
})

process.stdout.write('Pure web adapter/view-model tests passed\n')
