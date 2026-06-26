import { create } from 'zustand'

interface AdminPreviewState {
  previewAsStudent: boolean
  setPreviewAsStudent: (value: boolean) => void
}

export const useAdminPreviewStore = create<AdminPreviewState>((set) => ({
  previewAsStudent: false,
  setPreviewAsStudent: (value) => set({ previewAsStudent: value }),
}))
