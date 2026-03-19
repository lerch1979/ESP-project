import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Bundled translations — no HTTP backend needed
import huCommon from '../../public/locales/hu/common.json';
import enCommon from '../../public/locales/en/common.json';
import tlCommon from '../../public/locales/tl/common.json';
import ukCommon from '../../public/locales/uk/common.json';
import deCommon from '../../public/locales/de/common.json';

// NO LanguageDetector — language comes from user.preferred_language on login
i18n
  .use(initReactI18next)
  .init({
    lng: localStorage.getItem('i18nextLng') || 'hu', // Persist between refreshes
    fallbackLng: 'hu',
    supportedLngs: ['hu', 'en', 'tl', 'uk', 'de'],
    defaultNS: 'common',
    resources: {
      hu: { common: huCommon },
      en: { common: enCommon },
      tl: { common: tlCommon },
      uk: { common: ukCommon },
      de: { common: deCommon },
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

/**
 * Set language from user profile (called on login/auth check).
 * Also persists to localStorage for page refreshes.
 */
export function setLanguageFromProfile(preferredLanguage) {
  const lang = ['hu', 'en', 'tl', 'uk', 'de'].includes(preferredLanguage) ? preferredLanguage : 'hu';
  i18n.changeLanguage(lang);
  localStorage.setItem('i18nextLng', lang);
}

export default i18n;
