import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Collapse,
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
  Chip,
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
  Schedule as ScheduleIcon,
  ExpandLess,
  ExpandMore,
  Menu as MenuIcon,
  Email as EmailIcon,
  SmartToy as SmartToyIcon,
  QuestionAnswer as QuestionAnswerIcon,
  AccountTree as AccountTreeIcon,
  Category as CategoryIcon,
  Chat as ChatIcon,
  BarChart as BarChartIcon,
  HelpOutline as HelpOutlineIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import GlobalSearchBar from './GlobalSearchBar';
import NotificationBell from './NotificationBell';


const drawerWidth = 260;

// Menu items with required permissions
const allMenuItems = [
  { text: 'Kezdőlap', icon: <HomeIcon />, path: '/dashboard', permission: 'dashboard.view' },
  { text: 'Hibajegyek', icon: <TicketIcon />, path: '/tickets', permission: 'tickets.view' },
  { text: 'Szállásolt munkavállalók', icon: <PeopleIcon />, path: '/employees', permission: 'employees.view' },
  { text: 'Alvállalkozók', icon: <BusinessIcon />, path: '/contractors', permission: 'employees.view' },
  { text: 'Szálláshelyek', icon: <ApartmentIcon />, path: '/accommodations', permission: 'accommodations.view' },
  { text: 'Dokumentumok', icon: <DescriptionIcon />, path: '/documents', permission: 'documents.view' },
  {
    text: 'Riportok', icon: <AssessmentIcon />, permission: 'reports.view', children: [
      { text: 'Riportok', icon: <AssessmentIcon />, path: '/reports', permission: 'reports.view' },
      { text: 'Kihasználtság', icon: <HotelIcon />, path: '/reports/occupancy', permission: 'reports.view' },
      { text: 'Ütemezett riportok', icon: <ScheduleIcon />, path: '/reports/scheduled', permission: 'reports.schedule' },
    ],
  },
  { text: 'Tevékenységnapló', icon: <HistoryIcon />, path: '/activity-log', permission: 'settings.view' },
  { text: 'Naptár', icon: <CalendarIcon />, path: '/calendar', permission: 'calendar.view' },
  { text: 'Videók', icon: <VideoLibraryIcon />, path: '/videos', permission: 'videos.view' },
  { text: 'FAQ', icon: <HelpOutlineIcon />, path: '/faq', permission: 'faq.view' },
  { text: 'Felhasználók', icon: <PeopleIcon />, path: '/users', permission: 'users.view' },
  { text: 'Beállítások', icon: <SettingsIcon />, path: '/settings', permission: 'settings.view' },
  { text: 'Email sablonok', icon: <EmailIcon />, path: '/email-templates', permission: 'settings.edit' },
  {
    text: 'Chatbot', icon: <SmartToyIcon />, permission: 'faq.edit', children: [
      { text: 'Tudásbázis', icon: <QuestionAnswerIcon />, path: '/chatbot/knowledge-base', permission: 'faq.edit' },
      { text: 'Döntési fák', icon: <AccountTreeIcon />, path: '/chatbot/decision-trees', permission: 'faq.edit' },
      { text: 'GYIK Kategóriák', icon: <CategoryIcon />, path: '/chatbot/faq-categories', permission: 'faq.edit' },
      { text: 'Beszélgetések', icon: <ChatIcon />, path: '/chatbot/conversations', permission: 'faq.edit' },
      { text: 'Analitika', icon: <BarChartIcon />, path: '/chatbot/analytics', permission: 'faq.edit' },
      { text: 'Konfiguráció', icon: <SmartToyIcon />, path: '/chatbot/config', permission: 'faq.edit' },
    ],
  },
];

// Helper: collect all paths (including children) for AppBar title lookup
const allMenuPaths = allMenuItems.flatMap(item =>
  item.children ? item.children : [item]
);

