import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Switch, FormControlLabel, FormControl, InputLabel, Select, MenuItem, Box, Chip,
} from '@mui/material';

export default function FAQEntryFormModal({ open, onClose, onSave, entry, categories, contractors }) {
  const [formData, setFormData] = useState({
    question: '', answer: '', keywords: '', category_id: '', priority: 0, is_active: true,
  });
  // Scope: 'global' (contractor_id NULL → all residents) or 'contractor' (one partner).
  const [scope, setScope] = useState('global');
  const [scopeContractorId, setScopeContractorId] = useState('');
  const [keywordChips, setKeywordChips] = useState([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (entry) {
      const kw = entry.keywords || [];
      setFormData({
        question: entry.question || '',
        answer: entry.answer || '',
        keywords: kw.join(', '),
        category_id: entry.category_id || '',
        priority: entry.priority || 0,
        is_active: entry.is_active !== false,
      });
      setKeywordChips(kw);
      setKeywordInput('');
      setScope(entry.contractor_id ? 'contractor' : 'global');
      setScopeContractorId(entry.contractor_id || '');
    } else {
      setFormData({ question: '', answer: '', keywords: '', category_id: '', priority: 0, is_active: true });
      setKeywordChips([]);
      setKeywordInput('');
      setScope('global'); // default: visible to all residents
      setScopeContractorId('');
    }
  }, [entry, open]);

  const handleChange = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleKeywordInputChange = (e) => {
    const val = e.target.value;
    setKeywordInput(val);
    // If user types a comma, add the keyword
    if (val.endsWith(',')) {
      const newKw = val.slice(0, -1).trim();
      if (newKw && !keywordChips.includes(newKw)) {
        setKeywordChips((prev) => [...prev, newKw]);
      }
      setKeywordInput('');
    }
  };

  const handleKeywordKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const newKw = keywordInput.trim();
      if (newKw && !keywordChips.includes(newKw)) {
        setKeywordChips((prev) => [...prev, newKw]);
      }
      setKeywordInput('');
    }
    if (e.key === 'Backspace' && keywordInput === '' && keywordChips.length > 0) {
      setKeywordChips((prev) => prev.slice(0, -1));
    }
  };

  const handleDeleteChip = (kw) => {
    setKeywordChips((prev) => prev.filter((k) => k !== kw));
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      // Add any pending keyword input
      let finalKeywords = [...keywordChips];
      if (keywordInput.trim()) {
        finalKeywords.push(keywordInput.trim());
      }
      await onSave({
        question: formData.question,
        answer: formData.answer,
        keywords: finalKeywords,
        category_id: formData.category_id || null,
        priority: parseInt(formData.priority) || 0,
        is_active: formData.is_active,
        scope,
        contractor_id: scope === 'contractor' ? (scopeContractorId || null) : null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{entry ? 'Bejegyzés szerkesztése' : 'Új bejegyzés'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
        <FormControl fullWidth>
          <InputLabel>Hatókör (kik látják)</InputLabel>
          <Select value={scope} label="Hatókör (kik látják)" onChange={(e) => setScope(e.target.value)}>
            <MenuItem value="global">Globális — minden lakó látja</MenuItem>
            <MenuItem value="contractor">Adott partner lakói</MenuItem>
          </Select>
        </FormControl>

        {scope === 'contractor' && (
          <FormControl fullWidth>
            <InputLabel>Partner</InputLabel>
            <Select value={scopeContractorId} label="Partner" onChange={(e) => setScopeContractorId(e.target.value)}>
              {(contractors || []).map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        <FormControl fullWidth>
          <InputLabel>Kategória</InputLabel>
          <Select value={formData.category_id} label="Kategória" onChange={handleChange('category_id')}>
            <MenuItem value="">Nincs</MenuItem>
            {(categories || []).map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          label="Kérdés" required multiline rows={2} fullWidth value={formData.question}
          onChange={handleChange('question')}
        />

        <TextField
          label="Válasz" required multiline rows={4} fullWidth value={formData.answer}
          onChange={handleChange('answer')}
        />

        <Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
            {keywordChips.map((kw) => (
              <Chip key={kw} label={kw} size="small" onDelete={() => handleDeleteChip(kw)} color="primary" variant="outlined" />
            ))}
          </Box>
          <TextField
            label="Kulcsszavak" fullWidth placeholder="Írja be és nyomjon Enter-t vagy vesszőt..."
            value={keywordInput}
            onChange={handleKeywordInputChange}
            onKeyDown={handleKeywordKeyDown}
            helperText="Enter vagy vessző megnyomásával adhat hozzá kulcsszavakat"
          />
        </Box>

        <TextField
          label="Prioritás" type="number" value={formData.priority}
          onChange={handleChange('priority')} sx={{ width: 150 }}
        />

        <FormControlLabel
          control={<Switch checked={formData.is_active} onChange={handleChange('is_active')} />}
          label="Aktív"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Mégse</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!formData.question || !formData.answer || saving}>
          {saving ? 'Mentés...' : 'Mentés'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
