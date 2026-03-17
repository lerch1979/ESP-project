import React from 'react';
import { Card, CardContent, Typography, Box, LinearProgress } from '@mui/material';
import { TrendingUp, TrendingDown, TrendingFlat } from '@mui/icons-material';

const getColor = (idx) => {
  if (idx >= 70) return '#4caf50';
  if (idx >= 50) return '#ff9800';
  return '#f44336';
};

const getMuiColor = (idx) => {
  if (idx >= 70) return 'success';
  if (idx >= 50) return 'warning';
  return 'error';
};

const getLabel = (idx) => {
  if (idx >= 70) return 'Egészséges';
  if (idx >= 50) return 'Figyelendő';
  return 'Beavatkozás szükséges';
};

const WellbeingIndexCard = ({ index = 0, label = 'Wellbeing Index', trend = null, size = 'medium' }) => {
  const fontSize = size === 'large' ? 'h2' : size === 'small' ? 'h5' : 'h3';
  const color = getColor(index);

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography color="text.secondary" variant="body2" gutterBottom>{label}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <Typography variant={fontSize} sx={{ fontWeight: 700, color }}>{index}</Typography>
          <Typography variant="body2" color="text.secondary">/100</Typography>
          {trend !== null && (
            <Box sx={{ display: 'flex', alignItems: 'center', ml: 'auto', gap: 0.5 }}>
              {trend > 0 ? <TrendingUp color="success" fontSize="small" /> :
               trend < 0 ? <TrendingDown color="error" fontSize="small" /> :
               <TrendingFlat color="action" fontSize="small" />}
              <Typography variant="body2" color="text.secondary">
                {trend > 0 ? '+' : ''}{trend}%
              </Typography>
            </Box>
          )}
        </Box>
        <LinearProgress variant="determinate" value={Math.min(100, Math.max(0, index))}
          color={getMuiColor(index)} sx={{ mt: 1.5, height: 8, borderRadius: 4 }} />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          {getLabel(index)}
        </Typography>
      </CardContent>
    </Card>
  );
};

export default WellbeingIndexCard;
