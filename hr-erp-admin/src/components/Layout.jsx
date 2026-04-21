import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Badge,
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
  Menu,
  MenuItem,
  useTheme,
  useMediaQuery,
  Chip,
  Tooltip,
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
  ChevronLeft as ChevronLeftIcon,
  Email as EmailIcon,
  SmartToy as SmartToyIcon,
  QuestionAnswer as QuestionAnswerIcon,
  AccountTree as AccountTreeIcon,
  Category as CategoryIcon,
  Chat as ChatIcon,
  BarChart as BarChartIcon,
  HelpOutline as HelpOutlineIcon,
  AdminPanelSettings as AdminPanelSettingsIcon,
  Shield as ShieldIcon,
  ManageAccounts as ManageAccountsIcon,
  Receipt as ReceiptIcon,
  Assignment as AssignmentIcon,
  ListAlt as ListAltIcon,
  AutoAwesome as AutoAssignIcon,
  MonetizationOn as MonetizationOnIcon,
  Psychology as PsychologyIcon,
  Warning as WarningIcon,
  Timeline as TimelineIcon,
  Campaign as CampaignIcon,
  Quiz as QuizIcon,
  Groups as GroupsIcon,
  Healing as HealingIcon,
  Folder as FolderIcon,
  EventNote as EventNoteIcon,
  LocalHospital as LocalHospitalIcon,
  Forum as SlackIcon,
  Gavel as GavelIcon,
  Checklist as ChecklistIcon,
  Rule as RuleIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { tasksAPI } from '../services/api';
import GlobalSearchBar from './GlobalSearchBar';
import NotificationBell from './NotificationBell';
import UserAvatar from './common/UserAvatar';
import OfflineDetector from './common/OfflineDetector';

const DRAWER_OPEN_WIDTH = 260;
const DRAWER_COLLAPSED_WIDTH = 68;
const TRANSITION = 'width 0.3s ease, margin-left 0.3s ease';

