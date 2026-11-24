import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getErrorMessage } from '@/api/client'
import { profileApi } from '@/api/endpoints'
import { useAuthStore } from '@/store/auth-store'
import { applyLanguage } from './index'
import { isLanguage, type Language } from './languages'

/**
 * Current UI language and a setter. Signed-in users also get the choice saved to their profile,
 * so it follows them to other devices and is used for their notifications and e-mails.
 */
export function useLanguage() {
  const { i18n } = useTranslation()
  const queryClient = useQueryClient()
  const signedIn = useAuthStore((s) => s.status === 'authenticated')
  const setUser = useAuthStore((s) => s.setUser)
  const language: Language = isLanguage(i18n.language) ? i18n.language : 'tr'

  const changeLanguage = async (next: Language) => {
    if (next === language) return
    applyLanguage(next)
    // Server-rendered text (report labels, settings, validation) is fetched again in the new language.
    void queryClient.invalidateQueries()
    if (!signedIn) return
    try {
      setUser(await profileApi.updateLanguage(next))
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  return { language, changeLanguage }
}
