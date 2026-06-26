export type KeyboardAction =
  | { type: 'letter'; char: string }
  | { type: 'backspace' }
  | { type: 'enter' }
  | { type: 'ignore' }

export function resolvePhysicalKey(key: string): KeyboardAction {
  if (key === 'Enter') return { type: 'enter' }
  if (key === 'Backspace') return { type: 'backspace' }
  if (key.length === 1 && /[a-zA-Z]/.test(key)) {
    return { type: 'letter', char: key.toUpperCase() }
  }
  return { type: 'ignore' }
}
