import React from 'react';
import { Navigate } from 'react-router-dom';
import { Box, Paper, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

/**
 * Where "/" and any unknown path should land, for THIS user.
 *
 * Both the index route and the `*` catch-all used to hardcode /dashboard. That is fine
 * while every account is a superadmin, but it breaks the moment a genuinely limited role
 * exists: an external sales agent holds no `dashboard.view`, so the app would send them
 * straight to a "Hozzáférés megtagadva" screen with no way forward — the role would be
 * unusable even though everything it *is* allowed to do works.
 *
 * So resolve the landing page from what the user can actually open. Order is
 * most-specific-first: a confined role matches its own module before the generic
 * dashboard is considered.
 */
const LANDING_ROUTES = [
  { path: '/sales',     permission: 'sales.leads.view' },   // external sales agent (Phase 4)
  { path: '/dashboard', permission: 'dashboard.view' },     // ordinary staff
  { path: '/teendok',   permission: 'tasks.view' },
  { path: '/tickets',   permission: 'tickets.view' },
];

function HomeRedirect() {
  const { hasPermission } = useAuth();

  const target = LANDING_ROUTES.find((r) => hasPermission(r.permission));
  if (target) return <Navigate to={target.path} replace />;

  // No landing page at all means the account holds no usable permission. Say so in place
  // rather than redirecting — every candidate target would itself deny, and the catch-all
  // would send the user back here, which is an infinite loop.
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <Paper sx={{ p: 4, textAlign: 'center', maxWidth: 420 }}>
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
          Nincs elérhető oldal
        </Typography>
        <Typography variant="body1" color="text.secondary">
          A fiókodhoz még nincs jogosultság rendelve. Kérlek, fordulj az adminisztrátorhoz.
        </Typography>
      </Paper>
    </Box>
  );
}

export default HomeRedirect;
