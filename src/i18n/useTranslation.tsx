/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import en from './locales/en.json'
import fr from './locales/fr.json'

type Locale = 'en' | 'fr'
type TranslationValues = Record<string, string | number>
type Dictionary = Record<string, string>

const FALLBACK_LOCALE: Locale = 'en'
const STORAGE_KEY = 'rubix-cube-solver.locale'

const resources: Record<Locale, Dictionary> = {
  en,
  fr,
}

interface TranslationContextValue {
  language: Locale
  changeLanguage: (locale: Locale) => void
  t: (key: string, values?: TranslationValues) => string
}

const TranslationContext = createContext<TranslationContextValue | null>(null)

function interpolate(template: string, values?: TranslationValues): string {
  if (!values) return template
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const value = values[key]
    return value === undefined ? '' : String(value)
  })
}

function detectInitialLocale(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'en' || saved === 'fr') return saved
  const browser = navigator.language.toLowerCase()
  return browser.startsWith('fr') ? 'fr' : 'en'
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Locale>(() => detectInitialLocale())

  const changeLanguage = useCallback((locale: Locale) => {
    setLanguage(locale)
    localStorage.setItem(STORAGE_KEY, locale)
  }, [])

  const t = useCallback((key: string, values?: TranslationValues) => {
    const current = resources[language]
    const fallback = resources[FALLBACK_LOCALE]
    const raw = current[key] ?? fallback[key] ?? key
    return interpolate(raw, values)
  }, [language])

  const value = useMemo<TranslationContextValue>(() => ({
    language,
    changeLanguage,
    t,
  }), [changeLanguage, language, t])

  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  )
}

export function useTranslation() {
  const context = useContext(TranslationContext)
  if (!context) {
    throw new Error('useTranslation must be used within I18nProvider')
  }

  return {
    t: context.t,
    i18n: {
      language: context.language,
      changeLanguage: context.changeLanguage,
    },
    language: context.language,
    changeLanguage: context.changeLanguage,
  }
}
