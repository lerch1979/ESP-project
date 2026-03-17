import React, { useState, useEffect } from 'react';
import {
  Badge, IconButton, Popover, List, ListItem, ListItemText,
  Typography, Box, Button, Divider, Chip
} from '@mui/material';
import { Notifications, DoneAll } from '@mui/icons-material';
import { wellbeingAPI } from '../../services/api';

const PRIORITY_COLORS = { urgent: 'error', high: 'warning', normal: 'info', low: 'default' };

const WellbeingNotificationBadge = () => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000); // Poll every minute
    return () => clearInterval(interval);
  }, []);

  const load = async () => {
    try {
      const response = await wellbeingAPI.getNotifications({ unread: 'true', limit: 10 });
      setNotifications(response.data?.notifications || []);
      setUnreadCount(response.data?.unread_count || 0);
    } catch (err) {
      // Silent fail — notification badge is non-critical
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await wellbeingAPI.markAllAsRead();
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, status: 'read' })));
    } catch (err) {
      // Silent
    }
  };

  const handleMarkRead = async (id) => {
    try {
      await wellbeingAPI.markAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'read' } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      // Silent
    }
  };

  return (
    <>
      <IconButton color="inherit" onClick={(e) => setAnchorEl(e.currentTarget)}>
        <Badge badgeContent={unreadCount} color="error" max={99}>
          <Notifications />
        </Badge>
      </IconButton>

      <Popover open={Boolean(anchorEl)} anchorEl={anchorEl} onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Box sx={{ width: 360, maxHeight: 450, overflow: 'auto' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="h6">Értesítések</Typography>
            {unreadCount > 0 && (
              <Button size="small" startIcon={<DoneAll />} onClick={handleMarkAllRead}>
                Mind olvasott
              </Button>
            )}
          </Box>

          {notifications.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
              Nincs új értesítés
            </Typography>
          ) : (
            <List disablePadding>
              {notifications.map((notif) => (
                <React.Fragment key={notif.id}>
                  <ListItem
                    button
                    onClick={() => handleMarkRead(notif.id)}
                    sx={{ bgcolor: notif.status !== 'read' ? 'action.hover' : 'transparent' }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="subtitle2">{notif.title}</Typography>
                          <Chip label={notif.priority} size="small" color={PRIORITY_COLORS[notif.priority] || 'default'} sx={{ height: 20, fontSize: 10 }} />
                        </Box>
                      }
                      secondary={
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }} noWrap>
                          {notif.message}
                        </Typography>
                      }
                    />
                  </ListItem>
                  <Divider />
                </React.Fragment>
              ))}
            </List>
          )}
        </Box>
      </Popover>
    </>
  );
};

export default WellbeingNotificationBadge;
