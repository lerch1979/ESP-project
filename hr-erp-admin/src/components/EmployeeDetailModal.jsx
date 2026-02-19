import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Avatar,
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
  Tabs,
  Tab,
  FormGroup,
  FormControlLabel,
  Checkbox,
  IconButton,
  Tooltip,
  Collapse,
} from '@mui/material';
import {
  Timeline as TimelineIcon,
  Person as PersonIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  FilterList as FilterIcon,
  Login as CheckInIcon,
  Logout as CheckOutIcon,
  Assignment as TicketIcon,
  Email as EmailIcon,
  Work as ShiftIcon,
  LocalHospital as MedicalIcon,
  Event as PersonalEventIcon,
  Note as NoteIcon,
  Description as ContractIcon,
  CardTravel as VisaIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CameraAlt as CameraAltIcon,
  CloudUpload as UploadIcon,
} from '@mui/icons-material';
import Zoom from 'react-medium-image-zoom';
import 'react-medium-image-zoom/dist/styles.css';
import { employeesAPI, accommodationsAPI, roomsAPI, UPLOADS_BASE_URL } from '../services/api';
import { toast } from 'react-toastify';

const GENDER_LABELS = { male: 'Férfi', female: 'Nő', other: 'Egyéb' };
const MARITAL_LABELS = { single: 'Egyedülálló', married: 'Házas', divorced: 'Elvált', widowed: 'Özvegy' };

function fmtDate(val) {
  if (!val) return '-';
  return new Date(val).toLocaleDateString('hu-HU');
}

function splitDate(val) {
  if (!val) return '';
  return val.split('T')[0];
}

// Timeline event type configuration
const EVENT_TYPE_CONFIG = {
  checkin: { label: 'Bejelentkezés', color: '#16a34a', icon: CheckInIcon },
  checkout: { label: 'Kijelentkezés', color: '#dc2626', icon: CheckOutIcon },
  contract_start: { label: 'Szerződés kezdete', color: '#2563eb', icon: ContractIcon },
  contract_end: { label: 'Szerződés vége', color: '#7c3aed', icon: ContractIcon },
  visa_expiry: { label: 'Vízum lejárat', color: '#ea580c', icon: VisaIcon },
  ticket: { label: 'Jegy/Hibajegy', color: '#0891b2', icon: TicketIcon },
  email: { label: 'Email', color: '#6366f1', icon: EmailIcon },
  shift: { label: 'Műszak', color: '#06b6d4', icon: ShiftIcon },
  medical_appointment: { label: 'Orvosi vizsgálat', color: '#ec4899', icon: MedicalIcon },
  personal_event: { label: 'Személyes esemény', color: '#8b5cf6', icon: PersonalEventIcon },
  note: { label: 'Jegyzet', color: '#f59e0b', icon: NoteIcon },
};

const NOTE_TYPE_OPTIONS = [
  { value: 'general', label: 'Általános' },
  { value: 'warning', label: 'Figyelmeztetés' },
  { value: 'positive', label: 'Pozitív' },
  { value: 'document', label: 'Dokumentum' },
];

const NOTE_TYPE_COLORS = {
  general: '#64748b',
  warning: '#f59e0b',
  positive: '#16a34a',
  document: '#2563eb',
};

