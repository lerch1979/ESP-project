import React, { useState, useEffect } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, CircularProgress, Alert, Chip, Avatar
} from '@mui/material';
import {
  Psychology, Gavel, AccountBalance, FamilyRestroom,
  Warning, Balance, Category
} from '@mui/icons-material';
import { carepathAPI } from '../../services/api';

const CATEGORY_ICONS = {
  'Pszichológiai tanácsadás': <Psychology />,
  'Jogi tanácsadás': <Gavel />,
  'Pénzügyi tanácsadás': <AccountBalance />,
  'Családi támogatás': <FamilyRestroom />,
  'Krízisintervenció': <Warning />,
  'Munka-magánélet egyensúly': <Balance />,
};

const CATEGORY_COLORS = {
  'Pszichológiai tanácsadás': '#6366f1',
  'Jogi tanácsadás': '#f59e0b',
  'Pénzügyi tanácsadás': '#10b981',
  'Családi támogatás': '#8b5cf6',
  'Krízisintervenció': '#ef4444',
  'Munka-magánélet egyensúly': '#3b82f6',
};

const ServiceCategories = () => {
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const response = await carepathAPI.getCategories();
      setCategories(response.data || []);
    } catch (err) {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
        <Category sx={{ mr: 1, verticalAlign: 'middle' }} />
        Szolgáltatás kategóriák
      </Typography>

      <Grid container spacing={3}>
        {categories.map((cat) => {
          const color = CATEGORY_COLORS[cat.category_name] || '#6366f1';
          const icon = CATEGORY_ICONS[cat.category_name] || <Psychology />;

          return (
            <Grid item xs={12} sm={6} md={4} key={cat.id}>
              <Card sx={{ height: '100%', borderLeft: `4px solid ${color}` }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Avatar sx={{ bgcolor: color + '20', color }}>
                      {icon}
                    </Avatar>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>{cat.category_name}</Typography>
                      {cat.category_name_en && (
                        <Typography variant="caption" color="text.secondary">{cat.category_name_en}</Typography>
                      )}
                    </Box>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {cat.description}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip label={cat.is_active ? 'Aktív' : 'Inaktív'} color={cat.is_active ? 'success' : 'default'} size="small" />
                    <Chip label={`#${cat.display_order}`} size="small" variant="outlined" />
                    {cat.icon_name && <Chip label={cat.icon_name} size="small" variant="outlined" />}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {categories.length === 0 && (
        <Alert severity="info">Nincs kategória. A kategóriák a migrációs szkriptben vannak definiálva.</Alert>
      )}
    </Box>
  );
};

export default ServiceCategories;
