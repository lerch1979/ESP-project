import React, { useState } from 'react';
import { Box, Button, Typography, Stack } from '@mui/material';
import BrunoCharacter from '../components/Bruno/BrunoCharacter';

const STATES = ['idle', 'listening', 'thinking', 'talking', 'happy', 'sad', 'waving', 'celebrating', 'dancing', 'surprised'];

export default function BrunoTest() {
  const [state, setState] = useState('idle');

  return (
    <Box sx={{ p: 4, textAlign: 'center' }}>
      <Typography variant="h4" sx={{ mb: 4, fontWeight: 700 }}>Bruno Animation Test</Typography>

      <Box sx={{ my: 4, display: 'flex', justifyContent: 'center' }}>
        <BrunoCharacter state={state} size={180} showLabel />
      </Box>

      <Typography variant="h6" sx={{ mb: 2 }}>
        State: <strong>{state}</strong>
      </Typography>

      <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap>
        {STATES.map((s) => (
          <Button
            key={s}
            variant={state === s ? 'contained' : 'outlined'}
            size="small"
            onClick={() => setState(s)}
          >
            {s}
          </Button>
        ))}
      </Stack>
    </Box>
  );
}
