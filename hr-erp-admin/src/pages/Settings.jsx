import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Divider,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Email as EmailIcon,
  Send as SendIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { notificationsAPI } from '../services/api';
import Layout from '../components/Layout';

function Settings() {
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const handleTestEmail = async () => {
    if (!testEmail) return;
    setSending(true);
    setResult(null);
    try {
      const response = await notificationsAPI.testEmail(testEmail);
      setResult({
        success: true,
        message: response.message || 'Teszt email sikeresen elküldve!',
      });
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || 'Email küldési hiba';
      setResult({ success: false, message: msg });
    } finally {
      setSending(false);
    }
  };

  return (
    <Layout>
      <Box>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
          <SettingsIcon sx={{ fontSize: 32, color: '#2c5f2d' }} />
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Beállítások
          </Typography>
        </Box>

        {/* Email settings card */}
        <Paper sx={{ p: 3, maxWidth: 600 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <EmailIcon sx={{ color: '#2c5f2d' }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Email beállítások
            </Typography>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Az email küldéshez Gmail SMTP-t használunk. A beállításhoz szükséges lépések:
          </Typography>

          <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: '#f8faf8' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Gmail alkalmazás jelszó beállítása:
            </Typography>
            <Typography variant="body2" component="ol" sx={{ pl: 2, m: 0, '& li': { mb: 0.5 } }}>
              <li>Nyisd meg a Google fiók biztonsági beállításait</li>
              <li>Kapcsold be a <strong>Kétlépcsős azonosítást</strong> (2-Step Verification)</li>
              <li>Menj az <strong>Alkalmazás jelszavak</strong> (App passwords) menüpontra</li>
              <li>Hozz létre egy új jelszót: App = "Mail", Device = "Other (HR-ERP)"</li>
              <li>Másold be a generált 16 karakteres jelszót a <code>.env</code> fájl <code>SMTP_PASS</code> mezőjébe</li>
            </Typography>
          </Paper>

          <Divider sx={{ mb: 3 }} />

          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
            Email beállítások tesztelése
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Küldj egy teszt emailt az SMTP konfiguráció ellenőrzéséhez.
          </Typography>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <TextField
              label="Címzett email"
              type="email"
              size="small"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="teszt@example.com"
              sx={{ flexGrow: 1 }}
              disabled={sending}
            />
            <Button
              variant="contained"
              onClick={handleTestEmail}
              disabled={!testEmail || sending}
              startIcon={sending ? <CircularProgress size={18} color="inherit" /> : <SendIcon />}
              sx={{ bgcolor: '#2c5f2d', '&:hover': { bgcolor: '#3d6b4a' }, whiteSpace: 'nowrap' }}
            >
              {sending ? 'Küldés...' : 'Teszt küldés'}
            </Button>
          </Box>

          {result && (
            <Alert
              severity={result.success ? 'success' : 'error'}
              icon={result.success ? <CheckCircleIcon /> : undefined}
              sx={{ mt: 2 }}
            >
              {result.message}
            </Alert>
          )}
        </Paper>
      </Box>
    </Layout>
  );
}

export default Settings;
