import React, { useState, useEffect, useCallback } from 'react';
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
  FolderOpen as FolderOpenIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  PictureAsPdf as PdfIcon,
  Close as CloseIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import Zoom from 'react-medium-image-zoom';
import 'react-medium-image-zoom/dist/styles.css';
import { employeesAPI, accommodationsAPI, roomsAPI, UPLOADS_BASE_URL } from '../services/api';
import { toast } from 'react-toastify';
import UserAvatar from './common/UserAvatar';

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

const DOC_TYPE_CONFIG = {
  passport: { label: 'Útlevél', color: '#2563eb' },
  taj_card: { label: 'TAJ kártya', color: '#16a34a' },
  visa: { label: 'Vízum', color: '#f59e0b' },
  contract: { label: 'Szerződés', color: '#8b5cf6' },
  address_card: { label: 'Lakcímkártya', color: '#06b6d4' },
  other: { label: 'Egyéb', color: '#64748b' },
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

  // Documents state
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [docUploading, setDocUploading] = useState(false);
  const [selectedDocImage, setSelectedDocImage] = useState(null);
  const [showOriginalInViewer, setShowOriginalInViewer] = useState(false);

  useEffect(() => {
    if (open && employeeId) {
      loadEmployee();
      loadDropdowns();
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

  const loadDocuments = useCallback(async () => {
    setDocumentsLoading(true);
    try {
      const response = await employeesAPI.getDocuments(employeeId);
      if (response.success) {
        setDocuments(response.data || []);
      }
    } catch (error) {
      console.error('Dokumentumok betöltési hiba:', error);
      toast.error('Hiba a dokumentumok betöltésekor');
    } finally {
      setDocumentsLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    if (activeTab === 2 && employeeId) {
      loadDocuments();
    }
  }, [activeTab, employeeId, loadDocuments]);

  const handleDocUpload = async (file, documentType, notes) => {
    setDocUploading(true);
    try {
      const response = await employeesAPI.uploadDocument(employeeId, file, documentType, notes);
      if (response.success) {
        toast.success('Dokumentum sikeresen feltöltve!');
        loadDocuments();
      }
    } catch (error) {
      console.error('Dokumentum feltöltési hiba:', error);
      toast.error(error.response?.data?.message || 'Hiba a dokumentum feltöltésekor');
    } finally {
      setDocUploading(false);
    }
  };

  const handleDocDelete = async (docId) => {
    if (!window.confirm('Biztosan törlöd ezt a dokumentumot?')) return;
    try {
      const response = await employeesAPI.deleteDocument(docId);
      if (response.success) {
        toast.success('Dokumentum törölve!');
        setDocuments(prev => prev.filter(d => d.id !== docId));
        if (selectedDocImage?.id === docId) {
          setSelectedDocImage(null);
        }
      }
    } catch (error) {
      console.error('Dokumentum törlési hiba:', error);
      toast.error('Hiba a dokumentum törlésekor');
    }
  };

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

  const handleStatusChange = async (newStatusId) => {
    const newStatus = statuses.find(s => s.id === newStatusId);
    if (!window.confirm(`Biztosan megváltoztatod a státuszt: "${newStatus?.name}"?`)) return;

    setSaving(true);
    try {
      const response = await employeesAPI.update(employeeId, { status_id: newStatusId });
      if (response.success) {
        toast.success('Státusz sikeresen megváltoztatva!');
        loadEmployee();
        onSuccess();
      }
    } catch (error) {
      console.error('Státusz változtatási hiba:', error);
      toast.error('Hiba a státusz megváltoztatásakor');
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
    setDocuments([]);
    setSelectedDocImage(null);
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
              '& .Mui-selected': { color: '#2563eb' },
              '& .MuiTabs-indicator': { backgroundColor: '#2563eb' },
            }}
          >
            <Tab icon={<PersonIcon />} iconPosition="start" label="Adatok" />
            <Tab icon={<TimelineIcon />} iconPosition="start" label="Idővonal" />
            <Tab icon={<FolderOpenIcon />} iconPosition="start" label="Dokumentumok" />
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
          ) : activeTab === 2 ? (
            /* Dokumentumok tab */
            <DocumentsTab
              documents={documents}
              documentsLoading={documentsLoading}
              docUploading={docUploading}
              onUpload={handleDocUpload}
              onDelete={handleDocDelete}
              selectedDocImage={selectedDocImage}
              setSelectedDocImage={setSelectedDocImage}
              showOriginalInViewer={showOriginalInViewer}
              setShowOriginalInViewer={setShowOriginalInViewer}
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
                        ? { bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }
                        : { color: '#2563eb', borderColor: '#2563eb' }),
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
                  sx={{ bgcolor: '#06b6d4', '&:hover': { bgcolor: '#0891b2' } }}
                >
                  Jegyzet hozzáadása
                </Button>
              </Box>

              {/* Filter checkboxes */}
              <Collapse in={showFilters}>
                <Box sx={{ p: 2, mb: 2, bgcolor: '#f8f9ff', borderRadius: 1, border: '1px solid #e5e7eb' }}>
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
                <Box sx={{ p: 2, mb: 2, bgcolor: '#ecfeff', borderRadius: 1, border: '1px solid #22d3ee' }}>
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
                        sx={{ bgcolor: '#06b6d4', '&:hover': { bgcolor: '#0891b2' } }}
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
                            bgcolor: '#2563eb',
                            border: '2px solid white',
                            boxShadow: '0 0 0 2px #2563eb',
                          }}
                        />
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#2563eb' }}>
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
              sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
            >
              {saving ? <CircularProgress size={24} /> : 'Mentés'}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={handleClose}>Bezárás</Button>
            {employee && activeTab === 0 && (
              <>
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <Select
                    value={employee.status_id || ''}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    disabled={saving}
                    displayEmpty
                    MenuProps={{
                      anchorOrigin: { vertical: 'top', horizontal: 'left' },
                      transformOrigin: { vertical: 'bottom', horizontal: 'left' },
                    }}
                    renderValue={(val) => {
                      const s = statuses.find(st => st.id === val);
                      return s ? (
                        <Chip label={s.name} size="small" sx={{ bgcolor: `${s.color}20`, color: s.color, fontWeight: 600 }} />
                      ) : 'Státusz';
                    }}
                  >
                    {statuses.map((s) => (
                      <MenuItem key={s.id} value={s.id}>
                        <Chip label={s.name} size="small" sx={{ bgcolor: `${s.color}20`, color: s.color }} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
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
            <UserAvatar
              user={employee}
              photoUrl={`${UPLOADS_BASE_URL}${employee.profile_photo_url}`}
              size="xxl"
              tooltip={false}
              sx={{ mb: 1, cursor: 'zoom-in' }}
            />
          </Zoom>
        ) : (
          <UserAvatar
            user={employee}
            size="xxl"
            tooltip={false}
            sx={{ mb: 1 }}
          />
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
            sx={{ color: '#2563eb', borderColor: '#2563eb', textTransform: 'none' }}
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
      <DetailRow label="Személyes email" value={employee.personal_email || employee.email || '-'} />
      <DetailRow label="Személyes telefon" value={employee.personal_phone || employee.phone || '-'} />
      <DetailRow label="Céges email" value={employee.company_email || '-'} />
      <DetailRow label="Céges telefon" value={employee.company_phone || '-'} />
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
          <UserAvatar
            user={employee}
            photoUrl={employee?.profile_photo_url ? `${UPLOADS_BASE_URL}${employee.profile_photo_url}` : undefined}
            size={120}
            tooltip={false}
            sx={{ mb: 1 }}
          />
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
              sx={{ color: '#2563eb', borderColor: '#2563eb', textTransform: 'none' }}
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

function DocumentsTab({
  documents,
  documentsLoading,
  docUploading,
  onUpload,
  onDelete,
  selectedDocImage,
  setSelectedDocImage,
  showOriginalInViewer,
  setShowOriginalInViewer,
}) {
  const fileInputRef = React.useRef(null);
  const [uploadDocType, setUploadDocType] = React.useState('other');
  const [uploadNotes, setUploadNotes] = React.useState('');
  const [dragOver, setDragOver] = React.useState(false);
  const [zoom, setZoom] = React.useState(1);

  const handleFileSelect = (file) => {
    if (!file) return;
    onUpload(file, uploadDocType, uploadNotes);
    setUploadNotes('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    handleFileSelect(file);
  };

  const isImage = (mimeType) => mimeType?.startsWith('image/');

  const getDocUrl = (doc, type = 'scanned') => {
    let path;
    if (type === 'original') {
      path = doc.file_path;
    } else if (type === 'scanned' && doc.scanned_file_path) {
      path = doc.scanned_file_path;
    } else {
      path = doc.file_path;
    }
    return `${UPLOADS_BASE_URL}${path}`;
  };

  const getThumbnailUrl = (doc) => {
    if (doc.thumbnail_path) return `${UPLOADS_BASE_URL}${doc.thumbnail_path}`;
    if (doc.scanned_file_path) return `${UPLOADS_BASE_URL}${doc.scanned_file_path}`;
    return `${UPLOADS_BASE_URL}${doc.file_path}`;
  };

  const openViewer = (doc) => {
    setSelectedDocImage(doc);
    setShowOriginalInViewer(false);
    setZoom(1);
  };

  const handleDownload = (doc) => {
    const link = document.createElement('a');
    link.href = `${UPLOADS_BASE_URL}${doc.file_path}`;
    link.download = doc.file_name;
    link.click();
  };

  return (
    <Box sx={{ mt: 1 }}>
      {/* Upload area */}
      <Box
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        sx={{
          p: 2,
          mb: 2,
          border: `2px dashed ${dragOver ? '#2563eb' : '#d1d5db'}`,
          borderRadius: 2,
          bgcolor: dragOver ? '#eff6ff' : '#fafafa',
          transition: 'all 0.2s',
        }}
      >
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Dokumentum típus</InputLabel>
              <Select
                value={uploadDocType}
                onChange={(e) => setUploadDocType(e.target.value)}
                label="Dokumentum típus"
              >
                {Object.entries(DOC_TYPE_CONFIG).map(([key, cfg]) => (
                  <MenuItem key={key} value={key}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: cfg.color }} />
                      {cfg.label}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              size="small"
              label="Megjegyzés (opcionális)"
              value={uploadNotes}
              onChange={(e) => setUploadNotes(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <input
              type="file"
              ref={fileInputRef}
              hidden
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
            />
            <Button
              fullWidth
              variant="contained"
              startIcon={docUploading ? <CircularProgress size={18} color="inherit" /> : <UploadIcon />}
              disabled={docUploading}
              onClick={() => fileInputRef.current?.click()}
              sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' }, textTransform: 'none' }}
            >
              {docUploading ? 'Feltöltés...' : 'Fájl kiválasztása'}
            </Button>
          </Grid>
        </Grid>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
          Húzd ide a fájlt, vagy kattints a gombra. Képek (JPG, PNG, WebP) és PDF.
        </Typography>
      </Box>

      {/* Document grid */}
      {documentsLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : documents.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
          <FolderOpenIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
          <Typography>Nincs feltöltött dokumentum</Typography>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {documents.map((doc) => {
            const typeConfig = DOC_TYPE_CONFIG[doc.document_type] || DOC_TYPE_CONFIG.other;
            const docIsImage = isImage(doc.mime_type);

            return (
              <Grid item xs={6} sm={4} md={3} key={doc.id}>
                <Box
                  sx={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 2,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    transition: 'box-shadow 0.2s',
                    '&:hover': { boxShadow: '0 2px 8px rgba(0,0,0,0.12)' },
                  }}
                  onClick={() => openViewer(doc)}
                >
                  {/* Thumbnail */}
                  <Box
                    sx={{
                      height: 140,
                      bgcolor: '#f5f5f5',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {docIsImage ? (
                      <img
                        src={getThumbnailUrl(doc)}
                        alt={doc.file_name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <PdfIcon sx={{ fontSize: 48, color: '#ef4444' }} />
                    )}
                  </Box>

                  {/* Info */}
                  <Box sx={{ p: 1.5 }}>
                    <Chip
                      label={typeConfig.label}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        bgcolor: `${typeConfig.color}20`,
                        color: typeConfig.color,
                        mb: 0.5,
                      }}
                    />
                    <Typography variant="caption" display="block" color="text.secondary" noWrap>
                      {fmtDate(doc.uploaded_at)}
                    </Typography>
                    {doc.notes && (
                      <Typography variant="caption" display="block" color="text.secondary" noWrap sx={{ mt: 0.25 }}>
                        {doc.notes}
                      </Typography>
                    )}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
                      <Tooltip title="Letöltés">
                        <IconButton
                          size="small"
                          onClick={(e) => { e.stopPropagation(); handleDownload(doc); }}
                          sx={{ color: '#2563eb', opacity: 0.6, '&:hover': { opacity: 1 } }}
                        >
                          <DownloadIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Törlés">
                        <IconButton
                          size="small"
                          onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}
                          sx={{ color: '#ef4444', opacity: 0.6, '&:hover': { opacity: 1 } }}
                        >
                          <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                </Box>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Fullscreen image viewer */}
      <Dialog
        open={!!selectedDocImage}
        onClose={() => setSelectedDocImage(null)}
        maxWidth={false}
        fullWidth
        PaperProps={{
          sx: { maxWidth: '95vw', maxHeight: '95vh', m: 1, bgcolor: '#1a1a1a' },
        }}
      >
        {selectedDocImage && (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1, bgcolor: '#1a1a1a', color: '#fff' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip
                  label={(DOC_TYPE_CONFIG[selectedDocImage.document_type] || DOC_TYPE_CONFIG.other).label}
                  size="small"
                  sx={{
                    bgcolor: `${(DOC_TYPE_CONFIG[selectedDocImage.document_type] || DOC_TYPE_CONFIG.other).color}30`,
                    color: (DOC_TYPE_CONFIG[selectedDocImage.document_type] || DOC_TYPE_CONFIG.other).color,
                    fontWeight: 600,
                  }}
                />
                {selectedDocImage.scanned_file_path && (
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Button
                      size="small"
                      variant={!showOriginalInViewer ? 'contained' : 'outlined'}
                      onClick={() => setShowOriginalInViewer(false)}
                      sx={{
                        textTransform: 'none',
                        fontSize: '0.75rem',
                        minWidth: 0,
                        px: 1.5,
                        ...(!showOriginalInViewer
                          ? { bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }
                          : { color: '#ccc', borderColor: '#555' }),
                      }}
                      startIcon={<VisibilityIcon sx={{ fontSize: 14 }} />}
                    >
                      Szkennelt
                    </Button>
                    <Button
                      size="small"
                      variant={showOriginalInViewer ? 'contained' : 'outlined'}
                      onClick={() => setShowOriginalInViewer(true)}
                      sx={{
                        textTransform: 'none',
                        fontSize: '0.75rem',
                        minWidth: 0,
                        px: 1.5,
                        ...(showOriginalInViewer
                          ? { bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }
                          : { color: '#ccc', borderColor: '#555' }),
                      }}
                      startIcon={<VisibilityOffIcon sx={{ fontSize: 14 }} />}
                    >
                      Eredeti
                    </Button>
                  </Box>
                )}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {isImage(selectedDocImage.mime_type) && (
                  <>
                    <Tooltip title="Kicsinyítés">
                      <IconButton size="small" onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} sx={{ color: '#ccc' }}>
                        <ZoomOutIcon />
                      </IconButton>
                    </Tooltip>
                    <Typography variant="caption" sx={{ color: '#ccc', minWidth: 40, textAlign: 'center' }}>
                      {Math.round(zoom * 100)}%
                    </Typography>
                    <Tooltip title="Nagyítás">
                      <IconButton size="small" onClick={() => setZoom(z => Math.min(4, z + 0.25))} sx={{ color: '#ccc' }}>
                        <ZoomInIcon />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
                <Tooltip title="Letöltés">
                  <IconButton
                    size="small"
                    onClick={() => handleDownload(selectedDocImage)}
                    sx={{ color: '#4ade80', ml: 1 }}
                  >
                    <DownloadIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Törlés">
                  <IconButton
                    size="small"
                    onClick={() => onDelete(selectedDocImage.id)}
                    sx={{ color: '#ef4444', ml: 0.5 }}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
                <IconButton size="small" onClick={() => setSelectedDocImage(null)} sx={{ color: '#ccc', ml: 0.5 }}>
                  <CloseIcon />
                </IconButton>
              </Box>
            </DialogTitle>
            <DialogContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 2, bgcolor: '#1a1a1a', overflow: 'auto' }}>
              {isImage(selectedDocImage.mime_type) ? (
                <img
                  src={getDocUrl(selectedDocImage, showOriginalInViewer ? 'original' : 'scanned')}
                  alt={selectedDocImage.file_name}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '80vh',
                    transform: `scale(${zoom})`,
                    transformOrigin: 'center center',
                    transition: 'transform 0.2s',
                  }}
                />
              ) : (
                <iframe
                  src={getDocUrl(selectedDocImage, 'original')}
                  title={selectedDocImage.file_name}
                  style={{
                    width: '100%',
                    height: '80vh',
                    border: 'none',
                    borderRadius: 4,
                    bgcolor: '#fff',
                  }}
                />
              )}
            </DialogContent>
          </>
        )}
      </Dialog>
    </Box>
  );
}

export default EmployeeDetailModal;
