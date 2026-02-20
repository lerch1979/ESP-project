import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
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
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { accommodationsAPI, contractorsAPI, roomsAPI } from '../services/api';
import { toast } from 'react-toastify';

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
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    type: 'studio',
    capacity: 1,
    current_contractor_id: '',
    status: 'available',
    monthly_rent: '',
    notes: '',
  });

  // View mode tab state
  const [viewTab, setViewTab] = useState(0);

  // Rooms state
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
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
    }
  }, [viewTab, accommodationId]);

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
      const response = await contractorsAPI.getAll({ limit: 500, is_active: 'true' });
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

  const handleDeleteRoom = async (roomId) => {
    if (!window.confirm('Biztosan törölöd ezt a szobát? A lakók szoba-hozzárendelése megszűnik.')) return;

    try {
      const response = await roomsAPI.delete(accommodationId, roomId);
      if (response.success) {
        toast.success('Szoba deaktiválva!');
        loadRooms();
      }
    } catch (error) {
      console.error('Szoba törlési hiba:', error);
      toast.error('Hiba a szoba törlésekor');
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
                  label="Havi bérleti díj (Ft)"
                  type="number"
                  value={formData.monthly_rent}
                  onChange={(e) => handleChange('monthly_rent', e.target.value)}
                />
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Jelenlegi alvállalkozó</InputLabel>
                  <Select
                    value={formData.current_contractor_id}
                    onChange={(e) => handleChange('current_contractor_id', e.target.value)}
                    label="Jelenlegi alvállalkozó"
                  >
                    <MenuItem value="">Nincs</MenuItem>
                    {contractors.map((t) => (
                      <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
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
                  '& .Mui-selected': { color: '#2563eb' },
                  '& .MuiTabs-indicator': { bgcolor: '#2563eb' },
                }}
              >
                <Tab label="Részletek" />
                <Tab label="Szobák" />
              </Tabs>

              {viewTab === 0 && (
                <>
                  <DetailRow label="Név" value={accommodation.name} />
                  <DetailRow label="Cím" value={accommodation.address || '-'} />
                  <DetailRow label="Típus" value={TYPE_LABELS[accommodation.type] || accommodation.type} />
                  <DetailRow label="Kapacitás" value={`${accommodation.capacity} fő`} />
                  <DetailRow label="Havi bérleti díj" value={formatRent(accommodation.monthly_rent)} />
                  <DetailRow label="Jelenlegi alvállalkozó" value={accommodation.current_contractor_name || '-'} />
                  {accommodation.current_contractor_email && (
                    <DetailRow label="Alvállalkozó email" value={accommodation.current_contractor_email} />
                  )}
                  {accommodation.current_contractor_phone && (
                    <DetailRow label="Alvállalkozó telefon" value={accommodation.current_contractor_phone} />
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
                        Alvállalkozó történet
                      </Typography>
                      <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 600 }}>Alvállalkozó</TableCell>
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
                      sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' }, textTransform: 'none' }}
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
                              sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
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
                                  {room.occupants.length > 0
                                    ? room.occupants.map(o => o.name).join(', ')
                                    : <Typography variant="body2" color="text.secondary">-</Typography>
                                  }
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
                                  <IconButton size="small" color="error" onClick={() => handleDeleteRoom(room.id)}>
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
              sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
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
                  sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
                >
                  Szerkesztés
                </Button>
              </>
            )}
          </>
        )}
      </DialogActions>
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
