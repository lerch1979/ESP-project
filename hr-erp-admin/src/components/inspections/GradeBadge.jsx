import React from 'react';
import { Chip } from '@mui/material';

const GRADE_MAP = {
  excellent: { label: 'Kiváló', color: 'success', dot: '#16a34a' },
  good: { label: 'Jó', color: 'success', dot: '#22c55e' },
  acceptable: { label: 'Megfelelő', color: 'warning', dot: '#eab308' },
  poor: { label: 'Gyenge', color: 'warning', dot: '#f97316' },
  bad: { label: 'Rossz', color: 'error', dot: '#ef4444' },
  critical: { label: 'Kritikus', color: 'error', dot: '#b91c1c' },
};

export default function GradeBadge({ grade, size = 'small' }) {
  if (!grade) {
    return <Chip label="N/A" size={size} variant="outlined" />;
  }
  const cfg = GRADE_MAP[grade] || { label: grade, color: 'default', dot: '#9ca3af' };
  return (
    <Chip
      size={size}
      color={cfg.color}
      label={cfg.label}
      sx={{ fontWeight: 600 }}
    />
  );
}

export { GRADE_MAP };
