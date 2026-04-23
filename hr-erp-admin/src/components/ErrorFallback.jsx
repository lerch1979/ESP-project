import React from 'react';
import { Box, Paper, Typography, Button, Stack, Divider } from '@mui/material';
import { ErrorOutline as ErrorIcon, Refresh as RefreshIcon } from '@mui/icons-material';

/**
 * User-facing fallback when React crashes inside a Sentry.ErrorBoundary.
 * Keeps copy in Hungarian to match the rest of the admin UI.
 * `error` + `resetError` come from Sentry's ErrorBoundary props.
 */
export default function ErrorFallback({ error, resetError, eventId }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f3f4f6', p: 3 }}>
      <Paper elevation={2} sx={{ p: 4, maxWidth: 560, width: '100%' }}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <ErrorIcon color="error" sx={{ fontSize: 48 }} />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Váratlan hiba történt
          </Typography>
        </Stack>

        <Typography variant="body1" sx={{ mb: 2 }}>
          A rendszer nem várt állapotba került. Az eseményt automatikusan továbbítottuk a fejlesztőknek.
        </Typography>

        {eventId && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontFamily: 'monospace', mb: 2 }}>
            Esemény azonosító: {eventId}
          </Typography>
        )}

        <Divider sx={{ my: 2 }} />

        <Stack direction="row" spacing={2}>
          <Button
            variant="contained" color="primary" startIcon={<RefreshIcon />}
            onClick={() => { resetError(); window.location.reload(); }}
          >
            Újratöltés
          </Button>
          <Button
            variant="outlined"
            onClick={() => { resetError(); window.history.back(); }}
          >
            Vissza
          </Button>
        </Stack>

        {import.meta.env.DEV && error?.message && (
          <Paper variant="outlined" sx={{ mt: 3, p: 2, bgcolor: '#fff7ed' }}>
            <Typography variant="caption" color="text.secondary">Dev-only stack:</Typography>
            <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap' }}>{String(error.stack || error.message)}</pre>
          </Paper>
        )}
      </Paper>
    </Box>
  );
}
