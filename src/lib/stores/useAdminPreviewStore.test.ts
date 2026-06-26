import { describe, expect, it } from 'vitest'
import { useAdminPreviewStore } from './useAdminPreviewStore'

describe('useAdminPreviewStore', () => {
  it('defaults to admin dashboard view', () => {
    useAdminPreviewStore.setState({ previewAsStudent: false })
    expect(useAdminPreviewStore.getState().previewAsStudent).toBe(false)
  })

  it('can toggle student preview', () => {
    useAdminPreviewStore.getState().setPreviewAsStudent(true)
    expect(useAdminPreviewStore.getState().previewAsStudent).toBe(true)
    useAdminPreviewStore.getState().setPreviewAsStudent(false)
    expect(useAdminPreviewStore.getState().previewAsStudent).toBe(false)
  })
})