function EmployeeDetailModal({ open, onClose, employeeId, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [employee, setEmployee] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [accommodations, setAccommodations] = useState([]);
  const [formData, setFormData] = useState({});

  // Tab state
  const [activeTab, setActiveTab] = useState(0);

  // Timeline state
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState(
    Object.keys(EVENT_TYPE_CONFIG).reduce((acc, key) => ({ ...acc, [key]: true }), {})
  );

  // Photo state
  const [photoUploading, setPhotoUploading] = useState(false);

  // Add note state
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteData, setNoteData] = useState({ note_type: 'general', title: '', content: '' });
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  useEffect(() => {
    if (open && employeeId) {
      loadEmployee();
      setEditing(false);
      setActiveTab(0);
    }
  }, [open, employeeId]);

  useEffect(() => {
    if (activeTab === 1 && employeeId) {
      loadTimeline();
    }
  }, [activeTab, employeeId]);

  const loadEmployee = async () => {
    setLoading(true);
    try {
      const response = await employeesAPI.getById(employeeId);
      if (response.success) {
        const emp = response.data.employee;
        setEmployee(emp);
        setFormData({
          employee_number: emp.employee_number || '',
          position: emp.position || '',
          workplace: emp.workplace || '',
          start_date: splitDate(emp.start_date),
          end_date: splitDate(emp.end_date),
          arrival_date: splitDate(emp.arrival_date),
          status_id: emp.status_id || '',
          accommodation_id: emp.accommodation_id || '',
          room_id: emp.room_id || '',
          room_number: emp.room_number || '',
          notes: emp.notes || '',
          first_name: emp.first_name || '',
          last_name: emp.last_name || '',
          gender: emp.gender || '',
          birth_date: splitDate(emp.birth_date),
          birth_place: emp.birth_place || '',
          mothers_name: emp.mothers_name || '',
          marital_status: emp.marital_status || '',
          tax_id: emp.tax_id || '',
          passport_number: emp.passport_number || '',
          social_security_number: emp.social_security_number || '',
          visa_expiry: splitDate(emp.visa_expiry),
          bank_account: emp.bank_account || '',
          permanent_address_zip: emp.permanent_address_zip || '',
          permanent_address_country: emp.permanent_address_country || '',
          permanent_address_county: emp.permanent_address_county || '',
          permanent_address_city: emp.permanent_address_city || '',
          permanent_address_street: emp.permanent_address_street || '',
          permanent_address_number: emp.permanent_address_number || '',
          company_name: emp.company_name || '',
          company_email: emp.company_email || '',
          company_phone: emp.company_phone || '',
        });
      }
    } catch (error) {
      console.error('Munkavállaló betöltési hiba:', error);
      toast.error('Hiba a munkavállaló adatainak betöltésekor');
    } finally {
      setLoading(false);
    }
  };

  const loadTimeline = useCallback(async () => {
    setTimelineLoading(true);
    try {
      const enabledTypes = Object.entries(activeFilters)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(',');
      const response = await employeesAPI.getTimeline(employeeId, { types: enabledTypes });
      if (response.success) {
        setTimelineEvents(response.data.timeline || []);
      }
    } catch (error) {
      console.error('Idővonal betöltési hiba:', error);
      toast.error('Hiba az idővonal betöltésekor');
    } finally {
      setTimelineLoading(false);
    }
  }, [employeeId, activeFilters]);

  useEffect(() => {
    if (activeTab === 1 && employeeId) {
      loadTimeline();
    }
  }, [activeFilters]);

  const loadDropdowns = async () => {
    try {
      const [statusRes, accRes] = await Promise.all([
        employeesAPI.getStatuses(),
        accommodationsAPI.getAll({ limit: 500 }),
      ]);
      if (statusRes.success) setStatuses(statusRes.data.statuses);
      if (accRes.success) setAccommodations(accRes.data.accommodations);
    } catch (error) {
      console.error('Dropdown betöltési hiba:', error);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleEdit = () => {
    loadDropdowns();
    setEditing(true);
  };

  const handleSave = async () => {
    const submitData = {
      ...formData,
      accommodation_id: formData.accommodation_id || null,
      status_id: formData.status_id || null,
    };

    setSaving(true);
    try {
      const response = await employeesAPI.update(employeeId, submitData);
      if (response.success) {
        toast.success('Munkavállaló sikeresen frissítve!');
        setEditing(false);
        loadEmployee();
        onSuccess();
      }
    } catch (error) {
      console.error('Munkavállaló frissítési hiba:', error);
      toast.error(error.response?.data?.message || 'Hiba a munkavállaló frissítésekor');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm('Biztosan deaktiválod ezt a munkavállalót?')) return;

    setSaving(true);
    try {
      const response = await employeesAPI.delete(employeeId);
      if (response.success) {
        toast.success('Munkavállaló deaktiválva!');
        onSuccess();
        onClose();
      }
    } catch (error) {
      console.error('Munkavállaló deaktiválási hiba:', error);
      toast.error('Hiba a munkavállaló deaktiválásakor');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setEditing(false);
    setEmployee(null);
    setActiveTab(0);
    setShowNoteForm(false);
    setNoteData({ note_type: 'general', title: '', content: '' });
    onClose();
  };

  const handleFilterToggle = (type) => {
    setActiveFilters(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const handleAddNote = async () => {
    if (!noteData.title.trim()) {
      toast.error('A cím megadása kötelező');
      return;
    }
    setNoteSubmitting(true);
    try {
      const response = await employeesAPI.createNote(employeeId, noteData);
      if (response.success) {
        toast.success('Jegyzet sikeresen hozzáadva!');
        setShowNoteForm(false);
        setNoteData({ note_type: 'general', title: '', content: '' });
        loadTimeline();
      }
    } catch (error) {
      console.error('Jegyzet hozzáadási hiba:', error);
      toast.error(error.response?.data?.message || 'Hiba a jegyzet hozzáadásakor');
    } finally {
      setNoteSubmitting(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm('Biztosan törlöd ezt a jegyzetet?')) return;
    try {
      const response = await employeesAPI.deleteNote(employeeId, noteId);
      if (response.success) {
        toast.success('Jegyzet törölve!');
        loadTimeline();
      }
    } catch (error) {
      console.error('Jegyzet törlési hiba:', error);
      toast.error('Hiba a jegyzet törlésekor');
    }
  };

  const handlePhotoUpload = async (file) => {
    setPhotoUploading(true);
    try {
      const response = await employeesAPI.uploadPhoto(employeeId, file);
      if (response.success) {
        toast.success('Profilkép feltöltve!');
        loadEmployee();
        onSuccess();
      }
    } catch (error) {
      console.error('Profilkép feltöltési hiba:', error);
      toast.error(error.response?.data?.message || 'Hiba a profilkép feltöltésekor');
    } finally {
      setPhotoUploading(false);
    }
  };

  const handlePhotoDelete = async () => {
    if (!window.confirm('Biztosan törlöd a profilképet?')) return;
    setPhotoUploading(true);
    try {
      const response = await employeesAPI.deletePhoto(employeeId);
      if (response.success) {
        toast.success('Profilkép törölve!');
        loadEmployee();
        onSuccess();
      }
    } catch (error) {
      console.error('Profilkép törlési hiba:', error);
      toast.error('Hiba a profilkép törlésekor');
    } finally {
      setPhotoUploading(false);
    }
  };

  const buildAddress = () => {
    const parts = [
      employee.permanent_address_zip,
      employee.permanent_address_country,
      employee.permanent_address_county,
      employee.permanent_address_city,
      employee.permanent_address_street,
      employee.permanent_address_number,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : '-';
  };

  // Group timeline events by date
  const groupedEvents = timelineEvents.reduce((groups, event) => {
    const date = event.event_date ? event.event_date.split('T')[0] : 'unknown';
    if (!groups[date]) groups[date] = [];
    groups[date].push(event);
    return groups;
  }, {});

  const sortedDates = Object.keys(groupedEvents).sort((a, b) => b.localeCompare(a));

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Munkavállaló részletei
          </Typography>
          {employee && employee.status_name && (
            <Chip
              label={employee.status_name}
              size="small"
              sx={{
                bgcolor: employee.status_color ? `${employee.status_color}20` : undefined,
                color: employee.status_color || undefined,
                fontWeight: 600,
              }}
            />
          )}
        </Box>

        {/* Tabs */}
        {employee && !editing && (
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            sx={{
              mt: 1,
              '& .MuiTab-root': { textTransform: 'none', fontWeight: 600 },
              '& .Mui-selected': { color: '#2c5f2d' },
              '& .MuiTabs-indicator': { backgroundColor: '#2c5f2d' },
            }}
          >
            <Tab icon={<PersonIcon />} iconPosition="start" label="Adatok" />
            <Tab icon={<TimelineIcon />} iconPosition="start" label="Idővonal" />
          </Tabs>
        )}
      </DialogTitle>

      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : employee ? (
          editing ? (
            /* Edit mode */
            <EditForm
              formData={formData}
              handleChange={handleChange}
              statuses={statuses}
              accommodations={accommodations}
              employee={employee}
              onPhotoUpload={handlePhotoUpload}
              onPhotoDelete={handlePhotoDelete}
              photoUploading={photoUploading}
            />
          ) : activeTab === 0 ? (
            /* View mode - Adatok tab */
            <ViewDetails
              employee={employee}
              buildAddress={buildAddress}
              onPhotoUpload={handlePhotoUpload}
              onPhotoDelete={handlePhotoDelete}
              photoUploading={photoUploading}
            />
          ) : (
            /* Idővonal tab */
            <Box sx={{ mt: 1 }}>
              {/* Timeline toolbar */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    variant={showFilters ? 'contained' : 'outlined'}
                    startIcon={<FilterIcon />}
                    onClick={() => setShowFilters(!showFilters)}
                    sx={{
                      ...(showFilters
                        ? { bgcolor: '#2c5f2d', '&:hover': { bgcolor: '#234d24' } }
                        : { color: '#2c5f2d', borderColor: '#2c5f2d' }),
                    }}
                  >
                    Szűrők
                  </Button>
                </Box>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setShowNoteForm(!showNoteForm)}
                  sx={{ bgcolor: '#f59e0b', '&:hover': { bgcolor: '#d97706' } }}
                >
                  Jegyzet hozzáadása
                </Button>
              </Box>

              {/* Filter checkboxes */}
              <Collapse in={showFilters}>
                <Box sx={{ p: 2, mb: 2, bgcolor: '#f8faf8', borderRadius: 1, border: '1px solid #e5e7eb' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                    Esemény típusok szűrése
                  </Typography>
                  <FormGroup row>
                    {Object.entries(EVENT_TYPE_CONFIG).map(([key, config]) => (
                      <FormControlLabel
                        key={key}
                        control={
                          <Checkbox
                            checked={activeFilters[key]}
                            onChange={() => handleFilterToggle(key)}
                            size="small"
                            sx={{ color: config.color, '&.Mui-checked': { color: config.color } }}
                          />
                        }
                        label={
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            {config.label}
                          </Typography>
                        }
                        sx={{ mr: 1.5 }}
                      />
                    ))}
                  </FormGroup>
                </Box>
              </Collapse>

              {/* Add note form */}
              <Collapse in={showNoteForm}>
                <Box sx={{ p: 2, mb: 2, bgcolor: '#fffbeb', borderRadius: 1, border: '1px solid #fbbf24' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
                    Új jegyzet hozzáadása
                  </Typography>
                  <Grid container spacing={1.5}>
                    <Grid item xs={12} sm={4}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Típus</InputLabel>
                        <Select
                          value={noteData.note_type}
                          onChange={(e) => setNoteData(prev => ({ ...prev, note_type: e.target.value }))}
                          label="Típus"
                        >
                          {NOTE_TYPE_OPTIONS.map(opt => (
                            <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={8}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Cím *"
                        value={noteData.title}
                        onChange={(e) => setNoteData(prev => ({ ...prev, title: e.target.value }))}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Tartalom"
                        multiline
                        rows={2}
                        value={noteData.content}
                        onChange={(e) => setNoteData(prev => ({ ...prev, content: e.target.value }))}
                      />
                    </Grid>
                    <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                      <Button
                        size="small"
                        onClick={() => {
                          setShowNoteForm(false);
                          setNoteData({ note_type: 'general', title: '', content: '' });
                        }}
                      >
                        Mégse
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={handleAddNote}
                        disabled={noteSubmitting || !noteData.title.trim()}
                        sx={{ bgcolor: '#f59e0b', '&:hover': { bgcolor: '#d97706' } }}
                      >
                        {noteSubmitting ? <CircularProgress size={18} /> : 'Mentés'}
                      </Button>
                    </Grid>
                  </Grid>
                </Box>
              </Collapse>

              {/* Timeline content */}
              {timelineLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                  <CircularProgress />
                </Box>
              ) : timelineEvents.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                  <TimelineIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
                  <Typography>Nincs megjeleníthető esemény</Typography>
                </Box>
              ) : (
                <Box sx={{ position: 'relative', pl: 3 }}>
                  {/* Vertical timeline line */}
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 11,
                      top: 0,
                      bottom: 0,
                      width: 2,
                      bgcolor: '#e5e7eb',
                    }}
                  />

                  {sortedDates.map((date) => (
                    <Box key={date} sx={{ mb: 2 }}>
                      {/* Date header */}
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, position: 'relative' }}>
                        <Box
                          sx={{
                            position: 'absolute',
                            left: -19,
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            bgcolor: '#2c5f2d',
                            border: '2px solid white',
                            boxShadow: '0 0 0 2px #2c5f2d',
                          }}
                        />
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#2c5f2d' }}>
                          {new Date(date + 'T00:00:00').toLocaleDateString('hu-HU', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            weekday: 'long',
                          })}
                        </Typography>
                      </Box>

                      {/* Events for this date */}
                      {groupedEvents[date].map((event, idx) => {
                        const config = EVENT_TYPE_CONFIG[event.type] || {
                          label: event.type,
                          color: '#64748b',
                          icon: NoteIcon,
                        };
                        const IconComp = config.icon;

                        return (
                          <Box
                            key={`${event.type}-${idx}`}
                            sx={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              mb: 1,
                              ml: 1,
                              p: 1.5,
                              borderRadius: 1,
                              bgcolor: `${config.color}08`,
                              border: `1px solid ${config.color}25`,
                              position: 'relative',
                              '&:hover': { bgcolor: `${config.color}12` },
                            }}
                          >
                            {/* Event icon */}
                            <Box
                              sx={{
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                bgcolor: `${config.color}20`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                mr: 1.5,
                                flexShrink: 0,
                              }}
                            >
                              <IconComp sx={{ fontSize: 16, color: config.color }} />
                            </Box>

                            {/* Event content */}
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                                <Chip
                                  label={config.label}
                                  size="small"
                                  sx={{
                                    height: 20,
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    bgcolor: `${config.color}20`,
                                    color: config.color,
                                  }}
                                />
                                {event.status && (
                                  <Chip
                                    label={event.status}
                                    size="small"
                                    variant="outlined"
                                    sx={{ height: 20, fontSize: '0.65rem' }}
                                  />
                                )}
                                {event.type === 'note' && event.metadata?.note_type && (
                                  <Chip
                                    label={NOTE_TYPE_OPTIONS.find(o => o.value === event.metadata.note_type)?.label || event.metadata.note_type}
                                    size="small"
                                    sx={{
                                      height: 20,
                                      fontSize: '0.65rem',
                                      fontWeight: 600,
                                      bgcolor: `${NOTE_TYPE_COLORS[event.metadata.note_type] || '#64748b'}20`,
                                      color: NOTE_TYPE_COLORS[event.metadata.note_type] || '#64748b',
                                    }}
                                  />
                                )}
                              </Box>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {event.title}
                              </Typography>
                              {event.description && (
                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', mt: 0.25 }}>
                                  {event.description}
                                </Typography>
                              )}
                              {event.metadata?.created_by_name && (
                                <Typography variant="caption" color="text.secondary">
                                  Hozzáadta: {event.metadata.created_by_name}
                                </Typography>
                              )}
                            </Box>

                            {/* Delete button for notes */}
                            {event.type === 'note' && event.metadata?.note_id && (
                              <Tooltip title="Jegyzet törlése">
                                <IconButton
                                  size="small"
                                  onClick={() => handleDeleteNote(event.metadata.note_id)}
                                  sx={{ color: '#ef4444', opacity: 0.6, '&:hover': { opacity: 1 } }}
                                >
                                  <DeleteIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        );
                      })}
                    </Box>
                  ))}
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
              sx={{ bgcolor: '#2c5f2d', '&:hover': { bgcolor: '#234d24' } }}
            >
              {saving ? <CircularProgress size={24} /> : 'Mentés'}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={handleClose}>Bezárás</Button>
            {employee && !employee.end_date && activeTab === 0 && (
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
                  sx={{ bgcolor: '#2c5f2d', '&:hover': { bgcolor: '#234d24' } }}
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

/* ---- Sub-components ---- */

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

function ViewDetails({ employee, buildAddress, onPhotoUpload, onPhotoDelete, photoUploading }) {
  const photoInputRef = React.useRef(null);

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onPhotoUpload(file);
    }
    e.target.value = '';
  };

  return (
    <Box sx={{ mt: 1 }}>
      {/* Profile Photo */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
        {employee.profile_photo_url ? (
          <Zoom>
            <Avatar
              src={`${UPLOADS_BASE_URL}${employee.profile_photo_url}`}
              sx={{ width: 150, height: 150, mb: 1, cursor: 'zoom-in' }}
            />
          </Zoom>
        ) : (
          <Avatar sx={{ width: 150, height: 150, mb: 1, bgcolor: '#2c5f2d', fontSize: '3rem' }}>
            {(employee.last_name?.[0] || '') + (employee.first_name?.[0] || '')}
          </Avatar>
        )}
        <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
          <input
            type="file"
            ref={photoInputRef}
            hidden
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePhotoSelect}
          />
          <Button
            size="small"
            variant="outlined"
            startIcon={photoUploading ? <CircularProgress size={16} /> : <UploadIcon />}
            disabled={photoUploading}
            onClick={() => photoInputRef.current?.click()}
            sx={{ color: '#2c5f2d', borderColor: '#2c5f2d', textTransform: 'none' }}
          >
            {employee.profile_photo_url ? 'Kép cseréje' : 'Kép feltöltése'}
          </Button>
          {employee.profile_photo_url && (
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              disabled={photoUploading}
              onClick={onPhotoDelete}
              sx={{ textTransform: 'none' }}
            >
              Törlés
            </Button>
          )}
        </Box>
      </Box>

      {/* 1. Személyes adatok */}
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 1 }}>Személyes adatok</Typography>
      <Divider sx={{ mb: 1 }} />
      <DetailRow label="Név" value={
        employee.last_name && employee.first_name
          ? `${employee.last_name} ${employee.first_name}`
          : '-'
      } />
      <DetailRow label="Nem" value={GENDER_LABELS[employee.gender] || '-'} />
      <DetailRow label="Születési dátum" value={fmtDate(employee.birth_date)} />
      <DetailRow label="Születési hely" value={employee.birth_place || '-'} />
      <DetailRow label="Anyja neve" value={employee.mothers_name || '-'} />
      <DetailRow label="Családi állapot" value={MARITAL_LABELS[employee.marital_status] || '-'} />

      {/* 2. Okmányok */}
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 2 }}>Okmányok</Typography>
      <Divider sx={{ mb: 1 }} />
      <DetailRow label="Adóazonosító" value={employee.tax_id || '-'} />
      <DetailRow label="Útlevélszám" value={employee.passport_number || '-'} />
      <DetailRow label="TAJ szám" value={employee.social_security_number || '-'} />
      <DetailRow label="Vízum lejárat" value={fmtDate(employee.visa_expiry)} />

      {/* 3. Munka adatok */}
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 2 }}>Munka adatok</Typography>
      <Divider sx={{ mb: 1 }} />
      <DetailRow label="Törzsszám" value={employee.employee_number || '-'} />
      <DetailRow label="Munkakör" value={employee.position || '-'} />
      <DetailRow label="Munkahely" value={employee.workplace || '-'} />
      <DetailRow label="Email" value={employee.email || '-'} />
      <DetailRow label="Telefon" value={employee.phone || '-'} />
      <DetailRow label="Érkezés dátuma" value={fmtDate(employee.arrival_date)} />
      <DetailRow label="Kezdés dátuma" value={fmtDate(employee.start_date)} />
      {employee.end_date && (
        <DetailRow label="Befejezés dátuma" value={fmtDate(employee.end_date)} />
      )}

      {/* 4. Szálláshely */}
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 2 }}>Szálláshely</Typography>
      <Divider sx={{ mb: 1 }} />
      <DetailRow label="Szálláshely" value={employee.accommodation_name || '-'} />
      {employee.accommodation_address && (
        <DetailRow label="Szálláshely címe" value={employee.accommodation_address} />
      )}
      <DetailRow label="Szoba" value={employee.assigned_room_number || employee.room_number || '-'} />

      {/* 5. Állandó lakcím */}
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 2 }}>Állandó lakcím</Typography>
      <Divider sx={{ mb: 1 }} />
      <DetailRow label="Cím" value={buildAddress()} />

      {/* 6. Cég adatok */}
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 2 }}>Cég adatok</Typography>
      <Divider sx={{ mb: 1 }} />
      <DetailRow label="Cégnév" value={employee.company_name || '-'} />
      <DetailRow label="Céges email" value={employee.company_email || '-'} />
      <DetailRow label="Céges telefon" value={employee.company_phone || '-'} />

      {/* 7. Egyéb */}
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 2 }}>Egyéb</Typography>
      <Divider sx={{ mb: 1 }} />
      <DetailRow label="Bankszámlaszám" value={employee.bank_account || '-'} />
      <DetailRow label="Megjegyzések" value={employee.notes || '-'} />

      <Divider sx={{ my: 2 }} />
      <DetailRow label="Létrehozva" value={new Date(employee.created_at).toLocaleString('hu-HU')} />
      <DetailRow label="Módosítva" value={new Date(employee.updated_at).toLocaleString('hu-HU')} />
    </Box>
  );
}

