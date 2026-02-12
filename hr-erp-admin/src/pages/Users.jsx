import React from 'react';
import { Box, Typography, Paper } from '@mui/material';

function Users() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
        Felhasználók
      </Typography>
      
      <Paper sx={{ p: 3, textAlign: 'center', minHeight: 400 }}>
        <Typography variant="h6" color="text.secondary" sx={{ mt: 10 }}>
          🎯 Sprint 4-ben elkészül!
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Felhasználók kezelése, szerepkörök
        </Typography>
      </Paper>
    </Box>
  );
}

export default Users;
