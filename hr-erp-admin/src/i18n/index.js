import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translations directly (no backend needed for bundled translations)
import huCommon from '../../public/locales/hu/common.json';
import enCommon from '../../public/locales/en/common.json';
import tlCommon from '../../public/locales/tl/common.json';
import ukCommon from '../../public/locales/uk/common.json';
import deCommon from '../../public/locales/de/common.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
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
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

export default i18n;
