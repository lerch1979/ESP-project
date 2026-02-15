import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Chip,
  CircularProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
} from '@mui/icons-material';

const MAX_FILTERS_DEFAULT = 10;

const emptyFilter = () => ({ field: '', value: '' });

export default function FilterBuilder({
  fields = [],
  presetValues = {},
  dynamicOptions = {},
  onFilter,
  resultCount = null,
  loading = false,
  maxFilters = MAX_FILTERS_DEFAULT,
}) {
  const [filters, setFilters] = useState([emptyFilter()]);

  const addFilter = () => {
    if (filters.length < maxFilters) {
      setFilters(prev => [...prev, emptyFilter()]);
    }
  };

  const removeFilter = (index) => {
    setFilters(prev =>
      prev.length > 1
        ? prev.filter((_, i) => i !== index)
        : [emptyFilter()]
    );
  };

  const updateFilter = (index, key, val) => {
    setFilters(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [key]: val };
      if (key === 'field') updated[index].value = '';
      return updated;
    });
  };

  const getUsedFields = (excludeIndex) => {
    return filters
      .filter((_, i) => i !== excludeIndex)
      .map(f => f.field)
      .filter(Boolean);
  };

  const getValueOptions = (fieldKey) => {
    if (!fieldKey) return [];
    if (presetValues[fieldKey]) return presetValues[fieldKey];
    if (dynamicOptions[fieldKey]) return dynamicOptions[fieldKey];
    return [];
  };

  const handleFilter = () => {
    const activeFilters = filters.filter(f => f.field && f.value);
    if (onFilter) onFilter(activeFilters);
  };

  const handleClear = () => {
    setFilters([emptyFilter()]);
    if (onFilter) onFilter([]);
  };

  const hasActiveFilters = filters.some(f => f.field && f.value);

  return (
    <Paper sx={{ p: 2.5, mb: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
        Szűrők
      </Typography>

      {filters.map((filter, index) => {
        const usedFields = getUsedFields(index);
        const valueOptions = getValueOptions(filter.field);
        return (
          <Box
            key={index}
            sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}
          >
            <FormControl size="small" sx={{ minWidth: 180, flex: 1 }}>
              <InputLabel>Szűrő mező</InputLabel>
              <Select
                value={filter.field}
                onChange={e => updateFilter(index, 'field', e.target.value)}
                label="Szűrő mező"
              >
                <MenuItem value=""><em>Válasszon...</em></MenuItem>
                {fields.map(f => (
                  <MenuItem key={f.key} value={f.key} disabled={usedFields.includes(f.key)}>
                    {f.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 220, flex: 1.4 }} disabled={!filter.field}>
              <InputLabel>Érték</InputLabel>
              <Select
                value={filter.value}
                onChange={e => updateFilter(index, 'value', e.target.value)}
                label="Érték"
              >
                <MenuItem value=""><em>Válasszon...</em></MenuItem>
                {valueOptions.map(opt => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <IconButton size="small" onClick={() => removeFilter(index)} sx={{ color: '#d32f2f' }}>
              <RemoveIcon fontSize="small" />
            </IconButton>
          </Box>
        );
      })}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={addFilter}
          disabled={filters.length >= maxFilters}
          sx={{ color: '#2c5f2d' }}
        >
          Szűrő hozzáadása
        </Button>
        <Typography variant="caption" color="text.secondary">
          {filters.length}/{maxFilters} szűrő
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
        <Button
          variant="contained"
          onClick={handleFilter}
          disabled={loading}
          sx={{ bgcolor: '#2c5f2d', '&:hover': { bgcolor: '#234d24' } }}
        >
          {loading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Szűrés'}
        </Button>

        {hasActiveFilters && (
          <Button size="small" onClick={handleClear}>
            Szűrők törlése
          </Button>
        )}

        {resultCount !== null && (
          <Chip
            label={`${resultCount} találat`}
            color="primary"
            sx={{ bgcolor: '#2c5f2d', fontWeight: 600 }}
          />
        )}
      </Box>
    </Paper>
  );
}
