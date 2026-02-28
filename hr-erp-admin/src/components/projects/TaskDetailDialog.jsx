import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Dialog, DialogTitle, DialogContent,
  Button, Stack, TextField, CircularProgress, Divider, Chip, IconButton,
  Tabs, Tab, LinearProgress, Avatar, Tooltip,
  Table, TableBody, TableCell, TableHead, TableRow,
  Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import {
  Close as CloseIcon, Send as SendIcon, AttachFile as AttachIcon,
  AccessTime as TimeIcon, Add as AddIcon, Delete as DeleteIcon,
  CheckCircle as DoneIcon, Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { tasksAPI, timesheetsAPI, UPLOADS_BASE_URL } from '../../services/api';
import { toast } from 'react-toastify';
import UserAvatar from '../common/UserAvatar';
import TimesheetDialog from './TimesheetDialog';

const STATUS_MAP = {
  todo: { label: 'Teendő', color: 'default' },
  in_progress: { label: 'Folyamatban', color: 'primary' },
  review: { label: 'Ellenőrzés', color: 'warning' },
  done: { label: 'Kész', color: 'success' },
  blocked: { label: 'Blokkolva', color: 'error' },
};

const PRIORITY_MAP = {
  low: { label: 'Alacsony', color: 'default' },
  medium: { label: 'Közepes', color: 'info' },
  high: { label: 'Magas', color: 'warning' },
  critical: { label: 'Kritikus', color: 'error' },
};

const formatDate = (d) => d ? new Date(d).toLocaleDateString('hu-HU') : '-';
const formatDateTime = (d) => d ? new Date(d).toLocaleString('hu-HU') : '-';

export default function TaskDetailDialog({ open, onClose, taskId, onUpdate, projectId, users = [], onNavigateTask }) {
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState(null);
  const [tabValue, setTabValue] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [timesheetOpen, setTimesheetOpen] = useState(false);
  const fileInputRef = useRef(null);

  // Dependency management
  const [addingDependency, setAddingDependency] = useState(false);
  const [newDependencyTaskId, setNewDependencyTaskId] = useState('');
  const [availableTasks, setAvailableTasks] = useState([]);

  useEffect(() => {
    if (open && taskId) {
      loadTask();
      setTabValue(0);
    }
  }, [open, taskId]);

  const loadTask = async () => {
    setLoading(true);
    try {
      const response = await tasksAPI.getById(taskId);
      if (response.success) {
        setTask(response.data.task);
      }
    } catch (error) {
      toast.error('Hiba a feladat betöltésekor');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    setUpdatingStatus(true);
    try {
      const response = await tasksAPI.updateStatus(taskId, { status: newStatus });
      if (response.success) {
        toast.success('Státusz frissítve');
        loadTask();
        onUpdate?.();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba a státusz frissítésekor');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setSendingComment(true);
    try {
      const response = await tasksAPI.addComment(taskId, { comment: newComment });
      if (response.success) {
        toast.success('Hozzászólás hozzáadva');
        setNewComment('');
        loadTask();
      }
    } catch (error) {
      toast.error('Hiba a hozzászólás hozzáadásakor');
    } finally {
      setSendingComment(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const response = await tasksAPI.addAttachment(taskId, file);
      if (response.success) {
        toast.success('Melléklet feltöltve');
        loadTask();
      }
    } catch (error) {
      toast.error('Hiba a fájl feltöltésekor');
    }
    e.target.value = '';
  };

  const handleLogHours = async (data) => {
    const response = await timesheetsAPI.logHours(data);
    if (response.success) {
      toast.success('Munkaidő rögzítve');
      loadTask();
      onUpdate?.();
    }
  };

  const handleOpenAddDependency = async () => {
    setAddingDependency(true);
    setNewDependencyTaskId('');
    try {
      const response = await tasksAPI.getAll(projectId, { limit: 500 });
      if (response.success) {
        const allTasks = response.data.tasks || [];
        // Exclude current task and already-depended tasks
        const existingDepIds = (task?.dependencies || []).map(d => d.depends_on_task_id);
        setAvailableTasks(allTasks.filter(t => t.id !== taskId && !existingDepIds.includes(t.id)));
      }
    } catch (error) {
      toast.error('Hiba a feladatok betöltésekor');
    }
  };

  const handleAddDependency = async () => {
    if (!newDependencyTaskId) return;
    try {
      const response = await tasksAPI.addDependency(taskId, {
        depends_on_task_id: newDependencyTaskId,
        dependency_type: 'finish_to_start',
      });
      if (response.success) {
        toast.success('Függőség hozzáadva');
        setAddingDependency(false);
        setNewDependencyTaskId('');
        loadTask();
        onUpdate?.();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba a függőség hozzáadásakor');
    }
  };

  if (!open) return null;

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
            <Typography variant="h6" noWrap sx={{ fontWeight: 600 }}>
              {loading ? 'Betöltés...' : task?.title || 'Feladat'}
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
              <CircularProgress />
            </Box>
          ) : !task ? (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 5 }}>
              Feladat nem található
            </Typography>
          ) : (
            <>
              {/* Header chips */}
              <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
                <Chip
                  label={STATUS_MAP[task.status]?.label || task.status}
                  color={STATUS_MAP[task.status]?.color || 'default'}
                  size="small"
                />
                <Chip
                  label={PRIORITY_MAP[task.priority]?.label || task.priority}
                  color={PRIORITY_MAP[task.priority]?.color || 'default'}
                  size="small"
                  variant="outlined"
                />
                {task.assigned_first_name && (
                  <Chip
                    label={`${task.assigned_last_name} ${task.assigned_first_name}`}
                    size="small"
                    variant="outlined"
                  />
                )}
                {task.due_date && (
                  <Chip
                    icon={<ScheduleIcon />}
                    label={formatDate(task.due_date)}
                    size="small"
                    variant="outlined"
                    color={new Date(task.due_date) < new Date() && task.status !== 'done' ? 'error' : 'default'}
                  />
                )}
              </Stack>

              {/* Status change */}
              <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center">
                <Typography variant="body2" color="text.secondary">Státusz:</Typography>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <Select
                    value={task.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    disabled={updatingStatus}
                    size="small"
                  >
                    {Object.entries(STATUS_MAP).map(([val, { label }]) => (
                      <MenuItem key={val} value={val}>{label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {updatingStatus && <CircularProgress size={20} />}
              </Stack>

              {/* Description */}
              {task.description && (
                <Box sx={{ mb: 2, p: 2, bgcolor: '#f8fafc', borderRadius: 1 }}>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {task.description}
                  </Typography>
                </Box>
              )}

              {/* Progress & hours */}
              <Stack direction="row" spacing={3} sx={{ mb: 2 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">Haladás</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={task.progress || 0}
                      sx={{ flex: 1, height: 8, borderRadius: 4 }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 40 }}>
                      {task.progress || 0}%
                    </Typography>
                  </Box>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Órák</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {task.actual_hours || 0} / {task.estimated_hours || '-'} óra
                  </Typography>
                </Box>
              </Stack>

              <Divider sx={{ mb: 1 }} />

              {/* Tabs */}
              <Tabs
                value={tabValue}
                onChange={(e, v) => setTabValue(v)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ mb: 2 }}
              >
                <Tab label={`Alfeladatok (${task.subtasks?.length || 0})`} />
                <Tab label={`Hozzászólások (${task.comments?.length || 0})`} />
                <Tab label={`Mellékletek (${task.attachments?.length || 0})`} />
                <Tab label={`Függőségek (${task.dependencies?.length || 0})`} />
                <Tab label={`Munkaidő (${task.time_logs?.length || 0})`} />
              </Tabs>

              {/* Subtasks Tab */}
              {tabValue === 0 && (
                <Box>
                  {task.subtasks?.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                      Nincsenek alfeladatok
                    </Typography>
                  ) : (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Cím</TableCell>
                          <TableCell>Státusz</TableCell>
                          <TableCell>Prioritás</TableCell>
                          <TableCell>Felelős</TableCell>
                          <TableCell>Határidő</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {task.subtasks?.map((sub) => (
                          <TableRow key={sub.id} hover>
                            <TableCell>{sub.title}</TableCell>
                            <TableCell>
                              <Chip
                                label={STATUS_MAP[sub.status]?.label || sub.status}
                                color={STATUS_MAP[sub.status]?.color || 'default'}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={PRIORITY_MAP[sub.priority]?.label || sub.priority}
                                size="small"
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell>
                              {sub.assigned_first_name
                                ? `${sub.assigned_last_name} ${sub.assigned_first_name}`
                                : '-'}
                            </TableCell>
                            <TableCell>{formatDate(sub.due_date)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Box>
              )}

              {/* Comments Tab */}
              {tabValue === 1 && (
                <Box>
                  {/* Add comment */}
                  <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                    <TextField
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Hozzászólás írása..."
                      size="small"
                      fullWidth
                      multiline
                      maxRows={4}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAddComment();
                        }
                      }}
                    />
                    <Button
                      variant="contained"
                      onClick={handleAddComment}
                      disabled={sendingComment || !newComment.trim()}
                      sx={{ minWidth: 44, px: 1 }}
                    >
                      {sendingComment ? <CircularProgress size={20} /> : <SendIcon />}
                    </Button>
                  </Stack>

                  {task.comments?.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                      Nincsenek hozzászólások
                    </Typography>
                  ) : (
                    <Stack spacing={2}>
                      {task.comments?.map((c) => (
                        <Box key={c.id} sx={{ display: 'flex', gap: 1.5 }}>
                          <UserAvatar
                            user={{ firstName: c.first_name, lastName: c.last_name }}
                            size={32}
                          />
                          <Box sx={{ flex: 1 }}>
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
                              <Typography variant="subtitle2">
                                {c.last_name} {c.first_name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {formatDateTime(c.created_at)}
                              </Typography>
                            </Box>
                            <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                              {c.comment}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Stack>
                  )}
                </Box>
              )}

              {/* Attachments Tab */}
              {tabValue === 2 && (
                <Box>
                  <Button
                    variant="outlined"
                    startIcon={<AttachIcon />}
                    onClick={() => fileInputRef.current?.click()}
                    size="small"
                    sx={{ mb: 2 }}
                  >
                    Fájl feltöltése
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    hidden
                    onChange={handleFileUpload}
                  />

                  {task.attachments?.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                      Nincsenek mellékletek
                    </Typography>
                  ) : (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Fájlnév</TableCell>
                          <TableCell>Méret</TableCell>
                          <TableCell>Feltöltő</TableCell>
                          <TableCell>Dátum</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {task.attachments?.map((a) => (
                          <TableRow key={a.id} hover>
                            <TableCell>
                              <Typography variant="body2" sx={{ color: '#2563eb', cursor: 'pointer' }}>
                                {a.file_name}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              {a.file_size ? `${(a.file_size / 1024).toFixed(1)} KB` : '-'}
                            </TableCell>
                            <TableCell>
                              {a.uploader_last_name
                                ? `${a.uploader_last_name} ${a.uploader_first_name}`
                                : '-'}
                            </TableCell>
                            <TableCell>{formatDateTime(a.uploaded_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Box>
              )}

              {/* Dependencies Tab */}
              {tabValue === 3 && (
                <Box>
                  {/* Blocking alert */}
                  {(() => {
                    const incompleteDeps = task.dependencies?.filter(d => d.depends_on_status && d.depends_on_status !== 'done') || [];
                    if (incompleteDeps.length > 0) {
                      return (
                        <Box sx={{
                          p: 1.5, mb: 2, bgcolor: '#fef2f2', border: '1px solid #fecaca',
                          borderRadius: 1, display: 'flex', alignItems: 'center', gap: 1,
                        }}>
                          <ScheduleIcon sx={{ color: '#ef4444', fontSize: 20 }} />
                          <Typography variant="body2" sx={{ color: '#dc2626', fontWeight: 500 }}>
                            {incompleteDeps.length} befejezetlen függőség blokkolja ezt a feladatot
                          </Typography>
                        </Box>
                      );
                    }
                    return null;
                  })()}

                  {/* Add dependency */}
                  {addingDependency ? (
                    <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center">
                      <FormControl size="small" sx={{ minWidth: 250 }}>
                        <InputLabel>Feladat kiválasztása</InputLabel>
                        <Select
                          value={newDependencyTaskId}
                          label="Feladat kiválasztása"
                          onChange={(e) => setNewDependencyTaskId(e.target.value)}
                        >
                          {availableTasks.map((t) => (
                            <MenuItem key={t.id} value={t.id}>{t.title}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={handleAddDependency}
                        disabled={!newDependencyTaskId}
                      >
                        Hozzáadás
                      </Button>
                      <Button
                        size="small"
                        onClick={() => setAddingDependency(false)}
                      >
                        Mégse
                      </Button>
                    </Stack>
                  ) : (
                    <Button
                      variant="outlined"
                      startIcon={<AddIcon />}
                      onClick={handleOpenAddDependency}
                      size="small"
                      sx={{ mb: 2 }}
                    >
                      Függőség hozzáadása
                    </Button>
                  )}

                  {task.dependencies?.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                      Nincsenek függőségek
                    </Typography>
                  ) : (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Feladat</TableCell>
                          <TableCell>Státusz</TableCell>
                          <TableCell>Típus</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {task.dependencies?.map((d) => (
                          <TableRow
                            key={d.id || d.depends_on_task_id}
                            hover
                            sx={{ cursor: onNavigateTask ? 'pointer' : 'default' }}
                            onClick={() => {
                              if (onNavigateTask && d.depends_on_task_id) {
                                onNavigateTask(d.depends_on_task_id);
                              }
                            }}
                          >
                            <TableCell>
                              <Typography
                                variant="body2"
                                sx={{ color: onNavigateTask ? '#2563eb' : 'inherit', fontWeight: 500 }}
                              >
                                {d.depends_on_title}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={STATUS_MAP[d.depends_on_status]?.label || d.depends_on_status}
                                color={STATUS_MAP[d.depends_on_status]?.color || 'default'}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>
                              {d.dependency_type === 'finish_to_start' ? 'Befejezés → Indítás' : d.dependency_type}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Box>
              )}

              {/* Time logs Tab */}
              {tabValue === 4 && (
                <Box>
                  <Button
                    variant="outlined"
                    startIcon={<TimeIcon />}
                    onClick={() => setTimesheetOpen(true)}
                    size="small"
                    sx={{ mb: 2 }}
                  >
                    Munkaidő rögzítése
                  </Button>

                  {task.time_logs?.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                      Nincsenek munkaidő bejegyzések
                    </Typography>
                  ) : (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Dátum</TableCell>
                          <TableCell>Felhasználó</TableCell>
                          <TableCell align="right">Órák</TableCell>
                          <TableCell>Megjegyzés</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {task.time_logs?.map((tl) => (
                          <TableRow key={tl.id} hover>
                            <TableCell>{formatDate(tl.work_date)}</TableCell>
                            <TableCell>{tl.last_name} {tl.first_name}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600 }}>
                              {tl.hours} óra
                            </TableCell>
                            <TableCell>{tl.description || '-'}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell colSpan={2} sx={{ fontWeight: 600 }}>Összesen</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {task.time_logs?.reduce((sum, tl) => sum + parseFloat(tl.hours || 0), 0)} óra
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      </TableBody>
                    </Table>
                  )}
                </Box>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <TimesheetDialog
        open={timesheetOpen}
        onClose={() => setTimesheetOpen(false)}
        onSave={handleLogHours}
        taskId={taskId}
        taskTitle={task?.title}
      />
    </>
  );
}
