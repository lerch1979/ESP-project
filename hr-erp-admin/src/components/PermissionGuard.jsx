import React from 'react';
import { Box, Typography, Paper, Button } from '@mui/material';
import { Lock as LockIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function PermissionGuard({ permission, anyPermission, children }) {
  const { hasPermission, hasAnyPermission } = useAuth();
  const navigate = useNavigate();

  let allowed = false;

  if (permission) {
    allowed = hasPermission(permission);
  } else if (anyPermission && Array.isArray(anyPermission)) {
    allowed = hasAnyPermission(anyPermission);
  } else {
    allowed = true;
  }

  if (!allowed) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Paper sx={{ p: 4, textAlign: 'center', maxWidth: 400 }}>
          <LockIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
            Hozzáférés megtagadva
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Nincs jogosultságod ehhez az oldalhoz.
          </Typography>
          <Button variant="contained" onClick={() => navigate('/dashboard')}>
            Vissza a kezdőlapra
          </Button>
        </Paper>
      </Box>
    );
  }

  return children;
}

export default PermissionGuard;
