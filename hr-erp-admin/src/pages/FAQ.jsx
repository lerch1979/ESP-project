import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
  Tooltip,
  Stack,
} from '@mui/material';
import {
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
  TextSnippet as TextSnippetIcon,
  VideoLibrary as VideoLibraryIcon,
  SupportAgent as SupportAgentIcon,
  ReportProblem as ReportProblemIcon,
} from '@mui/icons-material';
import { chatbotAPI } from '../services/api';
import { toast } from 'react-toastify';

function FAQ() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [catRes, entryRes] = await Promise.all([
        chatbotAPI.getFaqCategories(),
        chatbotAPI.getFaqEntries(),
      ]);
      setCategories(catRes.data || catRes || []);
      setEntries(entryRes.data || entryRes || []);
    } catch (error) {
      toast.error('FAQ adatok betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  };

  const normalize = (str) =>
    (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[-_\s]/g, '');

  const filteredEntries = useMemo(() => {
    if (!search.trim()) return entries;
    const searchNormalized = normalize(search);
    return entries.filter(
      (e) =>
        normalize(e.question).includes(searchNormalized) ||
        normalize(e.answer).includes(searchNormalized) ||
        (e.keywords && e.keywords.some((kw) => normalize(kw).includes(searchNormalized)))
    );
  }, [entries, search]);

  const entriesByCategory = useMemo(() => {
    const map = {};
    filteredEntries.forEach((entry) => {
      const catId = entry.category_id || 'uncategorized';
      if (!map[catId]) map[catId] = [];
      map[catId].push(entry);
    });
    return map;
  }, [filteredEntries]);

  const visibleCategories = useMemo(() => {
    return categories.filter((cat) => {
      const catEntries = entriesByCategory[cat.id];
      return catEntries && catEntries.length > 0;
    });
  }, [categories, entriesByCategory]);

  const handleCategoryToggle = (catId) => {
    setExpandedCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  return (
    <Box>
      {/* Header */}
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
        Gyakran Ismételt Kérdések (FAQ)
      </Typography>

      {/* Search */}
      <TextField
        placeholder="Keresés a kérdések között..."
        size="small"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 3, width: { xs: '100%', sm: 400 } }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ color: '#94a3b8' }} />
            </InputAdornment>
          ),
        }}
      />

      {/* Content */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress sx={{ color: '#2563eb' }} />
        </Box>
      ) : visibleCategories.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <ReportProblemIcon sx={{ fontSize: 48, color: '#94a3b8', mb: 1 }} />
          <Typography variant="h6" color="text.secondary">
            {search ? 'Nem találtunk választ a keresésedre.' : 'Nincsenek FAQ bejegyzések'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
            {search
              ? 'Próbáld meg más kulcsszavakkal, vagy nyiss hibajegyet.'
              : 'Még nincsenek GYIK kérdések felvéve.'}
          </Typography>
          {search && (
            <Button
              variant="contained"
              startIcon={<SupportAgentIcon />}
              onClick={() => navigate('/tickets')}
              sx={{
                bgcolor: '#2563eb',
                '&:hover': { bgcolor: '#1d4ed8' },
                px: 4,
                py: 1.2,
                borderRadius: 2,
                fontWeight: 600,
              }}
            >
              Hibajegy nyitása
            </Button>
          )}
        </Box>
      ) : (
        <Box>
          {visibleCategories.map((cat) => (
            <Accordion
              key={cat.id}
              expanded={!!expandedCategories[cat.id]}
              onChange={() => handleCategoryToggle(cat.id)}
              sx={{
                mb: 2,
                borderRadius: '12px !important',
                '&:before': { display: 'none' },
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  bgcolor: '#f1f5f9',
                  borderRadius: expandedCategories[cat.id]
                    ? '12px 12px 0 0'
                    : '12px',
                  minHeight: 56,
                  '& .MuiAccordionSummary-content': { my: 1 },
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {cat.name}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ ml: 1.5, color: '#64748b', alignSelf: 'center' }}
                >
                  ({entriesByCategory[cat.id]?.length || 0})
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
                {(entriesByCategory[cat.id] || []).map((entry) => (
                  <Accordion
                    key={entry.id}
                    sx={{
                      boxShadow: 'none',
                      '&:before': { display: 'none' },
                      '&:not(:last-child)': {
                        borderBottom: '1px solid #e2e8f0',
                      },
                    }}
                  >
                    <AccordionSummary
                      expandIcon={<ExpandMoreIcon sx={{ fontSize: 20 }} />}
                      sx={{
                        px: 3,
                        minHeight: 48,
                        '& .MuiAccordionSummary-content': { my: 0.5 },
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {entry.question}
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: 3, pt: 0, pb: 2 }}>
                      <Typography
                        variant="body2"
                        sx={{ color: '#475569', whiteSpace: 'pre-line', mb: 2 }}
                      >
                        {entry.answer}
                      </Typography>
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<TextSnippetIcon />}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(entry.answer);
                            toast.success('Szöveg vágólapra másolva');
                          }}
                        >
                          Szöveg
                        </Button>
                        <Tooltip title="Hamarosan" arrow>
                          <span>
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<VideoLibraryIcon />}
                              disabled
                            >
                              Videó
                            </Button>
                          </span>
                        </Tooltip>
                      </Stack>
                    </AccordionDetails>
                  </Accordion>
                ))}
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}

      {/* Bottom CTA */}
      <Box sx={{ textAlign: 'center', mt: 4, mb: 2 }}>
        <Button
          variant="outlined"
          color="secondary"
          startIcon={<ReportProblemIcon />}
          onClick={() => navigate('/tickets')}
          sx={{
            px: 4,
            py: 1.2,
            borderRadius: 2,
            fontWeight: 600,
          }}
        >
          Nem találod a választ? Nyiss hibajegyet
        </Button>
      </Box>
    </Box>
  );
}

export default FAQ;
