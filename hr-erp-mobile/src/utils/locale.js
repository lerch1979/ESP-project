// Locale-aware formatting helpers. The app's i18n language code (hu/en/uk/tl/de)
// maps to a proper IETF BCP-47 tag so dates, numbers and currency render in the
// resident's actual language — replacing the ~47 hardcoded 'hu-HU' call sites
// that made the app look half-Hungarian to non-Hungarian users.

const IETF = {
  hu: 'hu-HU',
  en: 'en-US',
  uk: 'uk-UA',
  tl: 'fil-PH', // Tagalog/Filipino
  de: 'de-DE',
};

export function localeTag(lng) {
  if (!lng) return IETF.hu;
  return IETF[lng] || IETF[String(lng).split('-')[0]] || IETF.hu;
}

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value, lng, opts = { year: 'numeric', month: 'short', day: 'numeric' }) {
  const d = toDate(value);
  return d ? d.toLocaleDateString(localeTag(lng), opts) : '';
}

export function formatDateTime(
  value,
  lng,
  opts = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
) {
  const d = toDate(value);
  return d ? d.toLocaleString(localeTag(lng), opts) : '';
}

export function formatNumber(value, lng, opts) {
  if (value == null || value === '') return '';
  return Number(value).toLocaleString(localeTag(lng), opts);
}

export function formatMoney(value, lng, currency = 'HUF') {
  if (value == null || value === '') return '';
  return Number(value).toLocaleString(localeTag(lng), {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
}

// Localized relative time. Uses i18n keys (time.*) rather than
// Intl.RelativeTimeFormat, which isn't guaranteed in every RN/Hermes runtime.
// `t` is the i18n translator; falls back to an absolute date for older items.
export function timeAgo(value, lng, t) {
  const d = toDate(value);
  if (!d) return '';
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return t('time.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('time.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('time.daysAgo', { count: days });
  return formatDate(d, lng);
}
