import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TextField,
  InputAdornment,
  Paper,
  Popper,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Box,
  ClickAwayListener,
  Divider,
} from '@mui/material';
import {
  Search as SearchIcon,
  People as PeopleIcon,
  ConfirmationNumber as TicketIcon,
  Apartment as ApartmentIcon,
  Business as BusinessIcon,
} from '@mui/icons-material';
import { searchAPI } from '../services/api';

const CATEGORY_CONFIG = {
  employees: { label: 'Munkavállalók', icon: <PeopleIcon fontSize="small" />, basePath: '/employees' },
  tickets: { label: 'Hibajegyek', icon: <TicketIcon fontSize="small" />, basePath: '/tickets' },
  accommodations: { label: 'Szálláshelyek', icon: <ApartmentIcon fontSize="small" />, basePath: '/accommodations' },
  contractors: { label: 'Alvállalkozók', icon: <BusinessIcon fontSize="small" />, basePath: '/contractors' },
};

function GlobalSearchBar() {
  const navigate = useNavigate();
  const [queryText, setQueryText] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const debounceRef = useRef(null);

  const doSearch = useCallback(async (q) => {
    if (!q || q.trim().length < 2) {
      setResults(null);
      setOpen(false);
      return;
    }

    setLoading(true);
    try {
      const response = await searchAPI.global(q.trim());
      if (response.success) {
        setResults(response.data);
        setOpen(true);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e) => {
    const value = e.target.value;
    setQueryText(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      doSearch(value);
    }, 300);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleResultClick = (category, item) => {
    setOpen(false);
    setQueryText('');
    setResults(null);

    if (category === 'employees') {
      // Navigate to employees page - the detail modal pattern is handled there
      navigate('/employees', { state: { openEmployeeId: item.id } });
    } else if (category === 'tickets') {
      navigate('/tickets', { state: { openTicketId: item.id } });
    } else if (category === 'accommodations') {
      navigate('/accommodations');
    } else if (category === 'contractors') {
      navigate('/contractors');
    }
  };

  const getItemLabel = (category, item) => {
    if (category === 'employees') {
      return `${item.name?.trim() || ''} ${item.employee_number ? `(${item.employee_number})` : ''}`;
    }
    if (category === 'tickets') {
      return `${item.ticket_number || ''} - ${item.title || ''}`;
    }
    return item.name || '';
  };

  const hasResults = results && Object.values(results).some(arr => arr.length > 0);

  return (
    <ClickAwayListener onClickAway={handleClose}>
      <Box sx={{ position: 'relative', width: { xs: 200, sm: 300, md: 400 } }} ref={anchorRef}>
        <TextField
          size="small"
          placeholder="Keresés..."
          value={queryText}
          onChange={handleChange}
          onFocus={() => {
            if (results && hasResults) setOpen(true);
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                {loading ? <CircularProgress size={18} /> : <SearchIcon sx={{ color: '#94a3b8' }} />}
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: '#f1f5f9',
              borderRadius: 2,
              '& fieldset': { border: 'none' },
              '&:hover': { bgcolor: '#e2e8f0' },
              '&.Mui-focused': { bgcolor: 'white', boxShadow: '0 0 0 2px rgba(37,99,235,0.2)' },
            },
            width: '100%',
          }}
        />

        <Popper
          open={open && queryText.length >= 2}
          anchorEl={anchorRef.current}
          placement="bottom-start"
          style={{ zIndex: 1300, width: anchorRef.current?.offsetWidth || 400 }}
        >
          <Paper
            elevation={8}
            sx={{
              mt: 0.5,
              maxHeight: 420,
              overflow: 'auto',
              borderRadius: 2,
            }}
          >
            {!hasResults ? (
              <Box sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Nincs találat
                </Typography>
              </Box>
            ) : (
              Object.entries(results).map(([category, items]) => {
                if (!items || items.length === 0) return null;
                const config = CATEGORY_CONFIG[category];
                if (!config) return null;

                return (
                  <Box key={category}>
                    <Typography
                      variant="caption"
                      sx={{
                        px: 2,
                        py: 0.75,
                        display: 'block',
                        fontWeight: 700,
                        color: '#64748b',
                        textTransform: 'uppercase',
                        fontSize: '0.7rem',
                        letterSpacing: 0.5,
                      }}
                    >
                      {config.label}
                    </Typography>
                    <List dense disablePadding>
                      {items.map((item) => (
                        <ListItemButton
                          key={item.id}
                          onClick={() => handleResultClick(category, item)}
                          sx={{
                            py: 0.75,
                            px: 2,
                            '&:hover': { bgcolor: 'rgba(37, 99, 235, 0.06)' },
                          }}
                        >
                          <ListItemIcon sx={{ minWidth: 32, color: '#2563eb' }}>
                            {config.icon}
                          </ListItemIcon>
                          <ListItemText
                            primary={getItemLabel(category, item)}
                            primaryTypographyProps={{
                              variant: 'body2',
                              noWrap: true,
                            }}
                          />
                        </ListItemButton>
                      ))}
                    </List>
                    <Divider />
                  </Box>
                );
              })
            )}
          </Paper>
        </Popper>
      </Box>
    </ClickAwayListener>
  );
}

export default GlobalSearchBar;
