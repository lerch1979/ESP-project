import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack,
  Typography, FormControl, InputLabel, Select, MenuItem, Divider, Alert,
  Checkbox, FormControlLabel, Box, List, ListItem, ListItemText, CircularProgress,
} from '@mui/material';
import { costCentersAPI } from '../../services/api';
import CostCenterSelector from './CostCenterSelector';
import { toast } from 'react-toastify';

/**
 * Tömeges átsorolás: a kijelölt számlák költséghelyének és/vagy könyvelési célpontjának
 * átállítása.
 *
 * Két dolog szándékosan van így megoldva:
 *
 * 1. MINDKÉT MEZŐ ÜRESEN HAGYHATÓ, és amit üresen hagysz, azt a szerver nem bántja. Ezért
 *    lehet csak költséghelyet állítani anélkül, hogy a meglévő szálláshely-besorolás
 *    elveszne — és fordítva.
 *
 * 2. A KIMARADT SORAKAT kilistázzuk. A "12 átsorolva" önmagában elrejtené, hogy három
 *    kimaradt egy lezárt hónap miatt, és a kimutatás csendben hiányos maradna.
 */
export default function BulkReallocateDialog({
  open, onClose, onDone, invoiceIds = [],
  costCenters = [], costCenterTree = [], accommodations = [],
}) {
  const [costCenterId, setCostCenterId] = useState('');
  const [target, setTarget] = useState('');       // '' | '__none__' | 'general' | 'central' | 'acc:<uuid>'
  const [force, setForce] = useState(false);
  const [overwriteSplit, setOverwriteSplit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (open) {
      setCostCenterId('');
      setTarget('');
      setForce(false);
      setOverwriteSplit(false);
      setResult(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!costCenterId && !target) {
      toast.error('Adj meg költséghelyet vagy könyvelési célpontot');
      return;
    }
    setSaving(true);
    try {
      const payload = { invoice_ids: invoiceIds };
      if (costCenterId) payload.cost_center_id = costCenterId;
      if (target) {
        payload.allocation = target === '__none__'
          ? null
          : (target.startsWith('acc:')
            ? { target_type: 'accommodation', accommodation_id: target.slice(4) }
            : { target_type: target });
      }
      if (force) payload.force = true;
      if (overwriteSplit) payload.overwrite_split = true;

      const res = await costCentersAPI.bulkReallocateInvoices(payload);
      if (res.success) {
        setResult(res.data);
        toast.success(res.message);
        onDone?.();
        // Ha minden sikerült, nincs mit elolvasni — a kimaradtak miatt maradunk nyitva.
        if ((res.data?.skipped_count || 0) === 0) onClose();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Hiba történt az átsorolás során');
    } finally {
      setSaving(false);
    }
  };

  const skipped = result?.skipped || [];

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>
        Átsorolás — {invoiceIds.length} számla
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Amit üresen hagysz, azt nem módosítja — így külön is átállítható a költséghely
            vagy a könyvelési célpont.
          </Typography>

          <CostCenterSelector
            value={costCenterId}
            onChange={setCostCenterId}
            costCenters={costCenters}
            costCenterTree={costCenterTree}
            label="Új költséghely (opcionális)"
          />

          <Divider />

          <FormControl size="small" fullWidth>
            <InputLabel>Hova könyveljük (opcionális)</InputLabel>
            <Select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              label="Hova könyveljük (opcionális)"
            >
              <MenuItem value="">-- Nem módosítom --</MenuItem>
              <MenuItem value="__none__">Besorolás törlése</MenuItem>
              <Divider />
              <MenuItem value="general">Általános (cég kiadásai)</MenuItem>
              <MenuItem value="central">Központi (saját rész)</MenuItem>
              <Divider />
              {accommodations.map((a) => (
                <MenuItem key={a.id} value={`acc:${a.id}`}>{a.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box>
            <FormControlLabel
              control={<Checkbox size="small" checked={overwriteSplit}
                onChange={(e) => setOverwriteSplit(e.target.checked)} />}
              label="A több helyre felosztott számlák is átsorolhatók (a részösszegek elvesznek)"
              slotProps={{ typography: { variant: 'body2' } }}
            />
            <FormControlLabel
              control={<Checkbox size="small" checked={force}
                onChange={(e) => setForce(e.target.checked)} />}
              label="Lezárt hónap számlái is átsorolhatók"
              slotProps={{ typography: { variant: 'body2' } }}
            />
          </Box>

          {force && (
            <Alert severity="warning" sx={{ py: 0.5 }}>
              A lezárt hónap átsorolása visszamenőleg megváltoztatja egy már kiszámlázott
              időszak kimutatását. A művelet naplózásra kerül.
            </Alert>
          )}

          {skipped.length > 0 && (
            <Alert severity="warning">
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                {result.updated_count} átsorolva · {skipped.length} kimaradt:
              </Typography>
              <List dense disablePadding>
                {skipped.map((s) => (
                  <ListItem key={s.id} disablePadding sx={{ display: 'list-item', ml: 2 }}>
                    <ListItemText
                      primaryTypographyProps={{ variant: 'body2' }}
                      primary={`${s.invoice_number || s.id.slice(0, 8)} — ${s.reason}`}
                    />
                  </ListItem>
                ))}
              </List>
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>
          {skipped.length > 0 ? 'Bezárás' : 'Mégse'}
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={saving || (!costCenterId && !target)}
          startIcon={saving ? <CircularProgress size={16} /> : null}
        >
          Átsorolás
        </Button>
      </DialogActions>
    </Dialog>
  );
}
