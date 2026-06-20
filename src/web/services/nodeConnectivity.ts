import type { GraphNode } from '../types/graph'

type ConnectivityNode = Pick<GraphNode, 'degree' | 'comboPackageCount'>

function nonNegativeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function linkCount(node: ConnectivityNode): number {
  return nonNegativeCount(node.degree)
}

export function comboPackageCount(node: ConnectivityNode): number {
  return nonNegativeCount(node.comboPackageCount)
}

export function nodeConnectivitySummary(node: ConnectivityNode): string {
  const parts = [pluralize(linkCount(node), 'link')]
  const comboPackages = comboPackageCount(node)
  if (comboPackages > 0) parts.push(pluralize(comboPackages, 'combo package'))
  return parts.join(' · ')
}
