import React from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

/**
 * Error state component — displayed when data loading fails
 */
export default function ErrorState({ error, onRetry }) {
  const { t } = useTranslation();

  return (
    <Paper
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 8,
        px: 4,
        textAlign: 'center',
      }}
      role="alert"
    >
      <WarningIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} aria-hidden="true" />
      <Typography variant="h6" gutterBottom>
        {t('somethingWentWrong')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 400 }}>
        {error?.message || t('genericError')}
      </Typography>
      {onRetry && (
        <Button variant="contained" onClick={onRetry}>
          {t('retry')}
        </Button>
      )}
    </Paper>
  );
}
