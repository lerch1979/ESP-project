import React from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';

/**
 * ScoreGauge — MUI-only circular gauge showing a 0-100 score.
 * Color scales red -> yellow -> green.
 */
export default function ScoreGauge({ score, size = 120, label, thickness = 5 }) {
  const value = Math.max(0, Math.min(100, Number(score) || 0));

  // Color scale: <50 red, <70 orange, <85 yellow, >=85 green
  let color = '#ef4444';
  if (value >= 85) color = '#16a34a';
  else if (value >= 70) color = '#84cc16';
  else if (value >= 50) color = '#f59e0b';
  else if (value >= 30) color = '#f97316';

  return (
    <Box sx={{ position: 'relative', display: 'inline-flex', width: size, height: size }}>
      {/* Track */}
      <CircularProgress
        variant="determinate"
        value={100}
        size={size}
        thickness={thickness}
        sx={{ color: '#e5e7eb', position: 'absolute', left: 0 }}
      />
      {/* Actual value */}
      <CircularProgress
        variant="determinate"
        value={value}
        size={size}
        thickness={thickness}
        sx={{
          color,
          position: 'absolute',
          left: 0,
          '& .MuiCircularProgress-circle': { strokeLinecap: 'round' },
        }}
      />
      <Box
        sx={{
          position: 'absolute', top: 0, left: 0, bottom: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column',
        }}
      >
        <Typography variant="h5" sx={{ fontWeight: 700, color, lineHeight: 1 }}>
          {Math.round(value)}
        </Typography>
        {label && (
          <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.25, fontSize: '0.7rem' }}>
            {label}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