function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [openSubmenus, setOpenSubmenus] = useState({});
  const { user, logout, hasPermission } = useAuth();

  // Filter menu items based on user permissions
  const menuItems = useMemo(() => {
    return allMenuItems
      .filter(item => {
        if (!item.permission) return true;
        return hasPermission(item.permission);
      })
      .map(item => {
        if (item.children) {
          const filteredChildren = item.children.filter(child => {
            if (!child.permission) return true;
            return hasPermission(child.permission);
          });
          if (filteredChildren.length === 0) return null;
          return { ...item, children: filteredChildren };
        }
        return item;
      })
      .filter(Boolean);
  }, [hasPermission]);

  // Auto-expand submenu that contains the active route
  useEffect(() => {
    const expanded = {};
    menuItems.forEach(item => {
      if (item.children && item.children.some(c => location.pathname === c.path)) {
        expanded[item.text] = true;
      }
    });
    setOpenSubmenus(prev => ({ ...prev, ...expanded }));
  }, [location.pathname, menuItems]);

  const handleSubmenuToggle = (text) => {
    setOpenSubmenus(prev => ({ ...prev, [text]: !prev[text] }));
  };

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
    await logout();
    toast.success('Sikeres kijelentkezés');
    navigate('/login');
  };

  // Get display role name
  const userRoleDisplay = user?.roles?.[0] || '';

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

      {/* User info in sidebar */}
      {user && (
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="body2" sx={{ color: 'white', fontWeight: 600 }}>
            {user.firstName} {user.lastName}
          </Typography>
          <Chip
            label={userRoleDisplay}
            size="small"
            sx={{
              mt: 0.5,
              bgcolor: 'rgba(255,255,255,0.15)',
              color: 'white',
              fontSize: '0.7rem',
              height: 22,
            }}
          />
        </Box>
      )}
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

      <List sx={{ mt: 1 }}>
        {menuItems.map((item) => {
          // Submenu with children
          if (item.children) {
            const isOpen = !!openSubmenus[item.text];
            const hasActiveChild = item.children.some(c => location.pathname === c.path);
            return (
              <React.Fragment key={item.text}>
                <ListItem disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton
                    onClick={() => handleSubmenuToggle(item.text)}
                    sx={{
                      mx: 1,
                      borderRadius: 2,
                      minHeight: 48,
                      ...(hasActiveChild && {
                        bgcolor: 'rgba(255,255,255,0.05)',
                      }),
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
                    {isOpen ? <ExpandLess sx={{ color: 'rgba(255,255,255,0.7)' }} /> : <ExpandMore sx={{ color: 'rgba(255,255,255,0.7)' }} />}
                  </ListItemButton>
                </ListItem>
                <Collapse in={isOpen} timeout="auto" unmountOnExit>
                  <List disablePadding>
                    {item.children.map((child) => (
                      <ListItem key={child.text} disablePadding sx={{ mb: 0.5 }}>
                        <ListItemButton
                          selected={location.pathname === child.path}
                          onClick={() => navigate(child.path)}
                          sx={{
                            mx: 1,
                            ml: 3,
                            borderRadius: 2,
                            minHeight: 40,
                            '&.Mui-selected': {
                              bgcolor: '#6366f1',
                              '&:hover': {
                                bgcolor: '#3b82f6',
                              },
                            },
                            '&:hover': {
                              bgcolor: 'rgba(255,255,255,0.1)',
                            },
                          }}
                        >
                          <ListItemIcon sx={{ color: 'white', minWidth: 36 }}>
                            {child.icon}
                          </ListItemIcon>
                          <ListItemText
                            primary={child.text}
                            primaryTypographyProps={{ fontWeight: 400, fontSize: '0.9rem' }}
                          />
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                </Collapse>
              </React.Fragment>
            );
          }

          // Regular menu item
          return (
            <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                selected={location.pathname === item.path}
                onClick={() => navigate(item.path)}
                sx={{
                  mx: 1,
                  borderRadius: 2,
                  minHeight: 48,
                  '&.Mui-selected': {
                    bgcolor: '#6366f1',
                    '&:hover': {
                      bgcolor: '#3b82f6',
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
          );
        })}
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
            {allMenuPaths.find(item => item.path === location.pathname)?.text || 'HR-ERP'}
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
              <Avatar sx={{ width: 36, height: 36, bgcolor: '#2563eb' }}>
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
              {userRoleDisplay && (
                <Typography variant="caption" display="block" color="text.secondary">
                  {userRoleDisplay}
                </Typography>
              )}
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
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
