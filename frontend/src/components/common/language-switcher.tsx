import { Check, Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/form-controls'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/overlays'
import { LANGUAGE_NAMES, LANGUAGES, isLanguage } from '@/i18n/languages'
import { useLanguage } from '@/i18n/use-language'

/** Compact language menu for the top bar and the sign-in pages. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { language, changeLanguage } = useLanguage()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={className} aria-label={t('common.shell.language')}>
          <Languages />
          <span className="text-xs font-medium uppercase">{language}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t('common.shell.language')}</DropdownMenuLabel>
        {LANGUAGES.map((code) => (
          <DropdownMenuItem key={code} lang={code} onSelect={() => void changeLanguage(code)}>
            <Check className={code === language ? 'opacity-100' : 'opacity-0'} />
            {LANGUAGE_NAMES[code]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Labelled select for settings-style pages (profile). */
export function LanguageSelect({ id }: { id: string }) {
  const { language, changeLanguage } = useLanguage()

  return (
    <NativeSelect
      id={id}
      value={language}
      onChange={(e) => {
        if (isLanguage(e.target.value)) void changeLanguage(e.target.value)
      }}
      className="w-full sm:w-56"
    >
      {LANGUAGES.map((code) => (
        <option key={code} value={code} lang={code}>
          {LANGUAGE_NAMES[code]}
        </option>
      ))}
    </NativeSelect>
  )
}
