import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { z } from 'zod'
import { useAuthStore } from '@/store/auth-store'
import { isLanguage, LANGUAGES, readStoredLanguage, storeLanguage, type Language } from './languages'
import { modules } from './messages'

type Modules = typeof modules
export type Messages = { [K in keyof Modules]: Modules[K]['en'] }

function bundle(language: Language) {
  return Object.fromEntries(Object.entries(modules).map(([name, messages]) => [name, messages[language]])) as Messages
}

export const resources = {
  en: { translation: bundle('en') },
  tr: { translation: bundle('tr') },
  de: { translation: bundle('de') },
}

const ZOD_LOCALES = { tr: z.locales.tr, en: z.locales.en, de: z.locales.de } satisfies Record<Language, unknown>

/** Zod's built-in messages (length limits etc.) follow the UI language; our own messages are catalog keys. */
function configureZod(language: Language) {
  z.config(ZOD_LOCALES[language]())
}

const initial = readStoredLanguage()
configureZod(initial)

void i18n.use(initReactI18next).init({
  resources,
  lng: initial,
  fallbackLng: 'en',
  supportedLngs: [...LANGUAGES],
  // Server messages are passed through t() as-is when they are not keys, and may contain ':' or '.'.
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnNull: false,
})
document.documentElement.lang = initial

export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : 'tr'
}

/** Switches the UI language on this device. Saving it to the profile is done by useLanguage(). */
export function applyLanguage(language: Language) {
  storeLanguage(language)
  configureZod(language)
  document.documentElement.lang = language
  if (i18n.language !== language) void i18n.changeLanguage(language)
}

/** Translates a message that may be a catalog key (client-side validation) or ready text (server). */
export function translateMessage(message: string | undefined): string | undefined {
  if (!message) return message
  return i18n.exists(message) ? i18n.t(message as never) : message
}

// After sign-in the language saved in the user's profile wins over the device choice.
useAuthStore.subscribe((state, previous) => {
  const language = state.user?.language
  if (language && language !== previous.user?.language && isLanguage(language)) applyLanguage(language)
})

export default i18n
