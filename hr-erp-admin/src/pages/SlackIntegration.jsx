import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, Switch, FormControlLabel, TextField, Button,
  Grid, Card, CardContent, Divider, Alert, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, IconButton, CircularProgress,
} from '@mui/material';
import {
  Sync as SyncIcon, Send as SendIcon, Settings as SettingsIcon,
  People as PeopleIcon, BarChart as StatsIcon, Check as CheckIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { slackAPI } from '../services/api';

export default function SlackIntegration() {
  const [config, setConfig] = useState({
    enabled: false,
    check_in_time: '09:00',
    timezone: 'Europe/Budapest',
    message_template: 'Szia! 👋 Hogy érzed magad ma?',
  });
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [configRes, statsRes, usersRes] = await Promise.all([
        slackAPI.getConfig().catch(() => ({ data: null })),
        slackAPI.getStats().catch(() => ({ data: null })),
        slackAPI.getUsers().catch(() => ({ data: [] })),
      ]);

      if (configRes.data) {
        setConfig({
          enabled: configRes.data.enabled || false,
          check_in_time: configRes.data.check_in_time?.slice(0, 5) || '09:00',
          timezone: configRes.data.timezone || 'Europe/Budapest',
          message_template: configRes.data.message_template || 'Szia! 👋 Hogy érzed magad ma?',
        });
      }
      setStats(statsRes.data);
      setUsers(usersRes.data || []);
    } catch (error) {
      toast.error('Betöltési hiba');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await slackAPI.updateConfig(config);
      toast.success('Beállítások mentve');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Mentési hiba');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await slackAPI.syncUsers();
      toast.success(`${res.data.synced}/${res.data.total} felhasználó szinkronizálva`);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Szinkronizálási hiba');
    } finally {
      setSyncing(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await slackAPI.sendTestMessage();
      toast.success('Teszt üzenet elküldve! Nézd meg a Slack-ben.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Küldési hiba');
    } finally {
      setTesting(false);
    }
  };

  const handleToggleUser = async (id) => {
    try {
      await slackAPI.toggleUser(id);
      setUsers(users.map(u => u.id === id ? { ...u, enabled: !u.enabled } : u));
    } catch {
      toast.error('Hiba történt');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <SettingsIcon /> Slack Integráció
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Napi hangulat check-in Slack-en keresztül. Az emoji reakciók automatikusan pulzus felmérésként rögzülnek.
      </Typography>

      {/* Stats Cards */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Szinkronizált felhasználók', value: stats.usersSynced, icon: <PeopleIcon /> },
            { label: 'Mai küldések', value: stats.sentToday, icon: <SendIcon /> },
            { label: 'Mai válaszok', value: stats.responsesToday, icon: <CheckIcon /> },
            { label: 'Heti válaszarány', value: `${stats.responseRateWeek}%`, icon: <StatsIcon /> },
          ].map((stat, i) => (
            <Grid item xs={6} md={3} key={i}>
              <Card>
                <CardContent sx={{ textAlign: 'center', py: 2 }}>
                  <Box sx={{ color: 'primary.main', mb: 1 }}>{stat.icon}</Box>
                  <Typography variant="h4" fontWeight={700}>{stat.value}</Typography>
                  <Typography variant="body2" color="text.secondary">{stat.label}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Grid container spacing={3}>
        {/* Config Panel */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Beállítások</Typography>
            <Divider sx={{ mb: 2 }} />

            <FormControlLabel
              control={
                <Switch
                  checked={config.enabled}
                  onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                  color="primary"
                />
              }
              label="Napi check-in engedélyezve"
              sx={{ mb: 2, display: 'block' }}
            />

            <TextField
              label="Check-in időpont"
              type="time"
              value={config.check_in_time}
              onChange={(e) => setConfig({ ...config, check_in_time: e.target.value })}
              fullWidth
              sx={{ mb: 2 }}
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              label="Időzóna"
              value={config.timezone}
              onChange={(e) => setConfig({ ...config, timezone: e.target.value })}
              fullWidth
              sx={{ mb: 2 }}
            />

            <TextField
              label="Üzenet sablon"
              value={config.message_template}
              onChange={(e) => setConfig({ ...config, message_template: e.target.value })}
              fullWidth
              multiline
              rows={3}
              sx={{ mb: 2 }}
              helperText="Ez az üzenet jelenik meg a Slack DM-ben minden reggel"
            />

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Mentés...' : 'Mentés'}
              </Button>
              <Button
                variant="outlined"
                onClick={handleTest}
                disabled={testing}
                startIcon={<SendIcon />}
              >
                {testing ? 'Küldés...' : 'Teszt üzenet'}
              </Button>
            </Box>
          </Paper>
        </Grid>

        {/* Actions Panel */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>Felhasználó szinkronizálás</Typography>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Szinkronizálja a Slack workspace felhasználókat az e-mail cím alapján.
            </Typography>
            <Button
              variant="outlined"
              onClick={handleSync}
              disabled={syncing}
              startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon />}
            >
              {syncing ? 'Szinkronizálás...' : 'Felhasználók szinkronizálása'}
            </Button>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Emoji → Hangulat térkép</Typography>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {[
                { emoji: '😢', label: 'Nagyon rossz', score: 1 },
                { emoji: '😟', label: 'Rossz', score: 2 },
                { emoji: '😐', label: 'Semleges', score: 3 },
                { emoji: '🙂', label: 'Jó', score: 4 },
                { emoji: '😄', label: 'Nagyon jó', score: 5 },
              ].map((m) => (
                <Chip
                  key={m.score}
                  label={`${m.emoji} ${m.label} (${m.score}/5)`}
                  variant="outlined"
                  sx={{ fontSize: '0.85rem' }}
                />
              ))}
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Users Table */}
      {users.length > 0 && (
        <Paper sx={{ mt: 3, p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Slack felhasználók ({users.length})
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Név</TableCell>
                  <TableCell>Slack név</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell align="center">Aktív</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.user_name}</TableCell>
                    <TableCell>{user.slack_real_name}</TableCell>
                    <TableCell>{user.slack_email}</TableCell>
                    <TableCell align="center">
                      <Switch
                        checked={user.enabled}
                        onChange={() => handleToggleUser(user.id)}
                        size="small"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Setup Guide */}
      {!stats?.usersSynced && (
        <Alert severity="info" sx={{ mt: 3 }}>
          <Typography variant="subtitle2">Beállítási útmutató:</Typography>
          <ol style={{ margin: '8px 0', paddingLeft: 20 }}>
            <li>Hozd létre a Slack App-ot: api.slack.com/apps</li>
            <li>Jogosultságok: chat:write, im:write, users:read, users:read.email</li>
            <li>Telepítsd a workspace-be</li>
            <li>Másold be a SLACK_BOT_TOKEN és SLACK_SIGNING_SECRET értékeket a .env fájlba</li>
            <li>Kattints a "Felhasználók szinkronizálása" gombra</li>
            <li>Kapcsold be a napi check-in-t</li>
          </ol>
        </Alert>
      )}
    </Box>
  );
}
