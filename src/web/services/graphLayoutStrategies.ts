import type { GraphLayoutStrategy, RenderNode } from '../types/graph'

export const layoutStrategies: GraphLayoutStrategy[] = [
  {
    id: 'blend',
    label: 'links + power',
    massOf: (node: RenderNode) => node.massByMode.blend || 0,
    sizeMassOf: (node: RenderNode) => node.sizeByMode.blend || 0,
  },
  {
    id: 'split',
    label: 'links · size=power',
    massOf: (node: RenderNode) => node.massByMode.split || 0,
    sizeMassOf: (node: RenderNode) => node.sizeByMode.split || 0,
  },
  {
    id: 'pwlink',
    label: 'power-weighted links',
    massOf: (node: RenderNode) => node.massByMode.pwlink || 0,
    sizeMassOf: (node: RenderNode) => node.sizeByMode.pwlink || 0,
  },
]

export function getLayoutStrategy(id: string | undefined): GraphLayoutStrategy {
  return layoutStrategies.find((strategy) => strategy.id === id) || layoutStrategies[0]
}
