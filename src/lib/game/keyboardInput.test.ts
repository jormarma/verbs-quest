import { describe, expect, it } from 'vitest'
import { resolvePhysicalKey } from './keyboardInput'

describe('resolvePhysicalKey', () => {
  it('maps letters to uppercase', () => {
    expect(resolvePhysicalKey('a')).toEqual({ type: 'letter', char: 'A' })
    expect(resolvePhysicalKey('Z')).toEqual({ type: 'letter', char: 'Z' })
  })

  it('maps enter and backspace', () => {
    expect(resolvePhysicalKey('Enter')).toEqual({ type: 'enter' })
    expect(resolvePhysicalKey('Backspace')).toEqual({ type: 'backspace' })
  })

  it('ignores unsupported keys', () => {
    expect(resolvePhysicalKey('Shift')).toEqual({ type: 'ignore' })
    expect(resolvePhysicalKey('1')).toEqual({ type: 'ignore' })
  })
})
