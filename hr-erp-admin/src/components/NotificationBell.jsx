import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconButton,
  Badge,
  Popover,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Button,
  Divider,
  CircularProgress,
} from '@mui/material';
import {
  Notifications as NotificationsIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Circle as UnreadDotIcon,
} from '@mui/icons-material';
import { notificationCenterAPI } from '../services/api';

const TYPE_ICONS = {
  warning: <WarningIcon fontSize="small" sx={{ color: '#ec4899' }} />,
  info: <InfoIcon fontSize="small" sx={{ color: '#3b82f6' }} />,
  success: <SuccessIcon fontSize="small" sx={{ color: '#22c55e' }} />,
  error: <ErrorIcon fontSize="small" sx={{ color: '#ef4444' }} />,
};

function getRelativeTime(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'most';
  if (diffMin < 60) return `${diffMin} perce`;
  if (diffHour < 24) return `${diffHour} órája`;
  if (diffDay < 7) return `${diffDay} napja`;
  return date.toLocaleDateString('hu-HU');
}

function NotificationBell() {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await notificationCenterAPI.getUnreadCount();
      if (response.success) {
        setUnreadCount(response.data.count);
      }
    } catch (error) {
      console.error('Unread count fetch error:', error);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const response = await notificationCenterAPI.getAll({ page: 1, limit: 20 });
      if (response.success) {
        setNotifications(response.data.notifications);
        setUnreadCount(response.data.unread_count);
      }
    } catch (error) {
      console.error('Notifications fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll unread count every 60 seconds
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  const handleOpen = (event) => {
    setAnchorEl(event.currentTarget);
    fetchNotifications();
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      try {
        await notificationCenterAPI.markAsRead(notification.id);
        setNotifications(prev =>
          prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch (error) {
        console.error('Mark as read error:', error);
      }
    }

    handleClose();

    if (notification.link) {
      navigate(notification.link);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationCenterAPI.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Mark all as read error:', error);
    }
  };

  const open = Boolean(anchorEl);

  return (
    <>
      <IconButton
        color="inherit"
        onClick={handleOpen}
        sx={{ mr: 1 }}
      >
        <Badge badgeContent={unreadCount} color="error" max={99}>
          <NotificationsIcon />
        </Badge>
      </IconButton>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: {
            width: 380,
            maxHeight: 480,
            borderRadius: 2,
          },
        }}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Értesítések
          </Typography>
          {unreadCount > 0 && (
            <Button
              size="small"
              onClick={handleMarkAllAsRead}
              sx={{ color: '#2563eb', textTransform: 'none', fontSize: '0.8rem' }}
            >
              Mind olvasott
            </Button>
          )}
        </Box>
        <Divider />

        {/* Content */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : notifications.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <NotificationsIcon sx={{ fontSize: 40, color: '#cbd5e1', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              Nincs értesítés
            </Typography>
          </Box>
        ) : (
          <List dense disablePadding sx={{ maxHeight: 400, overflow: 'auto' }}>
            {notifications.map((notif) => (
              <ListItemButton
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                sx={{
                  py: 1.5,
                  px: 2,
                  bgcolor: notif.is_read ? 'transparent' : 'rgba(37, 99, 235, 0.04)',
                  '&:hover': { bgcolor: 'rgba(37, 99, 235, 0.08)' },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {TYPE_ICONS[notif.type] || TYPE_ICONS.info}
                </ListItemIcon>
                <ListItemText
                  primary={notif.title}
                  secondary={
                    <Box component="span">
                      <Typography variant="caption" component="span" sx={{ display: 'block', color: '#64748b' }}>
                        {notif.message?.length > 80 ? notif.message.substring(0, 80) + '...' : notif.message}
                      </Typography>
                      <Typography variant="caption" component="span" sx={{ color: '#94a3b8', fontSize: '0.7rem' }}>
                        {getRelativeTime(notif.created_at)}
                      </Typography>
                    </Box>
                  }
                  primaryTypographyProps={{
                    variant: 'body2',
                    fontWeight: notif.is_read ? 400 : 600,
                    noWrap: true,
                  }}
                />
                {!notif.is_read && (
                  <UnreadDotIcon sx={{ fontSize: 10, color: '#2563eb', ml: 1 }} />
                )}
              </ListItemButton>
            ))}
          </List>
        )}
      </Popover>
    </>
  );
}

export default NotificationBell;
