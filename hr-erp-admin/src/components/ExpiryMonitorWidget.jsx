import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, CardContent, Typography, Box, Chip, Switch, FormControlLabel,
  CircularProgress, Stack, Divider, Button, Tooltip,
} from '@mui/material';
import { HourglassBottom as HourglassIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { expiryMonitorAPI } from '../services/api';

const SEVERITY = {
  critical: { label: 'Lejárt / kritikus', color: 'error' },
  high: { label: '≤ 7 nap', color: 'warning' },
  warning: { label: '≤ 14 nap', color: 'info' },
  info: { label: 'Közelgő', color: 'default' },
};

const FIELD_LABEL = { visa: 'Vízum', contract: 'Szerződés', document: 'Dokumentum' };

/**
 * Visa/contract/document expiry monitor widget.
 * - Shows a runtime on/off toggle (no restart).
 * - When OFF: renders "Kikapcsolva" instead of data.
 * - When ON: severity counts + the soonest-expiring items.
 * `compact` (dashboard) hides the item list and the manual-run button.
 */
export default function ExpiryMonitorWidget({ compact = false }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [cfg, sum] = await Promise.all([
        expiryMonitorAPI.getConfig(),
        expiryMonitorAPI.getSummary(),
      ]);
      setEnabled(!!cfg.data.enabled);
      setSummary(sum.data);
    } catch (e) {
      setError('Nem sikerült betölteni a lejárati monitort.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (next) => {
    setSaving(true);
    setEnabled(next); // optimistic
    try {
      await expiryMonitorAPI.updateConfig({ enabled: next });
      await load();
    } catch {
      setEnabled(!next); // revert
      setError('A kapcsoló mentése nem sikerült.');
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <HourglassIcon color="action" />
        <Typography variant="h6">Lejárati figyelő</Typography>
      </Box>
      <FormControlLabel
        control={<Switch checked={enabled} onChange={(e) => toggle(e.target.checked)} disabled={saving} />}
        label={enabled ? 'Bekapcsolva' : 'Kikapcsolva'}
        sx={{ mr: 0 }}
      />
    </Box>
  );

  return (
    <Card>
      <CardContent>
        {header}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={28} /></Box>
        ) : error ? (
          <Typography color="error" variant="body2">{error}</Typography>
        ) : !enabled ? (
          <Box sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
            <Typography variant="body1">Kikapcsolva</Typography>
            <Typography variant="caption">A vízum/szerződés lejárati riasztások nem aktívak.</Typography>
          </Box>
        ) : (
          <>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
              {['critical', 'high', 'warning', 'info'].map((sev) => (
                <Chip
                  key={sev}
                  size="small"
                  color={SEVERITY[sev].color}
                  variant={summary?.counts?.[sev] ? 'filled' : 'outlined'}
                  label={`${SEVERITY[sev].label}: ${summary?.counts?.[sev] || 0}`}
                />
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Összesen {summary?.total || 0} közelgő lejárat
            </Typography>

            {!compact && (
              <>
                <Divider sx={{ my: 1.5 }} />
                {(summary?.items || []).length === 0 ? (
                  <Typography variant="body2" color="text.secondary">Nincs közelgő lejárat.</Typography>
                ) : (
                  <Stack divider={<Divider flexItem />} spacing={0.5}>
                    {summary.items.slice(0, 12).map((it, i) => (
                      <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                        <Box>
                          <Typography variant="body2">
                            {it.name || '—'} · {FIELD_LABEL[it.field] || it.field}
                            {it.document_type ? ` (${it.document_type})` : ''}
                            {it.nationality ? ` · ${it.nationality}` : ''}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">{it.expiry_date}</Typography>
                        </Box>
                        <Chip
                          size="small"
                          color={SEVERITY[it.severity]?.color || 'default'}
                          label={it.days_until < 0 ? `${Math.abs(it.days_until)} napja lejárt` : `${it.days_until} nap`}
                        />
                      </Box>
                    ))}
                  </Stack>
                )}
                <Box sx={{ mt: 1.5, display: 'flex', gap: 1 }}>
                  <Tooltip title="Azonnali ellenőrzés futtatása">
                    <Button size="small" startIcon={<RefreshIcon />} disabled={saving}
                      onClick={async () => { setSaving(true); try { await expiryMonitorAPI.run(); await load(); } finally { setSaving(false); } }}>
                      Ellenőrzés most
                    </Button>
                  </Tooltip>
                  <Button size="small" onClick={() => navigate('/expiry-monitor')}>Szabályok kezelése</Button>
                </Box>
              </>
            )}
            {compact && (
              <Box sx={{ mt: 1 }}>
                <Button size="small" onClick={() => navigate('/expiry-monitor')}>Részletek</Button>
              </Box>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
