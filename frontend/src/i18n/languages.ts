import { de as deLocale, enUS, tr as trLocale, type Locale } from 'date-fns/locale'

export const LANGUAGES = ['tr', 'en', 'de'] as const
export type Language = (typeof LANGUAGES)[number]

/** Turkish is always the default; the browser language is deliberately not used. */
export const DEFAULT_LANGUAGE: Language = 'tr'

/** Each language is shown in its own name so it can be found regardless of the current language. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  tr: 'Türkçe',
  en: 'English',
  de: 'Deutsch',
}

const LOCALES: Record<Language, string> = { tr: 'tr-TR', en: 'en-US', de: 'de-DE' }
const DATE_LOCALES: Record<Language, Locale> = { tr: trLocale, en: enUS, de: deLocale }

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

export const localeTag = (language: Language) => LOCALES[language]
export const dateLocale = (language: Language) => DATE_LOCALES[language]

const STORAGE_KEY = 'corporateos.language'

/** The last language chosen on this device (used before sign-in). Storage may be unavailable. */
export function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isLanguage(stored) ? stored : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

export function storeLanguage(language: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // Private mode or blocked storage: the choice still applies to this session.
  }
}
