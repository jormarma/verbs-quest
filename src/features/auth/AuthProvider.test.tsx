import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider'

vi.mock('spacetimedb/react', () => ({
  useSpacetimeDB: () => ({ isActive: true, identity: { toHexString: () => 'abc' }, connectionError: null }),
  useTable: () => [[]],
}))
vi.mock('../../lib/spacetime/module_bindings', () => ({ tables: { user: {} } }))
vi.mock('../../lib/spacetime/client', () => ({
  getConnection: vi.fn(),
  clearStoredToken: vi.fn(),
  beginGoogleSession: vi.fn(),
  getAuthMethod: () => 'google',
  GOOGLE_CLIENT_ID: '',
}))
vi.mock('./googleAuth', () => ({ renderGoogleButton: vi.fn(), googleSignOut: vi.fn() }))
vi.mock('../../components/3d/Scene', () => ({ Scene: () => null }))

describe('AuthProvider display-name step', () => {
  it('names the username input by its visible label and describes it with the hint', async () => {
    render(<AuthProvider><div /></AuthProvider>)

    const input = await screen.findByRole('textbox', { name: 'Username' })
    expect(input).toHaveAccessibleDescription('Only letters, numbers, and underscores are allowed')
  })
})
