import React from 'react';
import { Box, Card, Typography } from '@mui/material';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

/**
 * TrendChart — monthly score trend using recharts.
 * data: [{ month, avg_score, avg_technical, avg_hygiene, avg_aesthetic }]
 */
export default function TrendChart({ data = [], height = 300 }) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <Card variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Nincs adat a trendhez — legalább egy befejezett ellenőrzés szükséges.
        </Typography>
      </Card>
    );
  }

  return (
    <Box sx={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="avg_score" name="Összpontszám" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="avg_technical" name="Műszaki" stroke="#10b981" strokeWidth={1.5} dot={{ r: 2 }} />
          <Line type="monotone" dataKey="avg_hygiene" name="Higiéniai" stroke="#f59e0b" strokeWidth={1.5} dot={{ r: 2 }} />
          <Line type="monotone" dataKey="avg_aesthetic" name="Esztétikai" stroke="#ec4899" strokeWidth={1.5} dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
