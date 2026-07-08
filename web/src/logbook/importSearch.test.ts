import { describe, expect, it } from 'vitest'
import { validateImportSearch } from './importSearch'

describe('validateImportSearch', () => {
  it('keeps a valid upload tab', () => {
    expect(validateImportSearch({ tab: 'upload' })).toEqual({ tab: 'upload' })
  })

  it('defaults to request for missing, empty, or unknown values', () => {
    expect(validateImportSearch({})).toEqual({ tab: 'request' })
    expect(validateImportSearch({ tab: '' })).toEqual({ tab: 'request' })
    expect(validateImportSearch({ tab: 'nonsense' })).toEqual({ tab: 'request' })
    expect(validateImportSearch({ tab: 42 })).toEqual({ tab: 'request' })
  })
})
