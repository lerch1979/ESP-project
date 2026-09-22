import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, FormControl, InputLabel, Select, MenuItem,
  Grid, CircularProgress, Autocomplete,
  Chip, Divider, Typography, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import { ticketsAPI, employeesAPI, accommodationsAPI } from '../services/api';
import { toast } from 'react-toastify';
import api from '../services/api';

/**
 * Edit ticket fields that are available on CreateTicketModal, plus nothing
 * else — status has its own dedicated update flow (updateStatus API).
 */
export default function EditTicketModal({ open, ticket, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  // optionsReady gates form population so we never assign a category_id /
  // priority_id / assigned_to to a Select before its MenuItem children exist
  // (which would trigger MUI's "out-of-range value" warning).
  const [optionsReady, setOptionsReady] = useState(false);
  const [accommodations, setAccommodations] = useState([]);
  // Ugyanaz a két, egymást kizáró mód, mint a létrehozásnál — lásd CreateTicketModal.
  const [mod, setMod] = useState('emberek');
  const [erintettek, setErintettek] = useState([]);
  const [hatokorSzallas, setHatokorSzallas] = useState(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    category_id: '',
    priority_id: '',
    assigned_to: '',
    linked_employee_id: '',
  });

  // Step 1: when dialog opens, load lookups and flip optionsReady when done.
  // Reset optionsReady on close so reopening triggers a fresh load.
  useEffect(() => {
    if (!open) {
      setOptionsReady(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [usersRes, categoriesRes, prioritiesRes] = await Promise.allSettled([
          api.get('/users'),
          ticketsAPI.getCategories(),
          ticketsAPI.getPriorities(),
          accommodationsAPI.getAll({ limit: 500 })
            .then((r) => setAccommodations(r.data?.accommodations || r.data || []))
            .catch(() => setAccommodations([])),
        ]);
        if (cancelled) return;
        if (usersRes.status === 'fulfilled' && usersRes.value.data.success) {
          setUsers(usersRes.value.data.data.users || []);
        }
        if (categoriesRes.status === 'fulfilled' && categoriesRes.value.success) {
          const data = categoriesRes.value.data;
          setCategories(data.tree?.length ? data.tree : (data.categories || []));
        }
        if (prioritiesRes.status === 'fulfilled' && prioritiesRes.value.success) {
          setPriorities(prioritiesRes.value.data.priorities || []);
        }
        setEmployeesLoading(true);
        try {
          const empRes = await employeesAPI.getAll({ limit: 1000 });
          if (!cancelled && empRes?.success) setEmployees(empRes.data?.employees || []);
        } finally {
          if (!cancelled) setEmployeesLoading(false);
        }
      } catch (err) {
        if (!cancelled) toast.error('Hiba az űrlap adatok betöltésekor');
      } finally {
        if (!cancelled) setOptionsReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Step 2: once options are loaded AND we have a ticket, hydrate the form.
  // Until then, form stays at its empty defaults so Selects show the "Nincs"
  // placeholder cleanly.
  useEffect(() => {
    if (!optionsReady || !ticket) return;
    setForm({
      title: ticket.title || '',
      description: ticket.description || '',
      category_id: ticket.category_id || '',
      priority_id: ticket.priority_id || '',
      assigned_to: ticket.assigned_to || '',
      linked_employee_id: ticket.linked_employee?.id || ticket.linked_employee_id || '',
    });
    // A JELENLEGI állapot betöltése. Enélkül az űrlap üres listát mutatna, és egy
    // mentés NÉMÁN levenné az összes eddigi érintettet a jegyről.
    const hazHatokor = ticket.scope === 'accommodation' && ticket.scope_accommodation_id;
    setMod(hazHatokor ? 'szallas' : 'emberek');
    setErintettek(ticket.affected_employees || []);
    setHatokorSzallas(hazHatokor
      ? { id: ticket.scope_accommodation_id, name: ticket.scope_accommodation_name || '' }
      : null);
  }, [optionsReady, ticket]);

  const submit = async () => {
    if (!form.title.trim()) return toast.warn('A cím kötelező');
    setLoading(true);
    try {
      // Only send fields that actually changed, so ticket_history stays clean.
      const patch = {};
      const src = {
        title: ticket.title || '',
        description: ticket.description || '',
        category_id: ticket.category_id || '',
        priority_id: ticket.priority_id || '',
        assigned_to: ticket.assigned_to || '',
        linked_employee_id: ticket.linked_employee?.id || ticket.linked_employee_id || '',
      };
      for (const k of Object.keys(form)) {
        if ((form[k] || '') !== (src[k] || '')) patch[k] = form[k];
      }
      // Az érintettek a `patch`-en kívül utaznak: nem a tickets tábla oszlopai.
      // Csak akkor küldjük, ha TÉNYLEG változott — különben minden mentés fölöslegesen
      // újraírná a kapcsolótáblát és tele szemetelné a jegy történetét.
      const eredetiIdk = (ticket.affected_employees || []).map((e) => e.id).sort();
      const mostaniIdk = erintettek.map((e) => e.id).sort();
      const eredetiHazHatokor = ticket.scope === 'accommodation'
        ? (ticket.scope_accommodation_id || null) : null;
      const mostaniHazHatokor = mod === 'szallas' ? (hatokorSzallas?.id || null) : null;

      if (mostaniHazHatokor !== eredetiHazHatokor) {
        patch.scope_accommodation_id = mostaniHazHatokor;
      }
      if (mod === 'emberek' && JSON.stringify(eredetiIdk) !== JSON.stringify(mostaniIdk)) {
        patch.affected_employee_ids = mostaniIdk;
      }

      if (Object.keys(patch).length === 0) {
        toast.info('Nincs változás');
        return onClose();
      }
      const res = await ticketsAPI.update(ticket.id, patch);
      if (res.success) {
        toast.success('Hibajegy frissítve');
        if (onSuccess) onSuccess(res.data?.ticket);
        onClose();
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Frissítés sikertelen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={loading ? null : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 600, fontSize: '1.5rem' }}>Hibajegy szerkesztése</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12}>
            <TextField
              fullWidth required label="Cím"
              value={form.title}
              onChange={e => setForm(s => ({ ...s, title: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth multiline rows={4} label="Részletes leírás"
              value={form.description}
              onChange={e => setForm(s => ({ ...s, description: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Kategória</InputLabel>
              <Select
                value={form.category_id}
                onChange={e => setForm(s => ({ ...s, category_id: e.target.value }))}
                label="Kategória"
              >
                <MenuItem value=""><em>Nincs</em></MenuItem>
                {categories.flatMap((cat) => {
                  if (Array.isArray(cat.children) && cat.children.length > 0) {
                    return [
                      <MenuItem
                        key={`p-${cat.id}`}
                        value={`__parent_${cat.id}`}
                        disabled
                        sx={{ bgcolor: '#f8fafc', fontWeight: 700, opacity: '1 !important' }}
                      >
                        {cat.icon} {cat.name}
                      </MenuItem>,
                      ...cat.children.map((c) => (
                        <MenuItem key={c.id} value={c.id} sx={{ pl: 4 }}>
                          {c.icon} {c.name}
                        </MenuItem>
                      )),
                    ];
                  }
                  return [
                    <MenuItem key={cat.id} value={cat.id}>
                      {cat.icon} {cat.name}
                    </MenuItem>,
                  ];
                })}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Prioritás</InputLabel>
              <Select
                value={form.priority_id}
                onChange={e => setForm(s => ({ ...s, priority_id: e.target.value }))}
                label="Prioritás"
              >
                <MenuItem value=""><em>Nincs</em></MenuItem>
                {priorities.map(p => (
                  <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <FormControl fullWidth>
              <InputLabel>Felelős</InputLabel>
              <Select
                value={form.assigned_to}
                onChange={e => setForm(s => ({ ...s, assigned_to: e.target.value }))}
                label="Felelős"
              >
                <MenuItem value=""><em>Nincs kijelölve</em></MenuItem>
                {users.map(u => (
                  <MenuItem key={u.id} value={u.id}>
                    {u.first_name} {u.last_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <Autocomplete
              options={employees}
              loading={employeesLoading}
              value={employees.find(e => e.id === form.linked_employee_id) || null}
              onChange={(_, val) => setForm(s => ({ ...s, linked_employee_id: val?.id || '' }))}
              getOptionLabel={(e) => {
                const name = [e.first_name, e.last_name].filter(Boolean).join(' ');
                const room = e.room_number ? `${e.room_number}. szoba` : null;
                const where = [e.accommodation_name, room].filter(Boolean).join(', ');
                return where ? `${name} (${where})` : name;
              }}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => (
                <TextField {...params} label="Kapcsolódó dolgozó" placeholder="Keress név vagy szállás alapján" />
              )}
              noOptionsText="Nincs találat"
              clearText="Törlés"
            />
          </Grid>

          {/* ─── KIT ÉRINT MÉG — utólag is módosítható ─────────────────────────
              A valóságban gyakran a bejelentés UTÁN derül ki, hogy a szomszéd szobát
              is érinti. Eddig ilyenkor új jegyet kellett nyitni. */}
          <Grid item xs={12}>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Kit érint még?</Typography>
            <ToggleButtonGroup
              value={mod}
              exclusive
              size="small"
              onChange={(_, v) => { if (v) setMod(v); }}
              sx={{ mb: 2 }}
            >
              <ToggleButton value="emberek">Kiválasztott lakók</ToggleButton>
              <ToggleButton value="szallas">Egész szállás</ToggleButton>
            </ToggleButtonGroup>

            {mod === 'emberek' ? (
              <Autocomplete
                multiple
                options={employees}
                loading={employeesLoading}
                value={erintettek}
                onChange={(_, val) => setErintettek(val)}
                getOptionLabel={(e) => {
                  const name = [e.first_name, e.last_name].filter(Boolean).join(' ');
                  const room = e.room_number ? `${e.room_number}. szoba` : null;
                  const where = [e.accommodation_name, room].filter(Boolean).join(', ');
                  return where ? `${name} (${where})` : name;
                }}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                renderTags={(value, getTagProps) =>
                  value.map((e, i) => (
                    <Chip
                      {...getTagProps({ index: i })}
                      key={e.id}
                      size="small"
                      label={[e.first_name, e.last_name].filter(Boolean).join(' ')}
                    />
                  ))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Érintett lakók"
                    placeholder="Keress név vagy szállás alapján"
                    helperText="Az újonnan felvettek értesítést kapnak; aki eddig is rajta volt, nem kap újat."
                  />
                )}
                noOptionsText="Nincs találat"
              />
            ) : (
              <Autocomplete
                options={accommodations}
                value={hatokorSzallas}
                onChange={(_, val) => setHatokorSzallas(val)}
                getOptionLabel={(a) => a.name || ''}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Szállás"
                    placeholder="Melyik házat érinti?"
                    helperText="A ház minden lakója látja. A névsor törlődik — vegyes szálláson így nem szivárog más megbízó dolgozójának neve."
                  />
                )}
                noOptionsText="Nincs találat"
              />
            )}
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>Mégse</Button>
        <Button
          onClick={submit}
          variant="contained"
          disabled={loading}
          sx={{ bgcolor: '#8B6B33', '&:hover': { bgcolor: '#6f552a' } }}
        >
          {loading ? <CircularProgress size={22} sx={{ color: 'white' }} /> : 'Mentés'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
