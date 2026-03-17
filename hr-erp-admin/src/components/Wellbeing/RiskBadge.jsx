import React from 'react';
import { Chip } from '@mui/material';
import { Warning, CheckCircle, ErrorOutline } from '@mui/icons-material';

const RISK_CONFIG = {
  red:    { label: 'Magas kockázat', color: 'error',   icon: <ErrorOutline /> },
  yellow: { label: 'Közepes kockázat', color: 'warning', icon: <Warning /> },
  green:  { label: 'Egészséges',     color: 'success', icon: <CheckCircle /> },
};

const RiskBadge = ({ level, size = 'small', showIcon = true, variant }) => {
  const config = RISK_CONFIG[level] || { label: level || '—', color: 'default', icon: null };

  return (
    <Chip
      label={config.label}
      color={config.color}
      size={size}
      icon={showIcon ? config.icon : undefined}
      variant={variant}
    />
  );
};

export default RiskBadge;
