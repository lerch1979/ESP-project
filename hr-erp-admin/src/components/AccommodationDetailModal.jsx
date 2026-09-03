import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Button,
  TextField,
  Grid,
  Typography,
  Chip,
  CircularProgress,
  Box,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tabs,
  Tab,
  IconButton,
  LinearProgress,
  Stack,
  Switch,
  FormControlLabel,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PersonAdd as PersonAddIcon,
  WarningAmber as WarningIcon,
} from '@mui/icons-material';
import { accommodationsAPI, contractorsAPI, roomsAPI, employeesAPI } from '../services/api';
import { toast } from 'react-toastify';
import CreateContractorModal from './CreateContractorModal';

const STATUS_LABELS = {
  available: 'Szabad',
  occupied: 'Foglalt',
  maintenance: 'Karbantartás',
};

const STATUS_COLORS = {
  available: 'success',
  occupied: 'warning',
  maintenance: 'error',
};

const TYPE_LABELS = {
  studio: 'Stúdió',
  '1br': '1 szobás',
  '2br': '2 szobás',
  '3br': '3 szobás',
  dormitory: 'Munkásszálló',
};

const ROOM_TYPE_LABELS = {
  standard: 'Standard',
  premium: 'Prémium',
  shared: 'Közös',
};

// ── COST side (mig 142) ────────────────────────────────────────────────
// Konstrukció szállásonként — SOHA nem partnerenként: ugyanaz a szállásadó
// bérbe adhat egy ingatlant fix havi díjért és egy másikat éjszakánként.
const RENT_BASIS_LABELS = {
  flat: 'Tisztán bérleti díj (fix havi, egész ingatlan)',
  per_bed_night: 'Éjszakánkénti (foglalt ágy × díj)',
  mixed: 'Vegyes (fix bérleti díj + rezsi tételek)',
};
const UTILITY_LABELS = {
  viz_csatorna: 'Víz és csatorna',
  internet: 'Internet',
  aram: 'Áram',
  gaz: 'Gáz',
  kozos_koltseg: 'Közös költség',
  hulladekszallitas: 'Hulladékszállítás',
};

const initialRoomForm = {
  room_number: '',
  floor: '',
  beds: 1,
  room_type: 'standard',
  notes: '',
};

