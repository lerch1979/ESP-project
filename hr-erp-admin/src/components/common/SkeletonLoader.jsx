import React from 'react';
import { Box, Skeleton, Paper } from '@mui/material';

/**
 * Table skeleton loader — mimics a data table with header + rows
 */
export function TableSkeleton({ rows = 5, columns = 4 }) {
  return (
    <Paper sx={{ p: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} variant="rectangular" height={36} sx={{ flex: 1, borderRadius: 1 }} />
        ))}
      </Box>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <Box key={i} sx={{ display: 'flex', gap: 2, mb: 1.5 }}>
          {Array.from({ length: columns }).map((_, j) => (
            <Skeleton key={j} variant="rectangular" height={28} sx={{ flex: 1, borderRadius: 1 }} />
          ))}
        </Box>
      ))}
    </Paper>
  );
}

/**
 * Card skeleton loader — mimics a stat/info card
 */
export function CardSkeleton({ count = 4 }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: `repeat(${Math.min(count, 4)}, 1fr)` }, gap: 2 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Paper key={i} sx={{ p: 2 }}>
          <Skeleton variant="text" width="60%" height={20} />
          <Skeleton variant="text" width="40%" height={36} sx={{ mt: 1 }} />
          <Skeleton variant="rectangular" height={8} sx={{ mt: 2, borderRadius: 1 }} />
        </Paper>
      ))}
    </Box>
  );
}

/**
 * Chart skeleton loader — mimics a chart area
 */
export function ChartSkeleton({ height = 300 }) {
  return (
    <Paper sx={{ p: 2 }}>
      <Skeleton variant="text" width="30%" height={24} sx={{ mb: 2 }} />
      <Skeleton variant="rectangular" height={height} sx={{ borderRadius: 2 }} />
    </Paper>
  );
}

/**
 * Page skeleton — combines cards + table for a typical list page
 */
export function PageSkeleton() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <CardSkeleton count={4} />
      <TableSkeleton rows={8} columns={5} />
    </Box>
  );
}

export default { TableSkeleton, CardSkeleton, ChartSkeleton, PageSkeleton };
