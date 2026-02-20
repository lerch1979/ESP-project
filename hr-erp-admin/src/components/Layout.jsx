import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Home as HomeIcon,
  ConfirmationNumber as TicketIcon,
  People as PeopleIcon,
  Business as BusinessIcon,
  Settings as SettingsIcon,
  Logout as LogoutIcon,
  AccountCircle,
  Apartment as ApartmentIcon,
  Assessment as AssessmentIcon,
  CalendarMonth as CalendarIcon,
  Description as DescriptionIcon,
  VideoLibrary as VideoLibraryIcon,
  Hotel as HotelIcon,
  History as HistoryIcon,
  Menu as MenuIcon,
} from '@mui/icons-material';
import { authAPI } from '../services/api';
import { toast } from 'react-toastify';
import GlobalSearchBar from './GlobalSearchBar';
import NotificationBell from './NotificationBell';

const drawerWidth = 260;

const menuItems = [
  { text: 'Kezdőlap', icon: <HomeIcon />, path: '/dashboard' },
  { text: 'Hibajegyek', icon: <TicketIcon />, path: '/tickets' },
  { text: 'Szállásolt munkavállalók', icon: <PeopleIcon />, path: '/employees' },
  { text: 'Alvállalkozók', icon: <BusinessIcon />, path: '/contractors' },
  { text: 'Szálláshelyek', icon: <ApartmentIcon />, path: '/accommodations' },
  { text: 'Dokumentumok', icon: <DescriptionIcon />, path: '/documents' },
  { text: 'Riportok', icon: <AssessmentIcon />, path: '/reports' },
  { text: 'Kihasználtság', icon: <HotelIcon />, path: '/occupancy' },
  { text: 'Tevékenységnapló', icon: <HistoryIcon />, path: '/activity-log' },
  { text: 'Naptár', icon: <CalendarIcon />, path: '/calendar' },
  { text: 'Videók', icon: <VideoLibraryIcon />, path: '/videos' },
  { text: 'Felhasználók', icon: <PeopleIcon />, path: '/users' },
  { text: 'Beállítások', icon: <SettingsIcon />, path: '/settings' },
];

function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  // Close drawer on navigation (mobile)
  useEffect(() => {
    if (isMobile) {
      setMobileOpen(false);
    }
  }, [location.pathname, isMobile]);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    try {
      await authAPI.logout();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      toast.success('Sikeres kijelentkezés');
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      navigate('/login');
    }
  };

  const drawerContent = (
    <>
      <Toolbar sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 2 }}>
        <Typography variant="h6" component="div" sx={{ fontWeight: 900, color: 'white', textAlign: 'center' }}>
          HOUSING SOLUTIONS
        </Typography>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', mt: 0.5 }}>
          Employee Support Portal
        </Typography>
      </Toolbar>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

      <List sx={{ mt: 2 }}>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => navigate(item.path)}
              sx={{
                mx: 1,
                borderRadius: 2,
                minHeight: 48,
                '&.Mui-selected': {
                  bgcolor: '#4a7c59',
                  '&:hover': {
                    bgcolor: '#3d6b4a',
                  },
                },
                '&:hover': {
                  bgcolor: 'rgba(255,255,255,0.1)',
                },
              }}
            >
              <ListItemIcon sx={{ color: 'white', minWidth: 40 }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.text}
                primaryTypographyProps={{ fontWeight: 500 }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      {/* Top AppBar */}
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          bgcolor: 'white',
          color: '#1e293b',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        <Toolbar>
          {isMobile && (
            <IconButton
              color="inherit"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 600, mr: 2 }}>
            {menuItems.find(item => item.path === location.pathname)?.text || 'HR-ERP'}
          </Typography>

          <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center' }}>
            <GlobalSearchBar />
          </Box>

          <NotificationBell />

          <IconButton
            size="large"
            onClick={handleMenu}
            color="inherit"
          >
            {user ? (
              <Avatar sx={{ width: 36, height: 36, bgcolor: '#2c5f2d' }}>
                {user.firstName?.[0]}{user.lastName?.[0]}
              </Avatar>
            ) : (
              <AccountCircle />
            )}
          </IconButton>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleClose}
          >
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {user?.firstName} {user?.lastName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {user?.email}
              </Typography>
            </Box>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              Kijelentkezés
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Sidebar Drawer */}
      {isMobile ? (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
              bgcolor: '#2c5f2d',
              color: 'white',
            },
          }}
        >
          {drawerContent}
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
              bgcolor: '#2c5f2d',
              color: 'white',
            },
          }}
          open
        >
          {drawerContent}
        </Drawer>
      )}

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: '#f8fafc',
          p: { xs: 2, md: 3 },
          minHeight: '100vh',
          mt: 8,
          width: { md: `calc(100% - ${drawerWidth}px)` },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

export default Layout;
