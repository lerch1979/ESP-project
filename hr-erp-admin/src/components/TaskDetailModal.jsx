import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Grid, FormControl, InputLabel, Select, MenuItem,
  CircularProgress, Typography, Chip, Stack, Box, Divider,
  IconButton, Tooltip,
} from '@mui/material';
import {
  Edit as EditIcon,
  Send as SendIcon,
  Person as PersonIcon,
  AccessTime as AccessTimeIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { tasksAPI, usersAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import TaskAssigneesPanel from './TaskAssigneesPanel';

const PRIORITY_OPTIONS = [
  { value: 'low',      label: 'Alacsony' },
  { value: 'medium',   label: 'Közepes' },
  { value: 'high',     label: 'Magas' },
  { value: 'critical', label: 'Kritikus' },
];

const STATUS_OPTIONS = [
  { value: 'todo',        label: 'Teendő',       color: 'default' },
  { value: 'in_progress', label: 'Folyamatban',  color: 'primary' },
  { value: 'review',      label: 'Ellenőrzés',   color: 'warning' },
  { value: 'done',        label: 'Kész',         color: 'success' },
  { value: 'blocked',     label: 'Blokkolva',    color: 'error' },
];

const fmtDate = (s) => s ? new Date(s).toLocaleDateString('hu-HU') : '—';

export default function TaskDetailModal({ open, taskId, onClose, onChange }) {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [task, setTask] = useState(null);
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const [form, setForm] = useState({
    title: '', description: '', due_date: '', priority: 'medium', assigned_to: '',
  });

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const res = await tasksAPI.getById(taskId);
      if (res.success) {
        const t = res.data?.task || res.data;
        setTask(t);
        setForm({
          title: t.title || '',
          description: t.description || '',
          due_date: t.due_date ? String(t.due_date).slice(0, 10) : '',
          priority: t.priority || 'medium',
          assigned_to: t.assigned_to || '',
        });
      }
    } catch (err) {
      toast.error('Feladat betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (!open) return;
    setEditing(false);
    setNewComment('');
    load();
    // Load users for assignee dropdown
    (async () => {
      try {
        const res = await usersAPI.getAll({ limit: 500 });
        setUsers(res?.data?.users || res?.data || []);
      } catch { /* non-fatal */ }
    })();
  }, [open, load]);

  const saveEdits = async () => {
    if (!form.title.trim()) return toast.warn('A cím kötelező');
    setSaving(true);
    try {
      const res = await tasksAPI.update(taskId, {
        title: form.title,
        description: form.description || null,
        due_date: form.due_date || null,
        priority: form.priority,
        assigned_to: form.assigned_to || null,
      });
      if (res.success) {
        toast.success('Feladat frissítve');
        setEditing(false);
        await load();
        if (onChange) onChange();
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Frissítés sikertelen');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (newStatus) => {
    try {
      await tasksAPI.updateStatus(taskId, { status: newStatus });
      toast.success('Státusz frissítve');
      await load();
      if (onChange) onChange();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Státusz frissítés sikertelen');
    }
  };

  const postComment = async () => {
    if (!newComment.trim()) return;
    setPostingComment(true);
    try {
      await tasksAPI.addComment(taskId, { comment: newComment.trim() });
      setNewComment('');
      toast.success('Hozzászólás hozzáadva');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Hozzászólás sikertelen');
    } finally {
      setPostingComment(false);
    }
  };

  const statusConfig = STATUS_OPTIONS.find(s => s.value === task?.status);

  return (
    <Dialog open={open} onClose={saving ? null : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>Feladat részletei</Typography>
        <Box>
          {task && !editing && (
            <Tooltip title="Szerkesztés">
              <IconButton onClick={() => setEditing(true)} size="small" sx={{ color: '#2563eb' }}>
                <EditIcon />
              </IconButton>
            </Tooltip>
          )}
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {loading || !task ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
        ) : editing ? (
          // ─── Edit mode ───
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth label="Cím *"
                value={form.title}
                onChange={e => setForm(s => ({ ...s, title: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth multiline rows={4} label="Leírás"
                value={form.description}
                onChange={e => setForm(s => ({ ...s, description: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth type="date" label="Határidő"
                InputLabelProps={{ shrink: true }}
                value={form.due_date}
                onChange={e => setForm(s => ({ ...s, due_date: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth>
                <InputLabel>Prioritás</InputLabel>
                <Select
                  value={form.priority}
                  onChange={e => setForm(s => ({ ...s, priority: e.target.value }))}
                  label="Prioritás"
                >
                  {PRIORITY_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth>
                <InputLabel>Felelős</InputLabel>
                <Select
                  value={form.assigned_to}
                  onChange={e => setForm(s => ({ ...s, assigned_to: e.target.value }))}
                  label="Felelős"
                >
                  <MenuItem value=""><em>Nincs</em></MenuItem>
                  {users.map(u => (
                    <MenuItem key={u.id} value={u.id}>
                      {[u.first_name, u.last_name].filter(Boolean).join(' ') || u.email}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        ) : (
          // ─── View mode ───
          <>
            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
              {statusConfig && (
                <Chip label={statusConfig.label} color={statusConfig.color} size="small" />
              )}
              {task.priority && (
                <Chip label={PRIORITY_OPTIONS.find(p => p.value === task.priority)?.label || task.priority}
                  size="small" variant="outlined" />
              )}
              {task.tags?.length > 0 && task.tags.map(t => (
                <Chip key={t} label={t} size="small" sx={{ bgcolor: '#eff6ff', color: '#2563eb' }} />
              ))}
            </Stack>

            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>{task.title}</Typography>

            {task.description && (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 2, color: 'text.secondary' }}>
                {task.description}
              </Typography>
            )}

            <Divider sx={{ my: 2 }} />

            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Felelős</Typography>
                <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <PersonIcon sx={{ fontSize: 16 }} />
                  {task.assignee_name || task.assigned_to_name || (task.assigned_to
                    ? (users.find(u => u.id === task.assigned_to)
                        ? [users.find(u => u.id === task.assigned_to).first_name, users.find(u => u.id === task.assigned_to).last_name].filter(Boolean).join(' ')
                        : '—')
                    : 'Nincs kijelölve')}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Létrehozta</Typography>
                <Typography variant="body2">
                  {[task.creator_first_name, task.creator_last_name].filter(Boolean).join(' ') || '—'}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Határidő</Typography>
                <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <AccessTimeIcon sx={{ fontSize: 16 }} />
                  {fmtDate(task.due_date)}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Létrehozva</Typography>
                <Typography variant="body2">{fmtDate(task.created_at)}</Typography>
              </Grid>
              {task.related_employee_id && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">Kapcsolódó dolgozó (timeline)</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {[task.related_employee_first_name, task.related_employee_last_name].filter(Boolean).join(' ')
                        || '— (név nem elérhető)'}
                    </Typography>
                    {task.related_employee_workplace && (
                      <Chip size="small" label={task.related_employee_workplace}
                        sx={{ height: 20, fontSize: '0.7rem' }} />
                    )}
                    <Button
                      size="small"
                      onClick={() => {
                        if (onClose) onClose();
                        navigate(`/employees?highlight=${task.related_employee_id}`);
                      }}
                      sx={{ color: '#2563eb', textTransform: 'none', py: 0 }}
                    >
                      Profil megnyitása
                    </Button>
                  </Box>
                </Grid>
              )}
            </Grid>

            {/* Helpers (multi-assignees) — hidden when there are none */}
            <TaskAssigneesPanel
              taskId={taskId}
              currentUser={currentUser}
              onTaskUpdated={onChange}
            />

            {/* Status actions */}
            <Box sx={{ mt: 3 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Státusz módosítása
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {STATUS_OPTIONS.filter(s => s.value !== task.status).map(s => (
                  <Button
                    key={s.value}
                    size="small"
                    variant="outlined"
                    onClick={() => changeStatus(s.value)}
                  >
                    → {s.label}
                  </Button>
                ))}
              </Stack>
            </Box>

            {/* Comments */}
            {Array.isArray(task.comments) && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  Hozzászólások ({task.comments.length})
                </Typography>
                <Stack spacing={1} sx={{ mb: 1.5 }}>
                  {task.comments.length === 0 && (
                    <Typography variant="body2" color="text.secondary">Még nincs hozzászólás.</Typography>
                  )}
                  {task.comments.map(c => (
                    <Box key={c.id} sx={{ p: 1.25, bgcolor: '#f8fafc', borderRadius: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        {[c.first_name, c.last_name].filter(Boolean).join(' ') || c.user_name || 'Rendszer'}
                        {' · '}{new Date(c.created_at).toLocaleString('hu-HU')}
                      </Typography>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{c.comment}</Typography>
                    </Box>
                  ))}
                </Stack>

                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    fullWidth size="small"
                    placeholder="Új hozzászólás…"
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment(); } }}
                  />
                  <Button
                    variant="contained"
                    onClick={postComment}
                    disabled={postingComment || !newComment.trim()}
                    startIcon={postingComment ? <CircularProgress size={16} /> : <SendIcon />}
                    sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
                  >
                    Küldés
                  </Button>
                </Box>
              </>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        {editing ? (
          <>
            <Button onClick={() => setEditing(false)} disabled={saving}>Mégse</Button>
            <Button
              variant="contained"
              onClick={saveEdits}
              disabled={saving}
              sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
            >
              {saving ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Mentés'}
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Bezárás</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
