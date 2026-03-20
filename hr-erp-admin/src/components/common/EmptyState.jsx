import React from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import { Inbox as InboxIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

/**
 * Empty state component — displayed when a list has no items
 */
export default function EmptyState({
  icon: Icon = InboxIcon,
  title,
  description,
  action,
  actionLabel,
}) {
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
    >
      <Icon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} aria-hidden="true" />
      <Typography variant="h6" gutterBottom>
        {title || t('noData')}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 400 }}>
          {description}
        </Typography>
      )}
      {action && (
        <Button variant="contained" onClick={action}>
          {actionLabel || t('getStarted')}
        </Button>
      )}
    </Paper>
  );
}
