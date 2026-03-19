import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import hu from './locales/hu.json';
import en from './locales/en.json';
import tl from './locales/tl.json';
import uk from './locales/uk.json';
import de from './locales/de.json';

// NO LanguageDetector — language comes from user.preferred_language on login
i18n
  .use(initReactI18next)
  .init({
    lng: 'hu', // Default until user profile loads
    fallbackLng: 'hu',
    supportedLngs: ['hu', 'en', 'tl', 'uk', 'de'],
    resources: {
      hu: { translation: hu },
      en: { translation: en },
      tl: { translation: tl },
      uk: { translation: uk },
      de: { translation: de },
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    compatibilityJSON: 'v3',
  });

export function setLanguageFromProfile(lang) {
  const valid = ['hu', 'en', 'tl', 'uk', 'de'].includes(lang) ? lang : 'hu';
  i18n.changeLanguage(valid);
}

export default i18n;
