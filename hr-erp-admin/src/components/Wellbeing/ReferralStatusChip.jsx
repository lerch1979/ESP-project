import React from 'react';
import { Chip } from '@mui/material';
import { HourglassEmpty, CheckCircle, Cancel, Done, AccessTime } from '@mui/icons-material';

const STATUS_CONFIG = {
  pending:   { label: 'Függőben',   color: 'warning', icon: <HourglassEmpty /> },
  accepted:  { label: 'Elfogadva', color: 'info',    icon: <CheckCircle /> },
  declined:  { label: 'Elutasítva', color: 'default', icon: <Cancel /> },
  completed: { label: 'Teljesítve', color: 'success', icon: <Done /> },
  expired:   { label: 'Lejárt',    color: 'error',   icon: <AccessTime /> },
};

const ReferralStatusChip = ({ status, size = 'small' }) => {
  const config = STATUS_CONFIG[status] || { label: status || '—', color: 'default', icon: null };
  return <Chip label={config.label} color={config.color} size={size} icon={config.icon} />;
};

export default ReferralStatusChip;
