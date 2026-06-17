export * from './types'
export * from './decklist'
export * from './registry'
export * from './scryfall'
export * from './textImporter'
export * from './fileImporter'
export * from './moxfieldImporter'

import { FileDeckImporter } from './fileImporter'
import { MoxfieldDeckImporter } from './moxfieldImporter'
import { createDeckImportRegistry } from './registry'
import { TextDeckImporter } from './textImporter'

export function createDefaultDeckImportRegistry() {
  return createDeckImportRegistry([
    new MoxfieldDeckImporter(),
    new FileDeckImporter(),
    new TextDeckImporter(),
  ])
}