function EditForm({ formData, handleChange, statuses, accommodations, employee, onPhotoUpload, onPhotoDelete, photoUploading }) {
  const photoInputRef = React.useRef(null);
  const [availableRooms, setAvailableRooms] = React.useState([]);
  const [roomsLoading, setRoomsLoading] = React.useState(false);

  // Fetch rooms when accommodation_id changes
  React.useEffect(() => {
    if (formData.accommodation_id) {
      setRoomsLoading(true);
      roomsAPI.getByAccommodation(formData.accommodation_id)
        .then(response => {
          if (response.success) {
            setAvailableRooms(response.data.rooms);
          }
        })
        .catch(() => setAvailableRooms([]))
        .finally(() => setRoomsLoading(false));
    } else {
      setAvailableRooms([]);
      handleChange('room_id', '');
    }
  }, [formData.accommodation_id]);

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onPhotoUpload(file);
    }
    e.target.value = '';
  };

  return (
    <Grid container spacing={2} sx={{ mt: 1 }}>
      {/* Profile Photo */}
      <Grid item xs={12}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 1 }}>
          {employee?.profile_photo_url ? (
            <Avatar
              src={`${UPLOADS_BASE_URL}${employee.profile_photo_url}`}
              sx={{ width: 120, height: 120, mb: 1 }}
            />
          ) : (
            <Avatar sx={{ width: 120, height: 120, mb: 1, bgcolor: '#2c5f2d', fontSize: '2.5rem' }}>
              {(employee?.last_name?.[0] || '') + (employee?.first_name?.[0] || '')}
            </Avatar>
          )}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <input
              type="file"
              ref={photoInputRef}
              hidden
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoSelect}
            />
            <Button
              size="small"
              variant="outlined"
              startIcon={photoUploading ? <CircularProgress size={16} /> : <UploadIcon />}
              disabled={photoUploading}
              onClick={() => photoInputRef.current?.click()}
              sx={{ color: '#2c5f2d', borderColor: '#2c5f2d', textTransform: 'none' }}
            >
              {employee?.profile_photo_url ? 'Kép cseréje' : 'Kép feltöltése'}
            </Button>
            {employee?.profile_photo_url && (
              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                disabled={photoUploading}
                onClick={onPhotoDelete}
                sx={{ textTransform: 'none' }}
              >
                Törlés
              </Button>
            )}
          </Box>
        </Box>
      </Grid>

      {/* 1. Személyes adatok */}
      <Grid item xs={12}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Személyes adatok</Typography>
        <Divider />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Vezetéknév" value={formData.last_name}
          onChange={(e) => handleChange('last_name', e.target.value)} />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Keresztnév" value={formData.first_name}
          onChange={(e) => handleChange('first_name', e.target.value)} />
      </Grid>
      <Grid item xs={6} md={4}>
        <FormControl fullWidth>
          <InputLabel>Nem</InputLabel>
          <Select value={formData.gender} onChange={(e) => handleChange('gender', e.target.value)} label="Nem">
            <MenuItem value="">-</MenuItem>
            <MenuItem value="male">Férfi</MenuItem>
            <MenuItem value="female">Nő</MenuItem>
            <MenuItem value="other">Egyéb</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Születési dátum" type="date" value={formData.birth_date}
          onChange={(e) => handleChange('birth_date', e.target.value)} InputLabelProps={{ shrink: true }} />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Születési hely" value={formData.birth_place}
          onChange={(e) => handleChange('birth_place', e.target.value)} />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Anyja neve" value={formData.mothers_name}
          onChange={(e) => handleChange('mothers_name', e.target.value)} />
      </Grid>
      <Grid item xs={6} md={4}>
        <FormControl fullWidth>
          <InputLabel>Családi állapot</InputLabel>
          <Select value={formData.marital_status} onChange={(e) => handleChange('marital_status', e.target.value)} label="Családi állapot">
            <MenuItem value="">-</MenuItem>
            <MenuItem value="single">Egyedülálló</MenuItem>
            <MenuItem value="married">Házas</MenuItem>
            <MenuItem value="divorced">Elvált</MenuItem>
            <MenuItem value="widowed">Özvegy</MenuItem>
          </Select>
        </FormControl>
      </Grid>

      {/* 2. Okmányok */}
      <Grid item xs={12} sx={{ mt: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Okmányok</Typography>
        <Divider />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Adóazonosító" value={formData.tax_id}
          onChange={(e) => handleChange('tax_id', e.target.value)} />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Útlevélszám" value={formData.passport_number}
          onChange={(e) => handleChange('passport_number', e.target.value)} />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="TAJ szám" value={formData.social_security_number}
          onChange={(e) => handleChange('social_security_number', e.target.value)} />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Vízum lejárat" type="date" value={formData.visa_expiry}
          onChange={(e) => handleChange('visa_expiry', e.target.value)} InputLabelProps={{ shrink: true }} />
      </Grid>

      {/* 3. Munka adatok */}
      <Grid item xs={12} sx={{ mt: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Munka adatok</Typography>
        <Divider />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Törzsszám" value={formData.employee_number}
          onChange={(e) => handleChange('employee_number', e.target.value)} />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Munkakör" value={formData.position}
          onChange={(e) => handleChange('position', e.target.value)} />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Munkahely" value={formData.workplace}
          onChange={(e) => handleChange('workplace', e.target.value)} />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Érkezés dátuma" type="date" value={formData.arrival_date}
          onChange={(e) => handleChange('arrival_date', e.target.value)} InputLabelProps={{ shrink: true }} />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Kezdés dátuma" type="date" value={formData.start_date}
          onChange={(e) => handleChange('start_date', e.target.value)} InputLabelProps={{ shrink: true }} />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Befejezés dátuma" type="date" value={formData.end_date}
          onChange={(e) => handleChange('end_date', e.target.value)} InputLabelProps={{ shrink: true }} />
      </Grid>
      <Grid item xs={6} md={4}>
        <FormControl fullWidth>
          <InputLabel>Státusz</InputLabel>
          <Select value={formData.status_id} onChange={(e) => handleChange('status_id', e.target.value)} label="Státusz">
            <MenuItem value="">Nincs</MenuItem>
            {statuses.map((s) => (
              <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>

      {/* 4. Szálláshely */}
      <Grid item xs={12} sx={{ mt: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Szálláshely</Typography>
        <Divider />
      </Grid>
      <Grid item xs={6}>
        <FormControl fullWidth>
          <InputLabel>Szálláshely</InputLabel>
          <Select value={formData.accommodation_id} onChange={(e) => { handleChange('accommodation_id', e.target.value); handleChange('room_id', ''); }} label="Szálláshely">
            <MenuItem value="">Nincs</MenuItem>
            {accommodations.map((a) => (
              <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={6}>
        <FormControl fullWidth disabled={!formData.accommodation_id || roomsLoading}>
          <InputLabel>Szoba</InputLabel>
          <Select value={formData.room_id} onChange={(e) => handleChange('room_id', e.target.value)} label="Szoba">
            <MenuItem value="">Nincs</MenuItem>
            {availableRooms.map((r) => (
              <MenuItem key={r.id} value={r.id}>
                Szoba {r.room_number} ({r.occupied_beds}/{r.beds} ágy)
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>

      {/* 5. Állandó lakcím */}
      <Grid item xs={12} sx={{ mt: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Állandó lakcím</Typography>
        <Divider />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Irányítószám" value={formData.permanent_address_zip}
          onChange={(e) => handleChange('permanent_address_zip', e.target.value)} />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Ország" value={formData.permanent_address_country}
          onChange={(e) => handleChange('permanent_address_country', e.target.value)} />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Megye" value={formData.permanent_address_county}
          onChange={(e) => handleChange('permanent_address_county', e.target.value)} />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Város" value={formData.permanent_address_city}
          onChange={(e) => handleChange('permanent_address_city', e.target.value)} />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Utca" value={formData.permanent_address_street}
          onChange={(e) => handleChange('permanent_address_street', e.target.value)} />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Házszám" value={formData.permanent_address_number}
          onChange={(e) => handleChange('permanent_address_number', e.target.value)} />
      </Grid>

      {/* 6. Cég adatok */}
      <Grid item xs={12} sx={{ mt: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Cég adatok</Typography>
        <Divider />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Cégnév" value={formData.company_name}
          onChange={(e) => handleChange('company_name', e.target.value)} />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Céges email" value={formData.company_email}
          onChange={(e) => handleChange('company_email', e.target.value)} />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Céges telefon" value={formData.company_phone}
          onChange={(e) => handleChange('company_phone', e.target.value)} />
      </Grid>

      {/* 7. Egyéb */}
      <Grid item xs={12} sx={{ mt: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Egyéb</Typography>
        <Divider />
      </Grid>
      <Grid item xs={6} md={4}>
        <TextField fullWidth label="Bankszámlaszám" value={formData.bank_account}
          onChange={(e) => handleChange('bank_account', e.target.value)} />
      </Grid>
      <Grid item xs={12}>
        <TextField fullWidth multiline rows={2} label="Megjegyzések" value={formData.notes}
          onChange={(e) => handleChange('notes', e.target.value)} />
      </Grid>
    </Grid>
  );
}

export default EmployeeDetailModal;
