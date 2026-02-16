import React, { useState, useEffect } from 'react';
import { Snackbar, Button, IconButton, Box, Typography } from '@mui/material';
import { Close as CloseIcon, GetApp as GetAppIcon } from '@mui/icons-material';

function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-install-dismissed', '1');
  };

  return (
    <Snackbar
      open={showPrompt}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      message={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <GetAppIcon sx={{ color: '#2c5f2d' }} />
          <Typography variant="body2">
            Telepitsd az alkalmazast a gyorsabb eleresert!
          </Typography>
        </Box>
      }
      action={
        <>
          <Button
            size="small"
            onClick={handleInstall}
            sx={{ color: '#2c5f2d', fontWeight: 600 }}
          >
            Telepites
          </Button>
          <IconButton size="small" color="inherit" onClick={handleDismiss}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </>
      }
    />
  );
}

export default InstallPrompt;