function AccommodationDetailModal({ open, onClose, accommodationId, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [accommodation, setAccommodation] = useState(null);
  const [contractorHistory, setContractorHistory] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [ownerModalOpen, setOwnerModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    type: 'studio',
    capacity: 1,
    current_contractor_id: '',
    status: 'available',
    monthly_rent: '',
    notes: '',
    // COST side (mig 142) — the rent contract belongs to the PROPERTY, not the partner.
    rent_basis: '',
    rent_amount: '',
    rent_per_bed_night: '',
  });

  // Utilities matrix (six lines, always all six — unconfigured come back with defaults)
  const [utilities, setUtilities] = useState([]);
  const [utilLoading, setUtilLoading] = useState(false);
  const [utilSaving, setUtilSaving] = useState(false);

  // View mode tab state
  const [viewTab, setViewTab] = useState(0);

  // Rooms state
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  // { room, occupant_count, occupants, message } while the delete confirmation is open.
  const [deleteRoomPrompt, setDeleteRoomPrompt] = useState(null);
  // The room we are placing someone into, plus the pool to choose from.
  const [assignTarget, setAssignTarget] = useState(null);
  const [unhoused, setUnhoused] = useState([]);
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [roomFormData, setRoomFormData] = useState({ ...initialRoomForm });
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [roomSaving, setRoomSaving] = useState(false);

  useEffect(() => {
    if (open && accommodationId) {
      loadAccommodation();
      loadContractorHistory();
      setEditing(false);
      setViewTab(0);
    }
  }, [open, accommodationId]);

  useEffect(() => {
    if (viewTab === 1 && accommodationId) {
      loadRooms();
      loadUnhoused();
    }
    if (viewTab === 2 && accommodationId) {
      loadUtilities();
    }
  }, [viewTab, accommodationId]);

  const loadUtilities = async () => {
    setUtilLoading(true);
    try {
      const r = await accommodationsAPI.getUtilities(accommodationId);
      if (r.success) setUtilities(r.data.matrix);
    } catch {
      toast.error('Rezsi-mátrix betöltési hiba');
    } finally {
      setUtilLoading(false);
    }
  };

  const handleUtilChange = (line, field, value) => {
    setUtilities((prev) => prev.map((u) => (u.line === line ? { ...u, [field]: value, configured: true } : u)));
  };

  const handleSaveUtilities = async () => {
    setUtilSaving(true);
    try {
      const r = await accommodationsAPI.updateUtilities(accommodationId, utilities.map((u) => ({
        line: u.line,
        who_pays: u.who_pays,
        contract_holder: u.contract_holder,
        passthrough: !!u.passthrough,
        passthrough_pct: u.passthrough_pct === '' ? 100 : Number(u.passthrough_pct),
      })));
      if (r.success) {
        setUtilities(r.data.matrix);
        toast.success('Rezsi-mátrix mentve');
      }
    } catch {
      toast.error('Rezsi-mátrix mentési hiba');
    } finally {
      setUtilSaving(false);
    }
  };

  const loadAccommodation = async () => {
    setLoading(true);
    try {
      const response = await accommodationsAPI.getById(accommodationId);
      if (response.success) {
        const acc = response.data.accommodation;
        setAccommodation(acc);
        setFormData({
          name: acc.name || '',
          address: acc.address || '',
          type: acc.type || 'studio',
          capacity: acc.capacity || 1,
          current_contractor_id: acc.current_contractor_id || '',
          status: acc.status || 'available',
          monthly_rent: acc.monthly_rent || '',
          rent_basis: acc.rent_basis || '',
          rent_amount: acc.rent_amount ?? '',
          rent_per_bed_night: acc.rent_per_bed_night ?? '',
          notes: acc.notes || '',
        });
      }
    } catch (error) {
      console.error('Szálláshely betöltési hiba:', error);
      toast.error('Hiba a szálláshely adatainak betöltésekor');
    } finally {
      setLoading(false);
    }
  };

  const loadContractorHistory = async () => {
    try {
      const response = await accommodationsAPI.getContractorHistory(accommodationId);
      if (response.success) {
        setContractorHistory(response.data.contractors);
      }
    } catch (error) {
      console.error('Bérlő történet betöltési hiba:', error);
    }
  };

  const loadContractors = async () => {
    try {
      const response = await contractorsAPI.getAll({ limit: 500, is_active: 'true', role: 'szallasado' });
      if (response.success) {
        setContractors(response.data.contractors);
      }
    } catch (error) {
      console.error('Alvállalkozók betöltési hiba:', error);
    }
  };

  const loadRooms = async () => {
    setRoomsLoading(true);
    try {
      const response = await roomsAPI.getByAccommodation(accommodationId);
      if (response.success) {
        setRooms(response.data.rooms);
      }
    } catch (error) {
      console.error('Szobák betöltési hiba:', error);
      toast.error('Hiba a szobák betöltésekor');
    } finally {
      setRoomsLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleEdit = () => {
    loadContractors();
    setEditing(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('A név megadása kötelező!');
      return;
    }

    const submitData = {
      ...formData,
      capacity: parseInt(formData.capacity) || 1,
      monthly_rent: formData.monthly_rent ? parseFloat(formData.monthly_rent) : null,
      current_contractor_id: formData.current_contractor_id || null,
      rent_basis: formData.rent_basis || null,
      rent_amount: formData.rent_amount === '' ? null : parseFloat(formData.rent_amount),
      rent_per_bed_night: formData.rent_per_bed_night === '' ? null : parseFloat(formData.rent_per_bed_night),
    };

    setSaving(true);
    try {
      const response = await accommodationsAPI.update(accommodationId, submitData);
      if (response.success) {
        toast.success('Szálláshely sikeresen frissítve!');
        setAccommodation(response.data.accommodation);
        setEditing(false);
        loadContractorHistory();
        onSuccess();
      }
    } catch (error) {
      console.error('Szálláshely frissítési hiba:', error);
      toast.error(error.response?.data?.message || 'Hiba a szálláshely frissítésekor');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm('Biztosan deaktiválod ezt a szálláshelyet?')) return;

    setSaving(true);
    try {
      const response = await accommodationsAPI.delete(accommodationId);
      if (response.success) {
        toast.success('Szálláshely deaktiválva!');
        onSuccess();
        onClose();
      }
    } catch (error) {
      console.error('Szálláshely deaktiválási hiba:', error);
      toast.error('Hiba a szálláshely deaktiválásakor');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setEditing(false);
    setAccommodation(null);
    setContractorHistory([]);
    setViewTab(0);
    setRooms([]);
    setShowRoomForm(false);
    setEditingRoomId(null);
    onClose();
  };

  const formatRent = (rent) => {
    if (!rent) return '-';
    return new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(rent);
  };

  // Room CRUD handlers
  const handleRoomFormChange = (field, value) => {
    setRoomFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddRoom = () => {
    setRoomFormData({ ...initialRoomForm });
    setEditingRoomId(null);
    setShowRoomForm(true);
  };

  const handleEditRoom = (room) => {
    setRoomFormData({
      room_number: room.room_number || '',
      floor: room.floor != null ? room.floor : '',
      beds: room.beds || 1,
      room_type: room.room_type || 'standard',
      notes: room.notes || '',
    });
    setEditingRoomId(room.id);
    setShowRoomForm(true);
  };

  const handleCancelRoomForm = () => {
    setShowRoomForm(false);
    setEditingRoomId(null);
    setRoomFormData({ ...initialRoomForm });
  };

  /**
   * People already at this accommodation but not yet in a room — the pool the room list
   * can place. Deliberately NOT every employee: putting someone into a room is a room
   * assignment, and moving them between sites is a different decision that belongs on
   * the employee record.
   */
  const loadUnhoused = useCallback(async () => {
    try {
      const r = await employeesAPI.getAll({ accommodation_id: accommodationId, limit: 500 });
      const list = r?.data?.employees || r?.data || [];
      setUnhoused(list.filter((e) => !e.room_id && !e.end_date));
    } catch { setUnhoused([]); }
  }, [accommodationId]);

  const handleSaveRoom = async () => {
    if (!roomFormData.room_number.toString().trim()) {
      toast.error('Szobaszám megadása kötelező!');
      return;
    }

    const submitData = {
      ...roomFormData,
      floor: roomFormData.floor !== '' ? parseInt(roomFormData.floor) : null,
      beds: parseInt(roomFormData.beds) || 1,
    };

    setRoomSaving(true);
    try {
      if (editingRoomId) {
        const response = await roomsAPI.update(accommodationId, editingRoomId, submitData);
        if (response.success) {
          toast.success('Szoba sikeresen frissítve!');
        }
      } else {
        const response = await roomsAPI.create(accommodationId, submitData);
        if (response.success) {
          toast.success('Szoba sikeresen létrehozva!');
        }
      }
      setShowRoomForm(false);
      setEditingRoomId(null);
      setRoomFormData({ ...initialRoomForm });
      loadRooms();
    } catch (error) {
      console.error('Szoba mentési hiba:', error);
      toast.error(error.response?.data?.message || 'Hiba a szoba mentésekor');
    } finally {
      setRoomSaving(false);
    }
  };

  /**
   * Delete a room.
   *
   * The server refuses with 409 + the occupant list when the room is not empty, rather
   * than un-rooming people on a click the user thought was tidying up. Only then do we
   * ask, and the confirmation names the people who would be moved — "3 lakó" is a number,
   * "Kovács Béla, Nagy Anna, Tóth Pál" is a decision.
   */
  const handleDeleteRoom = async (room) => {
    try {
      const response = await roomsAPI.delete(accommodationId, room.id);
      if (response.success) {
        toast.success(response.message || 'Szoba törölve');
        loadRooms();
      }
    } catch (error) {
      const d = error.response?.data;
      if (error.response?.status === 409 && d?.requires_confirmation) {
        setDeleteRoomPrompt({ room, ...d.data, message: d.message });
        return;
      }
      console.error('Szoba törlési hiba:', error);
      toast.error(d?.message || 'Hiba a szoba törlésekor');
    }
  };

  const confirmDeleteRoom = async () => {
    const room = deleteRoomPrompt?.room;
    if (!room) return;
    try {
      const response = await roomsAPI.deleteConfirmed(accommodationId, room.id);
      if (response.success) {
        toast.success(`${response.message} ${response.data?.unhoused_count || 0} lakó került ki a szobából.`);
        loadRooms();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba a szoba törlésekor');
    } finally {
      setDeleteRoomPrompt(null);
    }
  };

  const handleRemoveOccupant = async (roomId, employeeId) => {
    try {
      await roomsAPI.removeOccupant(accommodationId, roomId, employeeId);
      toast.success('Lakó kiköltöztetve a szobából');
      loadRooms();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba a kiköltöztetéskor');
    }
  };

  const handleAssignOccupant = async (roomId, employeeId) => {
    try {
      await roomsAPI.assignOccupant(accommodationId, roomId, employeeId);
      toast.success('Lakó beköltöztetve');
      setAssignTarget(null);
      loadRooms();
      loadUnhoused();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba a beköltöztetéskor');
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Szálláshely részletei
          </Typography>
          {accommodation && (
            <Chip
              label={STATUS_LABELS[accommodation.status] || accommodation.status}
              color={STATUS_COLORS[accommodation.status] || 'default'}
              size="small"
            />
          )}
        </Box>
      </DialogTitle>

      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : accommodation ? (
          editing ? (
            /* Edit mode */
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  required
                  label="Név / Megnevezés"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  label="Cím"
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                />
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel>Típus</InputLabel>
                  <Select
                    value={formData.type}
                    onChange={(e) => handleChange('type', e.target.value)}
                    label="Típus"
                  >
                    <MenuItem value="studio">Stúdió</MenuItem>
                    <MenuItem value="1br">1 szobás</MenuItem>
                    <MenuItem value="2br">2 szobás</MenuItem>
                    <MenuItem value="3br">3 szobás</MenuItem>
                    <MenuItem value="dormitory">Munkásszálló</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Kapacitás (fő)"
                  type="number"
                  value={formData.capacity}
                  onChange={(e) => handleChange('capacity', e.target.value)}
                  inputProps={{ min: 1 }}
                />
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel>Státusz</InputLabel>
                  <Select
                    value={formData.status}
                    onChange={(e) => handleChange('status', e.target.value)}
                    label="Státusz"
                  >
                    <MenuItem value="available">Szabad</MenuItem>
                    <MenuItem value="occupied">Foglalt</MenuItem>
                    <MenuItem value="maintenance">Karbantartás</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Havi bérleti díj (Ft) — régi mező"
                  type="number"
                  value={formData.monthly_rent}
                  onChange={(e) => handleChange('monthly_rent', e.target.value)}
                  helperText="Ha a bérleti konstrukció ki van töltve, az számít."
                />
              </Grid>

              {/* ── KÖLTSÉG OLDAL: mit fizetünk MI a szállásadónak (mig 142) ──
                  Szállásonként állítható, mert ugyanannak a tulajdonosnak több
                  ingatlana lehet eltérő szerződéssel. */}
              <Grid item xs={12}>
                <Divider sx={{ my: 1 }}>
                  <Typography variant="caption" sx={{ color: '#8B6B33', fontWeight: 600 }}>
                    KÖLTSÉG — bérleti konstrukció (amit a szállásadónak fizetünk)
                  </Typography>
                </Divider>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Bérleti konstrukció</InputLabel>
                  <Select
                    value={formData.rent_basis}
                    onChange={(e) => handleChange('rent_basis', e.target.value)}
                    label="Bérleti konstrukció"
                  >
                    <MenuItem value=""><em>Nincs beállítva</em></MenuItem>
                    {Object.entries(RENT_BASIS_LABELS).map(([v, label]) => (
                      <MenuItem key={v} value={v}>{label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              {(formData.rent_basis === 'flat' || formData.rent_basis === 'mixed' || !formData.rent_basis) && (
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Fix havi bérleti díj (Ft)"
                    type="number"
                    value={formData.rent_amount}
                    onChange={(e) => handleChange('rent_amount', e.target.value)}
                    helperText="Az EGÉSZ ingatlanra. A nap lakói között oszlik el — szobaszám nem szorozza."
                  />
                </Grid>
              )}
              {formData.rent_basis === 'per_bed_night' && (
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Díj / foglalt ágy / éj (Ft)"
                    type="number"
                    value={formData.rent_per_bed_night}
                    onChange={(e) => handleChange('rent_per_bed_night', e.target.value)}
                    helperText="Költség = foglalt ágyak × díj × éjszakák."
                  />
                </Grid>
              )}
              {formData.rent_basis === 'mixed' && (
                <Grid item xs={12}>
                  <Alert severity="info" sx={{ py: 0 }}>
                    Vegyes: a fix bérleti díj mellé a „Rezsi” fülön beállított, <b>általunk fizetett</b> tételek is költségként jelennek meg.
                  </Alert>
                </Grid>
              )}
              <Grid item xs={12}>
                <Stack direction="row" spacing={1} alignItems="stretch">
                  <FormControl fullWidth>
                    <InputLabel>Szállásadó</InputLabel>
                    <Select
                      value={formData.current_contractor_id}
                      onChange={(e) => handleChange('current_contractor_id', e.target.value)}
                      label="Szállásadó"
                    >
                      <MenuItem value="">Nincs</MenuItem>
                      {contractors.map((t) => (
                        <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={() => setOwnerModalOpen(true)}
                    sx={{ whiteSpace: 'nowrap', borderColor: '#8B6B33', color: '#8B6B33' }}
                  >
                    Új
                  </Button>
                </Stack>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  label="Megjegyzések"
                  value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                />
              </Grid>
            </Grid>
          ) : (
            /* View mode with tabs */
            <Box sx={{ mt: 1 }}>
              <Tabs
                value={viewTab}
                onChange={(_, v) => setViewTab(v)}
                sx={{
                  mb: 2,
                  '& .MuiTab-root': { fontWeight: 600 },
                  '& .Mui-selected': { color: '#8B6B33' },
                  '& .MuiTabs-indicator': { bgcolor: '#8B6B33' },
                }}
              >
                <Tab label="Részletek" />
                <Tab label="Szobák" />
                <Tab label="Költség & rezsi" />
              </Tabs>

              {viewTab === 0 && (
                <>
                  <DetailRow label="Név" value={accommodation.name} />
                  <DetailRow label="Cím" value={accommodation.address || '-'} />
                  <DetailRow label="Típus" value={TYPE_LABELS[accommodation.type] || accommodation.type} />
                  <DetailRow label="Kapacitás" value={`${accommodation.capacity} fő`} />
                  <DetailRow label="Havi bérleti díj (régi mező)" value={formatRent(accommodation.monthly_rent)} />
                  <DetailRow
                    label="Bérleti konstrukció"
                    value={accommodation.rent_basis
                      ? RENT_BASIS_LABELS[accommodation.rent_basis]
                      : 'Nincs beállítva (a régi havi díjjal számol)'}
                  />
                  {accommodation.rent_basis === 'per_bed_night' ? (
                    <DetailRow label="Díj / ágy / éj" value={formatRent(accommodation.rent_per_bed_night)} />
                  ) : (
                    <DetailRow label="Fix havi bérleti díj" value={formatRent(accommodation.rent_amount ?? accommodation.monthly_rent)} />
                  )}
                  <DetailRow label="Ingatlan tulajdonos" value={accommodation.current_contractor_name || '-'} />
                  {accommodation.current_contractor_email && (
                    <DetailRow label="Tulajdonos email" value={accommodation.current_contractor_email} />
                  )}
                  {accommodation.current_contractor_phone && (
                    <DetailRow label="Tulajdonos telefon" value={accommodation.current_contractor_phone} />
                  )}
                  <DetailRow label="Megjegyzések" value={accommodation.notes || '-'} />
                  <Divider sx={{ my: 2 }} />
                  <DetailRow
                    label="Létrehozva"
                    value={new Date(accommodation.created_at).toLocaleString('hu-HU')}
                  />
                  <DetailRow
                    label="Módosítva"
                    value={new Date(accommodation.updated_at).toLocaleString('hu-HU')}
                  />

                  {/* Contractor history */}
                  {contractorHistory.length > 0 && (
                    <Box sx={{ mt: 3 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                        Tulajdonos történet
                      </Typography>
                      <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 600 }}>Tulajdonos</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Beköltözés</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Kiköltözés</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {contractorHistory.map((h) => (
                              <TableRow key={h.id}>
                                <TableCell>{h.contractor_name}</TableCell>
                                <TableCell>
                                  {new Date(h.check_in).toLocaleDateString('hu-HU')}
                                </TableCell>
                                <TableCell>
                                  {h.check_out
                                    ? new Date(h.check_out).toLocaleDateString('hu-HU')
                                    : <Chip label="Aktív" size="small" color="success" />
                                  }
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  )}
                </>
              )}

              {viewTab === 1 && (
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      Szobák ({rooms.length})
                    </Typography>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={handleAddRoom}
                      sx={{ bgcolor: '#8B6B33', '&:hover': { bgcolor: '#6f552a' }, textTransform: 'none' }}
                    >
                      Szoba hozzáadása
                    </Button>
                  </Box>

                  {/* Room add/edit form */}
                  {showRoomForm && (
                    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
                        {editingRoomId ? 'Szoba szerkesztése' : 'Új szoba'}
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid item xs={6} sm={3}>
                          <TextField
                            fullWidth
                            required
                            size="small"
                            label="Szobaszám"
                            value={roomFormData.room_number}
                            onChange={(e) => handleRoomFormChange('room_number', e.target.value)}
                          />
                        </Grid>
                        <Grid item xs={6} sm={2}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Emelet"
                            type="number"
                            value={roomFormData.floor}
                            onChange={(e) => handleRoomFormChange('floor', e.target.value)}
                          />
                        </Grid>
                        <Grid item xs={6} sm={2}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Ágyak"
                            type="number"
                            value={roomFormData.beds}
                            onChange={(e) => handleRoomFormChange('beds', e.target.value)}
                            inputProps={{ min: 1 }}
                          />
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <FormControl fullWidth size="small">
                            <InputLabel>Típus</InputLabel>
                            <Select
                              value={roomFormData.room_type}
                              onChange={(e) => handleRoomFormChange('room_type', e.target.value)}
                              label="Típus"
                            >
                              <MenuItem value="standard">Standard</MenuItem>
                              <MenuItem value="premium">Prémium</MenuItem>
                              <MenuItem value="shared">Közös</MenuItem>
                            </Select>
                          </FormControl>
                        </Grid>
                        <Grid item xs={12} sm={8}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Megjegyzés"
                            value={roomFormData.notes}
                            onChange={(e) => handleRoomFormChange('notes', e.target.value)}
                          />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                            <Button size="small" onClick={handleCancelRoomForm} disabled={roomSaving}>
                              Mégse
                            </Button>
                            <Button
                              size="small"
                              variant="contained"
                              onClick={handleSaveRoom}
                              disabled={roomSaving}
                              sx={{ bgcolor: '#8B6B33', '&:hover': { bgcolor: '#6f552a' } }}
                            >
                              {roomSaving ? <CircularProgress size={20} /> : 'Mentés'}
                            </Button>
                          </Box>
                        </Grid>
                      </Grid>
                    </Paper>
                  )}

                  {roomsLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                      <CircularProgress size={28} />
                    </Box>
                  ) : rooms.length === 0 ? (
                    <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                      Nincsenek szobák rögzítve
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600 }}>Szobaszám</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Emelet</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Ágyak</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Típus</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Lakók</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Foglaltság</TableCell>
                            <TableCell sx={{ fontWeight: 600 }} align="right">Műveletek</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {rooms.map((room) => {
                            const occupancyPct = room.beds > 0 ? Math.round((room.occupied_beds / room.beds) * 100) : 0;
                            const occupancyColor = occupancyPct >= 100 ? '#ef4444' : occupancyPct > 0 ? '#06b6d4' : '#10b981';
                            return (
                              <TableRow key={room.id} hover>
                                <TableCell sx={{ fontWeight: 500 }}>{room.room_number}</TableCell>
                                <TableCell>{room.floor != null ? room.floor : '-'}</TableCell>
                                <TableCell>{room.occupied_beds}/{room.beds}</TableCell>
                                <TableCell>{ROOM_TYPE_LABELS[room.room_type] || room.room_type}</TableCell>
                                <TableCell>
                                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                                    {room.occupants.map((o) => (
                                      <Chip
                                        key={o.id} size="small" label={o.name}
                                        onDelete={() => handleRemoveOccupant(room.id, o.id)}
                                        title="Kiköltöztetés ebből a szobából"
                                      />
                                    ))}
                                    {room.occupants.length === 0 && (
                                      <Typography variant="body2" color="text.secondary">-</Typography>
                                    )}
                                    {/* The gap a tester hit: rooms could be created here but
                                        filled only from the Employees page. */}
                                    {room.free_beds > 0 && (
                                      <Button
                                        size="small" startIcon={<PersonAddIcon />}
                                        onClick={() => setAssignTarget(room)}
                                        sx={{ textTransform: 'none', minWidth: 0 }}
                                      >
                                        Beköltöztetés
                                      </Button>
                                    )}
                                  </Box>
                                </TableCell>
                                <TableCell>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 100 }}>
                                    <LinearProgress
                                      variant="determinate"
                                      value={Math.min(occupancyPct, 100)}
                                      sx={{
                                        flex: 1,
                                        height: 8,
                                        borderRadius: 4,
                                        bgcolor: '#e5e7eb',
                                        '& .MuiLinearProgress-bar': { bgcolor: occupancyColor, borderRadius: 4 },
                                      }}
                                    />
                                    <Typography variant="caption" sx={{ fontWeight: 600, minWidth: 30 }}>
                                      {occupancyPct}%
                                    </Typography>
                                  </Box>
                                </TableCell>
                                <TableCell align="right">
                                  <IconButton size="small" onClick={() => handleEditRoom(room)}>
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                  <IconButton size="small" color="error" onClick={() => handleDeleteRoom(room)}>
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              )}

              {/* ── KÖLTSÉG & REZSI (mig 142) ──────────────────────────────
                  Hat rezsi sor, soronként négy FÜGGETLEN kérdés: ki fizeti,
                  kinek a nevén fut a szerződés, továbbszámlázzuk-e a
                  megbízónak, és milyen arányban. Amit MI fizetünk → költség;
                  amit továbbszámlázunk → bevétel sor (100%-on nulla margin). */}
              {viewTab === 2 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                    Bérleti konstrukció
                  </Typography>
                  <Alert severity={accommodation.rent_basis ? 'success' : 'warning'} sx={{ mb: 2 }}>
                    {accommodation.rent_basis
                      ? RENT_BASIS_LABELS[accommodation.rent_basis]
                      : 'Nincs beállítva — a motor a régi havi bérleti díjjal számol. Állítsd be a „Szerkesztés” gombbal.'}
                    {accommodation.rent_basis === 'per_bed_night'
                      ? ` · ${formatRent(accommodation.rent_per_bed_night)} / ágy / éj`
                      : ` · ${formatRent(accommodation.rent_amount ?? accommodation.monthly_rent)} / hó`}
                  </Alert>

                  <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                    Rezsi-mátrix
                  </Typography>
                  {utilLoading ? (
                    <LinearProgress />
                  ) : (
                    <>
                      <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Tétel</TableCell>
                              <TableCell>Ki fizeti</TableCell>
                              <TableCell>Szerződés kinek a nevén</TableCell>
                              <TableCell align="center">Továbbszámlázva</TableCell>
                              <TableCell align="right">Arány (%)</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {utilities.map((u) => (
                              <TableRow key={u.line} sx={{ bgcolor: u.configured ? 'inherit' : 'rgba(255,193,7,0.08)' }}>
                                <TableCell>
                                  {UTILITY_LABELS[u.line] || u.line}
                                  {!u.configured && (
                                    <Chip label="nincs beállítva" size="small" sx={{ ml: 1 }} color="warning" variant="outlined" />
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Select
                                    size="small"
                                    value={u.who_pays}
                                    onChange={(e) => handleUtilChange(u.line, 'who_pays', e.target.value)}
                                    sx={{ minWidth: 120 }}
                                  >
                                    <MenuItem value="mi">Mi</MenuItem>
                                    <MenuItem value="szallasado">Szállásadó</MenuItem>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Select
                                    size="small"
                                    value={u.contract_holder}
                                    onChange={(e) => handleUtilChange(u.line, 'contract_holder', e.target.value)}
                                    sx={{ minWidth: 120 }}
                                  >
                                    <MenuItem value="mi">Mi</MenuItem>
                                    <MenuItem value="szallasado">Szállásadó</MenuItem>
                                  </Select>
                                </TableCell>
                                <TableCell align="center">
                                  <Switch
                                    checked={!!u.passthrough}
                                    onChange={(e) => handleUtilChange(u.line, 'passthrough', e.target.checked)}
                                  />
                                </TableCell>
                                <TableCell align="right">
                                  <TextField
                                    size="small"
                                    type="number"
                                    value={u.passthrough_pct}
                                    disabled={!u.passthrough}
                                    onChange={(e) => handleUtilChange(u.line, 'passthrough_pct', e.target.value)}
                                    inputProps={{ min: 0, max: 100, style: { textAlign: 'right' } }}
                                    sx={{ width: 90 }}
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                      <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
                        Amit <b>mi</b> fizetünk, az költségként jelenik meg a profit nézetben. Amit
                        <b> továbbszámlázunk</b>, az a rögzített összeg × arány mértékében bevétel sor a
                        megbízó felé — 100%-on margin-semleges.
                      </Typography>
                      <Box sx={{ mt: 2, textAlign: 'right' }}>
                        <Button
                          variant="contained"
                          onClick={handleSaveUtilities}
                          disabled={utilSaving}
                          sx={{ bgcolor: '#8B6B33', '&:hover': { bgcolor: '#6F5529' } }}
                        >
                          {utilSaving ? 'Mentés…' : 'Rezsi-mátrix mentése'}
                        </Button>
                      </Box>
                    </>
                  )}
                </Box>
              )}
            </Box>
          )
        ) : null}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {editing ? (
          <>
            <Button onClick={() => setEditing(false)} disabled={saving}>
              Mégse
            </Button>
            <Button
              onClick={handleSave}
              variant="contained"
              disabled={saving}
              sx={{ bgcolor: '#8B6B33', '&:hover': { bgcolor: '#6f552a' } }}
            >
              {saving ? <CircularProgress size={24} /> : 'Mentés'}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={handleClose}>Bezárás</Button>
            {accommodation?.is_active && (
              <>
                <Button
                  onClick={handleDeactivate}
                  color="error"
                  disabled={saving}
                >
                  Deaktiválás
                </Button>
                <Button
                  onClick={handleEdit}
                  variant="contained"
                  sx={{ bgcolor: '#8B6B33', '&:hover': { bgcolor: '#6f552a' } }}
                >
                  Szerkesztés
                </Button>
              </>
            )}
          </>
        )}
      </DialogActions>

      {/* Un-rooming people is a housing change that feeds billing and consolidation, so
          the confirmation names who moves rather than just counting them. */}
      <Dialog open={!!deleteRoomPrompt} onClose={() => setDeleteRoomPrompt(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon color="warning" /> Szoba törlése
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            A(z) <strong>{deleteRoomPrompt?.room_number}</strong> szobában{' '}
            <strong>{deleteRoomPrompt?.occupant_count} lakó</strong> van. Törlés esetén kikerülnek
            a szobából — a szálláshelyen maradnak, de szoba nélkül.
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
            {(deleteRoomPrompt?.occupants || []).map((o) => (
              <Chip key={o.id} size="small" label={o.name} />
            ))}
          </Box>
          <Typography variant="caption" color="text.secondary">
            A változás bekerül a szállás-előzményekbe.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteRoomPrompt(null)}>Mégse</Button>
          <Button color="error" variant="contained" onClick={confirmDeleteRoom}>
            Törlés, {deleteRoomPrompt?.occupant_count} lakó kiköltöztetése
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!assignTarget} onClose={() => setAssignTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Beköltöztetés — {assignTarget?.room_number}. szoba</DialogTitle>
        <DialogContent>
          {unhoused.length === 0 ? (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Ezen a szálláshelyen nincs szoba nélküli lakó.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Sok embert egyszerre a <strong>Szoba-sablon</strong> Excel-importtal lehet
                elhelyezni (Munkavállalók → Import), egyesével pedig a munkavállaló adatlapján.
              </Typography>
            </Box>
          ) : (
            <>
              <Typography variant="caption" color="text.secondary">
                Szabad ágyak: {assignTarget?.free_beds}. Csak azok szerepelnek, akik már ezen a
                szálláshelyen vannak, de nincsenek szobában.
              </Typography>
              <List dense>
                {unhoused.map((e) => (
                  <ListItem key={e.id} disablePadding>
                    <ListItemButton onClick={() => handleAssignOccupant(assignTarget.id, e.id)}>
                      <ListItemText
                        primary={`${e.last_name || ''} ${e.first_name || ''}`.trim()}
                        secondary={e.employee_number || null}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignTarget(null)}>Bezárás</Button>
        </DialogActions>
      </Dialog>

      <CreateContractorModal
        open={ownerModalOpen}
        onClose={() => setOwnerModalOpen(false)}
        onSuccess={async (created) => {
          await loadContractors();
          if (created?.id) {
            handleChange('current_contractor_id', created.id);
          }
        }}
        defaultType="property_owner"
        defaultRoles={['szallasado']}
        lockType
      />
    </Dialog>
  );
}

function DetailRow({ label, value }) {
  return (
    <Box sx={{ display: 'flex', py: 0.75 }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 160, fontWeight: 500 }}>
        {label}:
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Box>
  );
}

export default AccommodationDetailModal;
