import React, { useMemo } from 'react';
import {
  Box, Typography, Chip, Table, TableBody, TableCell, TableHead, TableRow,
  TableContainer, Paper, LinearProgress,
} from '@mui/material';

const SEVERITY = {
  ok:       { label: 'Rendben',    color: 'success' },
  minor:    { label: 'Enyhe',      color: 'info' },
  major:    { label: 'Súlyos',     color: 'warning' },
  critical: { label: 'Kritikus',   color: 'error' },
};

/**
 * InspectionChecklist — groups scores by category and renders per-item scoring grid.
 * Props:
 *   scores:     [{ id, checklist_item_id, item_code, item_name, category_id, score, max_score, severity, notes }]
 *   categories: [{ id, name }]
 */
export default function InspectionChecklist({ scores = [], categories = [] }) {
  const groups = useMemo(() => {
    const byCat = new Map();
    (scores || []).forEach((s) => {
      const key = s.category_id ?? 'uncat';
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key).push(s);
    });
    return Array.from(byCat.entries()).map(([catId, items]) => {
      const cat = categories.find((c) => c.id === catId);
      return {
        categoryId: catId,
        categoryName: cat?.name || 'Besorolatlan',
        items,
        sumScore: items.reduce((a, b) => a + (Number(b.score) || 0), 0),
        sumMax: items.reduce((a, b) => a + (Number(b.max_score) || 0), 0),
      };
    });
  }, [scores, categories]);

  if (!scores || scores.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">
          Nincs pontozás — az ellenőrzés még nem kezdődött el vagy üres.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      {groups.map((g) => {
        const pct = g.sumMax > 0 ? (g.sumScore / g.sumMax) * 100 : 0;
        return (
          <Paper key={g.categoryId} variant="outlined" sx={{ mb: 2, overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.5, bgcolor: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {g.categoryName}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {g.sumScore.toFixed(1)} / {g.sumMax.toFixed(1)} ({pct.toFixed(0)}%)
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={pct}
                sx={{
                  height: 6, borderRadius: 3,
                  '& .MuiLinearProgress-bar': {
                    bgcolor: pct >= 85 ? '#16a34a' : pct >= 70 ? '#84cc16' : pct >= 50 ? '#f59e0b' : '#ef4444',
                  },
                }}
              />
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, width: 100 }}>Kód</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Tétel</TableCell>
                    <TableCell sx={{ fontWeight: 600, width: 120 }} align="right">Pontszám</TableCell>
                    <TableCell sx={{ fontWeight: 600, width: 120 }}>Súlyosság</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Megjegyzés</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {g.items.map((row) => {
                    const sev = SEVERITY[row.severity] || null;
                    return (
                      <TableRow key={row.id || row.checklist_item_id} hover>
                        <TableCell>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                            {row.item_code || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>{row.item_name || '-'}</TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {Number(row.score ?? 0).toFixed(1)} / {Number(row.max_score ?? 0).toFixed(1)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {sev ? <Chip size="small" color={sev.color} label={sev.label} /> : <Chip size="small" label="—" variant="outlined" />}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                            {row.notes || ''}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        );
      })}
    </Box>
  );
}
