import React from 'react';
import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'hu', flag: '🇭🇺', label: 'Magyar' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'tl', flag: '🇵🇭', label: 'Tagalog' },
  { code: 'uk', flag: '🇺🇦', label: 'Українська' },
  { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
];

export default function LanguageSwitcher({ compact = false }) {
  const { i18n } = useTranslation();

  const handleChange = async (e) => {
    const lng = e.target.value;
    await i18n.changeLanguage(lng);
    localStorage.setItem('i18nextLng', lng);
    // Optionally sync to backend
    try {
      const token = localStorage.getItem('token');
      if (token) {
        fetch('/api/v1/users/me/language', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ language: lng }),
        }).catch(() => {});
      }
    } catch {}
  };

  if (compact) {
    return (
      <select
        value={i18n.language?.substring(0, 2) || 'hu'}
        onChange={handleChange}
        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, cursor: 'pointer', background: '#fff' }}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
        ))}
      </select>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          onClick={() => handleChange({ target: { value: l.code } })}
          style={{
            padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 16,
            background: i18n.language?.startsWith(l.code) ? '#e0e7ff' : 'transparent',
          }}
          title={l.label}
        >
          {l.flag}
        </button>
      ))}
    </div>
  );
}