// Menu items with required permissions — using i18n keys
const buildMenuItems = (t) => [
  // ─── Main navigation ─────────────────────────────────
  { text: t('nav.dashboard'), icon: <HomeIcon />, path: '/dashboard', permission: 'dashboard.view' },
  { text: t('nav.myTasks'), icon: <AssignmentIcon />, path: '/my-tasks', permission: 'dashboard.view' },
  { text: 'GTD', icon: <ChecklistIcon />, path: '/gtd', permission: 'dashboard.view' },
  { text: t('nav.tickets'), icon: <TicketIcon />, path: '/tickets', permission: 'tickets.view' },
  { text: t('nav.calendar'), icon: <CalendarIcon />, path: '/calendar', permission: 'calendar.view' },

  // ─── Employees & Accommodation ────
  { text: t('nav.residents'), icon: <PeopleIcon />, path: '/employees', permission: 'employees.view' },
  { text: 'Partnerek', icon: <BusinessIcon />, path: '/contractors', permission: 'employees.view' },
  { text: t('nav.accommodations'), icon: <ApartmentIcon />, path: '/accommodations', permission: 'accommodations.view' },
  { text: t('nav.damageReports'), icon: <GavelIcon />, path: '/damage-reports', permission: 'tickets.view' },

  // ─── Finance ─
  {
    text: t('nav.finance'), icon: <ReceiptIcon />, permission: 'settings.edit', children: [
      { text: t('nav.invoices'), icon: <ReceiptIcon />, path: '/invoices', permission: 'settings.edit' },
      { text: t('nav.costCenters'), icon: <AccountTreeIcon />, path: '/cost-centers', permission: 'settings.edit' },
      { text: t('nav.emailInvoices'), icon: <EmailIcon />, path: '/email-inbox', permission: 'settings.edit' },
      { text: 'Besorolási szabályok', icon: <RuleIcon />, path: '/finance/classification-rules', permission: 'settings.edit' },
      { text: t('nav.invoiceReports'), icon: <BarChartIcon />, path: '/invoice-reports', permission: 'settings.edit' },
      { text: t('nav.salaryTransparency'), icon: <MonetizationOnIcon />, path: '/salary-transparency', permission: 'settings.view' },
    ],
  },

  // ─── Ingatlan Ellenőrzés ──────────────────────────────
  {
    text: 'Ingatlan Ellenőrzés', icon: <ChecklistIcon />, permission: 'settings.edit', children: [
      { text: 'Dashboard',     icon: <BarChartIcon />,       path: '/inspections/dashboard',  permission: 'settings.edit' },
      { text: 'Új ellenőrzés', icon: <AddIcon />,            path: '/inspections/new',        permission: 'settings.edit' },
      { text: 'Ellenőrzések',  icon: <ListAltIcon />,        path: '/inspections',            permission: 'settings.edit' },
      { text: 'Ütemezések',    icon: <ScheduleIcon />,       path: '/inspections/schedules',  permission: 'settings.edit' },
      { text: 'Feladatok',     icon: <AssignmentIcon />,     path: '/inspections/tasks',      permission: 'settings.edit' },
      { text: 'Sablonok',      icon: <CategoryIcon />,       path: '/inspections/templates',  permission: 'settings.edit' },
      { text: 'Riportok',      icon: <AssessmentIcon />,     path: '/inspections/reports',    permission: 'settings.edit' },
      { text: 'Szoba trendek', icon: <TimelineIcon />,       path: '/inspections/room-trends',permission: 'settings.edit' },
    ],
  },

  // ─── Reports ──────────────────────────────────────
  {
    text: t('nav.reports'), icon: <AssessmentIcon />, permission: 'reports.view', children: [
      { text: t('nav.reportsSummary'), icon: <AssessmentIcon />, path: '/reports', permission: 'reports.view' },
      { text: t('nav.occupancy'), icon: <HotelIcon />, path: '/reports/occupancy', permission: 'reports.view' },
      { text: t('nav.scheduledReports'), icon: <ScheduleIcon />, path: '/reports/scheduled', permission: 'reports.schedule' },
    ],
  },

  // ─── Documents & FAQ ────────────────────────────
  { text: t('nav.documents'), icon: <DescriptionIcon />, path: '/documents', permission: 'documents.view' },
  { text: t('nav.faq'), icon: <HelpOutlineIcon />, path: '/faq', permission: 'faq.view' },
  { text: t('nav.videos'), icon: <VideoLibraryIcon />, path: '/videos', permission: 'videos.view' },

  // ─── Projects ─────────────────────────────────────
  {
    text: t('nav.projectManagement'), icon: <AssignmentIcon />, permission: 'projects.view', children: [
      { text: t('nav.projects'), icon: <ListAltIcon />, path: '/projects', permission: 'projects.view' },
    ],
  },

  // ─── WellMind & CarePath ───────────────────────────
  {
    text: 'WellMind', icon: <PsychologyIcon />, permission: 'dashboard.view', children: [
      { text: t('nav.wmDashboard'), icon: <PsychologyIcon />, path: '/wellmind', permission: 'dashboard.view' },
      { text: t('nav.wmRiskEmployees'), icon: <WarningIcon />, path: '/wellmind/risk-employees', permission: 'dashboard.view' },
      { text: t('nav.wmTrends'), icon: <TimelineIcon />, path: '/wellmind/trends', permission: 'dashboard.view' },
      { text: t('nav.wmQuestions'), icon: <QuizIcon />, path: '/wellmind/questions', permission: 'dashboard.view' },
      { text: t('nav.wmInterventions'), icon: <CampaignIcon />, path: '/wellmind/interventions', permission: 'dashboard.view' },
      { text: t('nav.wmTeamMetrics'), icon: <GroupsIcon />, path: '/wellmind/team-metrics', permission: 'dashboard.view' },
      { text: t('nav.wmSentiment'), icon: <PsychologyIcon />, path: '/wellmind/sentiment', permission: 'settings.edit' },
    ],
  },
  {
    text: 'CarePath', icon: <HealingIcon />, permission: 'dashboard.view', children: [
      { text: t('nav.cpDashboard'), icon: <HealingIcon />, path: '/carepath', permission: 'dashboard.view' },
      { text: t('nav.cpProviders'), icon: <LocalHospitalIcon />, path: '/carepath/providers', permission: 'dashboard.view' },
      { text: t('nav.cpCases'), icon: <FolderIcon />, path: '/carepath/cases', permission: 'dashboard.view' },
      { text: t('nav.cpBookings'), icon: <EventNoteIcon />, path: '/carepath/bookings', permission: 'dashboard.view' },
      { text: t('nav.cpCategories'), icon: <CategoryIcon />, path: '/carepath/categories', permission: 'dashboard.view' },
    ],
  },

  // ─── Integration & Chatbot ──────────────────────────
  {
    text: 'Slack', icon: <SlackIcon />, path: '/slack', permission: 'settings.edit',
  },
  { text: t('nav.help'), icon: <ChatIcon />, path: '/chatbot', permission: 'dashboard.view' },
  {
    text: t('nav.chatbotManagement'), icon: <SmartToyIcon />, permission: 'faq.edit', children: [
      { text: t('nav.cbKnowledgeBase'), icon: <QuestionAnswerIcon />, path: '/chatbot/knowledge-base', permission: 'faq.edit' },
      { text: t('nav.cbDecisionTrees'), icon: <AccountTreeIcon />, path: '/chatbot/decision-trees', permission: 'faq.edit' },
      { text: t('nav.cbFaqCategories'), icon: <CategoryIcon />, path: '/chatbot/faq-categories', permission: 'faq.edit' },
      { text: t('nav.cbConversations'), icon: <ChatIcon />, path: '/chatbot/conversations', permission: 'faq.edit' },
      { text: t('nav.cbAnalytics'), icon: <BarChartIcon />, path: '/chatbot/analytics', permission: 'faq.edit' },
      { text: t('nav.cbConfig'), icon: <SmartToyIcon />, path: '/chatbot/config', permission: 'faq.edit' },
    ],
  },

  // ─── Administration ────────────────────────────────
  { text: t('nav.activityLog'), icon: <HistoryIcon />, path: '/activity-log', permission: 'settings.view' },
  { text: t('nav.emailTemplates'), icon: <EmailIcon />, path: '/email-templates', permission: 'settings.edit' },
  { text: t('nav.users'), icon: <PeopleIcon />, path: '/users', permission: 'users.view' },
  { text: t('nav.settings'), icon: <SettingsIcon />, path: '/settings', permission: 'settings.view' },
  { text: t('nav.autoAssign'), icon: <AutoAssignIcon />, path: '/admin/auto-assign', permission: 'settings.view' },
  {
    text: t('nav.faqManagement'), icon: <HelpOutlineIcon />, permission: 'faq.edit', children: [
      { text: t('nav.faqCategories'), icon: <CategoryIcon />, path: '/admin/faq-categories', permission: 'faq.edit' },
      { text: t('nav.faqKnowledgeBase'), icon: <QuestionAnswerIcon />, path: '/admin/faq-knowledge-base', permission: 'faq.edit' },
    ],
  },
  {
    text: t('nav.administration'), icon: <AdminPanelSettingsIcon />, permission: 'users.manage_permissions', children: [
      { text: t('nav.adminUsers'), icon: <ManageAccountsIcon />, path: '/admin/users', permission: 'users.manage_permissions' },
      { text: t('nav.adminRoles'), icon: <ShieldIcon />, path: '/admin/roles', permission: 'users.manage_permissions' },
    ],
  },
];

