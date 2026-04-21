import React from 'react';
import { Chip, Tooltip } from '@mui/material';

export const LANGUAGE_FLAGS = {
  hu: '\uD83C\uDDED\uD83C\uDDFA',
  en: '\uD83C\uDDEC\uD83C\uDDE7',
  tl: '\uD83C\uDDF5\uD83C\uDDED',
  uk: '\uD83C\uDDFA\uD83C\uDDE6',
  de: '\uD83C\uDDE9\uD83C\uDDEA',
};

export const LANGUAGE_NAMES = {
  hu: 'Magyar',
  en: 'English',
  tl: 'Tagalog',
  uk: 'Українська',
  de: 'Deutsch',
};

export function LanguageBadge({ language, size = 'small' }) {
  if (!language || language === 'hu') return null;
  const flag = LANGUAGE_FLAGS[language];
  const name = LANGUAGE_NAMES[language] || language;
  if (!flag) return null;
  return (
    <Tooltip title={`Eredeti nyelv: ${name} \u2192 Magyar ford\u00EDt\u00E1s`}>
      <Chip
        size={size}
        label={`${flag} \u2192 ${LANGUAGE_FLAGS.hu}`}
        sx={{
          backgroundColor: '#e3f2fd',
          fontSize: '11px',
          height: '20px',
          ml: 0.5,
        }}
      />
    </Tooltip>
  );
}

export default LanguageBadge;
