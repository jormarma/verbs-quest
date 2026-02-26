import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Language = 'en' | 'es'

interface SettingsState {
  language: Language
  setLanguage: (lang: Language) => void
  toggleLanguage: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: 'en',
      setLanguage: (lang) => set({ language: lang }),
      toggleLanguage: () => set((state) => ({ language: state.language === 'en' ? 'es' : 'en' })),
    }),
    {
      name: 'verbs-quest-settings',
    }
  )
)
