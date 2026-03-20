import React, { useState, useEffect } from 'react';
import { Snackbar, Alert } from '@mui/material';
import { WifiOff as WifiOffIcon, Wifi as WifiIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

/**
 * Detects online/offline state and shows a notification.
 */
export default function OfflineDetector() {
  const { t } = useTranslation();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const goOnline = () => { setIsOnline(true); setShow(true); };
    const goOffline = () => { setIsOnline(false); setShow(true); };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return (
    <Snackbar
      open={show}
      autoHideDuration={isOnline ? 4000 : null}
      onClose={() => setShow(false)}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert
        severity={isOnline ? 'success' : 'warning'}
        icon={isOnline ? <WifiIcon /> : <WifiOffIcon />}
        onClose={() => setShow(false)}
        variant="filled"
      >
        {isOnline
          ? t('backOnline', 'Újra online! A változások szinkronizálódnak.')
          : t('offline', 'Offline módban vagy. Egyes funkciók korlátozottak.')}
      </Alert>
    </Snackbar>
  );
}
