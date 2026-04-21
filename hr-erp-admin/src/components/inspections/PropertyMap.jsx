import React from 'react';
import {
  Box, Card, CardContent, Typography, List, ListItem, ListItemText, ListItemIcon, Chip,
} from '@mui/material';
import { LocationOn as LocationOnIcon, Info as InfoIcon } from '@mui/icons-material';

/**
 * PropertyMap — fallback implementation when leaflet/react-leaflet are not installed.
 * Renders a list of properties with their GPS coordinates.
 * To enable a real map, install react-leaflet + leaflet.
 */
export default function PropertyMap({ properties = [], height = 360 }) {
  const withCoords = (properties || []).filter(
    (p) => p && (p.gpsLatitude || p.gps_latitude) && (p.gpsLongitude || p.gps_longitude),
  );

  return (
    <Card variant="outlined" sx={{ bgcolor: '#f8fafc' }}>
      <CardContent sx={{ minHeight: height }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <InfoIcon color="action" fontSize="small" />
          <Typography variant="subtitle2" color="text.secondary">
            Térkép nézet — a leaflet csomag nincs telepítve. Egyszerű listás nézet:
          </Typography>
        </Box>

        {withCoords.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">
              Nincs GPS koordinátával rendelkező ingatlan.
            </Typography>
          </Box>
        ) : (
          <List dense>
            {withCoords.map((p) => {
              const lat = p.gpsLatitude ?? p.gps_latitude;
              const lng = p.gpsLongitude ?? p.gps_longitude;
              return (
                <ListItem key={p.id} divider
                  secondaryAction={p.lastScore != null ? (
                    <Chip
                      size="small"
                      label={`${Number(p.lastScore).toFixed(0)} pont`}
                      color={p.lastScore >= 70 ? 'success' : p.lastScore >= 50 ? 'warning' : 'error'}
                    />
                  ) : null}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <LocationOnIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText
                    primary={p.name || `Ingatlan #${p.id}`}
                    secondary={`GPS: ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`}
                  />
                </ListItem>
              );
            })}
          </List>
        )}
      </CardContent>
    </Card>
  );
}