// Helper: collect all paths (including children) for AppBar title lookup — built inside component

function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const { t } = useTranslation();
  const allMenuItems = useMemo(() => buildMenuItems(t), [t]);
  const allMenuPaths = useMemo(() => allMenuItems.flatMap(item => item.children ? item.children : [item]), [allMenuItems]);
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [openSubmenus, setOpenSubmenus] = useState({});
  const { user, logout, hasPermission } = useAuth();

  // My-tasks badge count
  const [myTasksCount, setMyTasksCount] = useState(0);

  const loadMyTasksCount = useCallback(async () => {
    try {
      const response = await tasksAPI.getMyTasksStats();
      setMyTasksCount(response.data?.total || 0);
    } catch {
      // Silently ignore — badge just won't show
    }
  }, []);

  useEffect(() => {
    loadMyTasksCount();
    const interval = setInterval(loadMyTasksCount, 30000);
    return () => clearInterval(interval);
  }, [loadMyTasksCount]);

  // Sidebar collapsed state — persisted in localStorage
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebarCollapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('sidebarCollapsed', String(next)); } catch {}
      return next;
    });
  };

  const currentWidth = isMobile ? DRAWER_OPEN_WIDTH : (collapsed ? DRAWER_COLLAPSED_WIDTH : DRAWER_OPEN_WIDTH);

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
    if (collapsed && !isMobile) {
      // Expand sidebar when clicking a submenu while collapsed
      setCollapsed(false);
      try { localStorage.setItem('sidebarCollapsed', 'false'); } catch {}
      setOpenSubmenus(prev => ({ ...prev, [text]: true }));
    } else {
      setOpenSubmenus(prev => ({ ...prev, [text]: !prev[text] }));
    }
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
    toast.success(t('logoutSuccess'));
    navigate('/login');
  };

  // Get display role name
  const userRoleDisplay = user?.roles?.[0] || '';

  // Whether to show text (expanded state)
  const showText = isMobile || !collapsed;

  const drawerContent = (
    <>
      {/* Logo area */}
      <Toolbar
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          py: 2,
          minHeight: collapsed && !isMobile ? 64 : 80,
          transition: 'min-height 0.3s ease',
        }}
      >
        {showText ? (
          <>
            <Typography variant="h6" component="div" sx={{ fontWeight: 900, color: 'white', textAlign: 'center', whiteSpace: 'nowrap' }}>
              HOUSING SOLUTIONS
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', mt: 0.5 }}>
              {t('nav.portalSubtitle')}
            </Typography>
          </>
        ) : (
          <Typography variant="h6" component="div" sx={{ fontWeight: 900, color: 'white', textAlign: 'center' }}>
            HS
          </Typography>
        )}
      </Toolbar>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

      {/* User info in sidebar */}
      {user && (
        <Box sx={{ px: collapsed && !isMobile ? 0.5 : 2, py: 1.5, display: 'flex', flexDirection: 'column', alignItems: collapsed && !isMobile ? 'center' : 'flex-start' }}>
          {collapsed && !isMobile ? (
            <UserAvatar
              user={user}
              size="small"
              sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
            />
          ) : (
            <>
              <Typography variant="body2" sx={{ color: 'white', fontWeight: 600, whiteSpace: 'nowrap' }}>
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
            </>
          )}
        </Box>
      )}
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

      {/* Menu items */}
      <List sx={{ mt: 1, overflowX: 'hidden' }}>
        {menuItems.map((item) => {
          // Submenu with children
          if (item.children) {
            const isOpen = !!openSubmenus[item.text];
            const hasActiveChild = item.children.some(c => location.pathname === c.path);

            // Collapsed: show only parent icon with tooltip, click navigates to first child
            if (collapsed && !isMobile) {
              return (
                <Tooltip key={item.text} title={item.text} placement="right" arrow>
                  <ListItem disablePadding sx={{ mb: 0.5 }}>
                    <ListItemButton
                      onClick={() => handleSubmenuToggle(item.text)}
                      sx={{
                        mx: 0.5,
                        borderRadius: 2,
                        minHeight: 48,
                        justifyContent: 'center',
                        px: 1.5,
                        ...(hasActiveChild && { bgcolor: 'rgba(255,255,255,0.1)' }),
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                      }}
                    >
                      <ListItemIcon sx={{ color: 'white', minWidth: 0, justifyContent: 'center' }}>
                        {item.icon}
                      </ListItemIcon>
                    </ListItemButton>
                  </ListItem>
                </Tooltip>
              );
            }

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
                      primaryTypographyProps={{ fontWeight: 500, noWrap: true }}
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
                            primaryTypographyProps={{ fontWeight: 400, fontSize: '0.9rem', noWrap: true }}
                          />
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                </Collapse>
              </React.Fragment>
            );
          }

          const showBadge = item.path === '/my-tasks' && myTasksCount > 0;

          // Regular menu item — collapsed
          if (collapsed && !isMobile) {
            return (
              <Tooltip key={item.text} title={item.text} placement="right" arrow>
                <ListItem disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton
                    selected={location.pathname === item.path}
                    onClick={() => navigate(item.path)}
                    sx={{
                      mx: 0.5,
                      borderRadius: 2,
                      minHeight: 48,
                      justifyContent: 'center',
                      px: 1.5,
                      '&.Mui-selected': {
                        bgcolor: '#6366f1',
                        '&:hover': { bgcolor: '#3b82f6' },
                      },
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                    }}
                  >
                    <ListItemIcon sx={{ color: 'white', minWidth: 0, justifyContent: 'center' }}>
                      {showBadge ? (
                        <Badge badgeContent={myTasksCount} color="error" max={99}>
                          {item.icon}
                        </Badge>
                      ) : item.icon}
                    </ListItemIcon>
                  </ListItemButton>
                </ListItem>
              </Tooltip>
            );
          }

          // Regular menu item — expanded
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
                  primaryTypographyProps={{ fontWeight: 500, noWrap: true }}
                />
                {showBadge && (
                  <Badge badgeContent={myTasksCount} color="error" max={99} />
                )}
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      {/* Collapse toggle at bottom (desktop only) */}
      {!isMobile && (
        <Box sx={{ mt: 'auto', p: 1 }}>
          <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mb: 1 }} />
          <Tooltip title={collapsed ? 'Kinyitás' : 'Összecsukás'} placement="right">
            <ListItemButton
              onClick={toggleCollapsed}
              sx={{
                borderRadius: 2,
                minHeight: 44,
                justifyContent: collapsed ? 'center' : 'flex-start',
                px: collapsed ? 1.5 : 2,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
              }}
            >
              <ListItemIcon sx={{ color: 'white', minWidth: collapsed ? 0 : 40, justifyContent: 'center' }}>
                <ChevronLeftIcon sx={{
                  transform: collapsed ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.3s ease',
                }} />
              </ListItemIcon>
              {!collapsed && (
                <ListItemText
                  primary="Összecsukás"
                  primaryTypographyProps={{ fontWeight: 500, fontSize: '0.85rem', noWrap: true }}
                />
              )}
            </ListItemButton>
          </Tooltip>
        </Box>
      )}
    </>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      {/* Top AppBar */}
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${currentWidth}px)` },
          ml: { md: `${currentWidth}px` },
          bgcolor: 'white',
          color: '#1e293b',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          transition: TRANSITION,
        }}
      >
        <Toolbar>
          {isMobile ? (
            <IconButton
              color="inherit"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
          ) : (
            <IconButton
              color="inherit"
              edge="start"
              onClick={toggleCollapsed}
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
              <UserAvatar user={user} size={36} tooltip={false} />
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
              {t('logout')}
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
              width: DRAWER_OPEN_WIDTH,
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
            width: currentWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: currentWidth,
              boxSizing: 'border-box',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              transition: TRANSITION,
              overflowX: 'hidden',
              display: 'flex',
              flexDirection: 'column',
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
          width: { md: `calc(100% - ${currentWidth}px)` },
          transition: TRANSITION,
        }}
      >
        {children}
      </Box>

      <OfflineDetector />
    </Box>
  );
}

export default Layout;
