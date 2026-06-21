import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import hu from './locales/hu.json';
import en from './locales/en.json';
import tl from './locales/tl.json';
import uk from './locales/uk.json';
import de from './locales/de.json';

const SUPPORTED = ['hu', 'en', 'tl', 'uk', 'de'];

// Initial language = the device language if we support it, so a Filipino /
// Ukrainian resident sees the LOGIN screen in their language before they ever
// authenticate. After login, setLanguageFromProfile() takes over from
// user.preferred_language (the source of truth once known).
function detectDeviceLanguage() {
  try {
    for (const loc of Localization.getLocales() || []) {
      let code = (loc.languageCode || '').toLowerCase();
      if (code === 'fil') code = 'tl'; // Filipino → Tagalog bundle
      if (SUPPORTED.includes(code)) return code;
    }
  } catch (e) { /* fall through to default */ }
  return 'hu';
}

i18n
  .use(initReactI18next)
  .init({
    lng: detectDeviceLanguage(),
    fallbackLng: 'hu',
    supportedLngs: SUPPORTED,
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
