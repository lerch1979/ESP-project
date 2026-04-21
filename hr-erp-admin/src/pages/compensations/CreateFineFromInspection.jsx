import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Paper, Typography, Stack, Button, TextField, MenuItem, Select, FormControl, InputLabel,
  Grid, Alert, Divider, IconButton, Chip,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Save as SaveIcon, Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { inspectionsAPI } from '../../services/api';

export default function CreateFineFromInspection() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const inspectionId = params.get('inspectionId') || '';

  const [fineTypes, setFineTypes] = useState([]);
  const [inspection, setInspection] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [fineTypeId, setFineTypeId] = useState('');
  const [roomInspectionId, setRoomInspectionId] = useState('');
  const [notes, setNotes] = useState('');
  const [residents, setResidents] = useState([{ name: '', email: '', phone: '' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const ft = await inspectionsAPI.listFineTypes();
        setFineTypes(ft?.data || []);
      } catch { toast.error('Bírság típusok betöltése sikertelen'); }
    })();
  }, []);

  useEffect(() => {
    if (!inspectionId) return;
    (async () => {
      try {
        const [insp, rm] = await Promise.all([
          inspectionsAPI.getById(inspectionId),
          inspectionsAPI.listInspectionRooms(inspectionId).catch(() => ({ data: [] })),
        ]);
        const i = insp?.data || insp;
        setInspection(i);
        setRooms(rm?.data || []);
      } catch { toast.error('Ellenőrzés betöltése sikertelen'); }
    })();
  }, [inspectionId]);

  const selectedType = fineTypes.find(t => t.id === fineTypeId);
  const selectedRoom = rooms.find(r => r.room_inspection_id === roomInspectionId);
  const perPerson = selectedType ? Number(selectedType.amount_per_person) : 0;
  const total = perPerson * residents.filter(r => r.name.trim()).length;

  // If a room is selected and it has a resident snapshot, offer to prefill
  const prefillFromRoom = () => {
    if (!selectedRoom?.residents_snapshot) return;
    const snap = selectedRoom.residents_snapshot;
    if (Array.isArray(snap) && snap.length > 0) {
      setResidents(snap.map(r => ({ name: r.name || '', email: '', phone: '' })));
    }
  };

  const submit = async () => {
    if (!fineTypeId) return toast.warn('Válassz bírság típust');
    const filled = residents.filter(r => r.name.trim());
    if (filled.length === 0) return toast.warn('Legalább egy lakó kell');

    setSaving(true);
    try {
      const res = await inspectionsAPI.createFine({
        inspection_id: inspectionId || null,
        fine_type_id: fineTypeId,
        room_inspection_id: roomInspectionId || null,
        residents: filled.map(r => ({ name: r.name.trim(), email: r.email || null, phone: r.phone || null })),
        notes: notes || null,
      });
      const compId = res?.data?.compensation?.id;
      toast.success(`Bírság létrehozva: ${res?.data?.compensation?.compensation_number}`);
      navigate(`/compensations/${compId}`);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Létrehozás sikertelen');
    } finally { setSaving(false); }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>Vissza</Button>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Új bírság</Typography>
      </Stack>

      {inspection && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Kapcsolódó ellenőrzés: <b>{inspection.inspectionNumber}</b>
          {inspection.accommodationName ? ` — ${inspection.accommodationName}` : ''}
        </Alert>
      )}

      <Paper sx={{ p: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={8}>
            <FormControl fullWidth>
              <InputLabel>Bírság típusa *</InputLabel>
              <Select value={fineTypeId} label="Bírság típusa *" onChange={e => setFineTypeId(e.target.value)}>
                {fineTypes.map(t => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name} — {Number(t.amount_per_person).toLocaleString('hu-HU')} HUF / fő
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Szoba (opcionális)</InputLabel>
              <Select value={roomInspectionId} label="Szoba (opcionális)" onChange={e => setRoomInspectionId(e.target.value)}>
                <MenuItem value="">—</MenuItem>
                {rooms.filter(r => r.room_inspection_id).map(r => (
                  <MenuItem key={r.room_inspection_id} value={r.room_inspection_id}>{r.room_number}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12}>
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
              <Typography variant="subtitle2">Lakók ({residents.filter(r => r.name.trim()).length})</Typography>
              <Stack direction="row" spacing={1}>
                {selectedRoom?.residents_snapshot?.length > 0 && (
                  <Button size="small" onClick={prefillFromRoom}>Szoba lakók betöltése</Button>
                )}
                <Button size="small" startIcon={<AddIcon />}
                  onClick={() => setResidents([...residents, { name: '', email: '', phone: '' }])}
                >
                  Lakó
                </Button>
              </Stack>
            </Stack>
            <Divider sx={{ my: 1 }} />
            <Stack spacing={1}>
              {residents.map((r, idx) => (
                <Stack key={idx} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField size="small" label="Név" sx={{ flex: 2 }} value={r.name}
                    onChange={e => setResidents(residents.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                  />
                  <TextField size="small" label="E-mail" sx={{ flex: 2 }} value={r.email}
                    onChange={e => setResidents(residents.map((x, i) => i === idx ? { ...x, email: e.target.value } : x))}
                  />
                  <TextField size="small" label="Telefon" sx={{ flex: 1 }} value={r.phone}
                    onChange={e => setResidents(residents.map((x, i) => i === idx ? { ...x, phone: e.target.value } : x))}
                  />
                  <IconButton color="error"
                    disabled={residents.length <= 1}
                    onClick={() => setResidents(residents.filter((_, i) => i !== idx))}
                  ><DeleteIcon /></IconButton>
                </Stack>
              ))}
            </Stack>
          </Grid>

          <Grid item xs={12}>
            <TextField label="Jegyzet" multiline rows={2} fullWidth
              value={notes} onChange={e => setNotes(e.target.value)}
            />
          </Grid>

          <Grid item xs={12}>
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="overline">Végösszeg</Typography>
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>
                    {total.toLocaleString('hu-HU')} HUF
                  </Typography>
                </Box>
                {selectedType && (
                  <Chip color="default" sx={{ bgcolor: 'background.paper' }}
                    label={`${residents.filter(r => r.name.trim()).length} fő × ${perPerson.toLocaleString('hu-HU')} HUF`}
                  />
                )}
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <Button variant="contained" size="large" startIcon={<SaveIcon />} onClick={submit} disabled={saving}>
              {saving ? 'Mentés…' : 'Bírság kiállítása'}
            </Button>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}
