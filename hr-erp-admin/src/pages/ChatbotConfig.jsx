import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, TextField, Button, Switch, FormControlLabel } from '@mui/material';
import { Save } from '@mui/icons-material';
import { chatbotAPI } from '../services/api';
import { toast } from 'react-toastify';

export default function ChatbotConfig() {
  const [formData, setFormData] = useState({
    welcome_message: '',
    fallback_message: '',
    escalation_message: '',
    keyword_threshold: 1,
    is_active: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await chatbotAPI.getConfig();
        if (response.data) {
          setFormData({
            welcome_message: response.data.welcome_message || '',
            fallback_message: response.data.fallback_message || '',
            escalation_message: response.data.escalation_message || '',
            keyword_threshold: response.data.keyword_threshold || 1,
            is_active: response.data.is_active !== false,
          });
        }
      } catch (error) {
        toast.error('Hiba a konfiguráció betöltése közben');
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      await chatbotAPI.updateConfig({
        ...formData,
        keyword_threshold: parseInt(formData.keyword_threshold) || 1,
      });
      toast.success('Konfiguráció mentve');
    } catch (error) {
      toast.error('Hiba a mentés közben');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Typography>Betöltés...</Typography>;

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Chatbot Konfiguráció</Typography>

      <Paper sx={{ p: 3, maxWidth: 700 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <TextField
            label="Üdvözlő üzenet"
            multiline rows={3}
            value={formData.welcome_message}
            onChange={(e) => setFormData(p => ({ ...p, welcome_message: e.target.value }))}
            helperText="Ez az üzenet jelenik meg új beszélgetés indításakor"
          />

          <TextField
            label="Alapértelmezett válasz (fallback)"
            multiline rows={3}
            value={formData.fallback_message}
            onChange={(e) => setFormData(p => ({ ...p, fallback_message: e.target.value }))}
            helperText="Ha a bot nem talál megfelelő választ, ezt az üzenetet küldi"
          />

          <TextField
            label="Eszkalációs üzenet"
            multiline rows={3}
            value={formData.escalation_message}
            onChange={(e) => setFormData(p => ({ ...p, escalation_message: e.target.value }))}
            helperText="Hibajegy automatikus létrehozásakor megjelenő üzenet"
          />

          <TextField
            label="Kulcsszó küszöbérték"
            type="number"
            value={formData.keyword_threshold}
            onChange={(e) => setFormData(p => ({ ...p, keyword_threshold: e.target.value }))}
            helperText="Minimális kulcsszó-egyezések száma a válasz megtalálásához (1 = laza, 3 = szigorú)"
            sx={{ maxWidth: 300 }}
          />

          <FormControlLabel
            control={
              <Switch checked={formData.is_active}
                onChange={(e) => setFormData(p => ({ ...p, is_active: e.target.checked }))} />
            }
            label="Chatbot aktív"
          />

          <Box>
            <Button variant="contained" startIcon={<Save />} onClick={handleSave} disabled={saving}>
              {saving ? 'Mentés...' : 'Mentés'}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
