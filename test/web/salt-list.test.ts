import { describe, expect, it } from 'vitest'
import { EDHREC_SALT_SOURCE, saltyCardReferences } from '../../src/web/services/saltList'

describe('salt list references', () => {
  it('matches current deck cards against the EDHREC salt snapshot', () => {
    expect(saltyCardReferences(['Sol Ring', 'Rhystic Study', 'Rhystic Study // Back Face'])).toEqual([
      { name: 'Rhystic Study', source: EDHREC_SALT_SOURCE },
    ])
  })
})
