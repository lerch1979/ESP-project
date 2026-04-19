import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Box, CircularProgress } from '@mui/material';

import { AuthProvider } from './contexts/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import PermissionGuard from './components/PermissionGuard';
import InstallPrompt from './components/InstallPrompt';

// Critical path — load immediately
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

// Lazy load all other pages for smaller initial bundle
const Tickets = lazy(() => import('./pages/Tickets'));
const TicketDetail = lazy(() => import('./pages/TicketDetail'));
const Users = lazy(() => import('./pages/Users'));
const Contractors = lazy(() => import('./pages/Contractors'));
const Accommodations = lazy(() => import('./pages/Accommodations'));
const Employees = lazy(() => import('./pages/Employees'));
const ResidentImport = lazy(() => import('./pages/ResidentImport'));
const Reports = lazy(() => import('./pages/Reports'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Documents = lazy(() => import('./pages/Documents'));
const Settings = lazy(() => import('./pages/Settings'));
const Videos = lazy(() => import('./pages/Videos'));
const FAQ = lazy(() => import('./pages/FAQ'));
const OccupancyReports = lazy(() => import('./pages/OccupancyReports'));
const ActivityLog = lazy(() => import('./pages/ActivityLog'));
const ScheduledReports = lazy(() => import('./pages/ScheduledReports'));
const EmailTemplates = lazy(() => import('./pages/EmailTemplates'));
const CostCenters = lazy(() => import('./pages/CostCenters'));
const Invoices = lazy(() => import('./pages/Invoices'));
const InvoiceReports = lazy(() => import('./pages/invoices/InvoiceReports'));
const InvoiceListPage = lazy(() => import('./pages/invoices/InvoiceListPage'));
const MyTasks = lazy(() => import('./pages/MyTasks'));
const Projects = lazy(() => import('./pages/Projects'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const SalaryTransparency = lazy(() => import('./pages/SalaryTransparency'));
const EmailInbox = lazy(() => import('./pages/finance/EmailInbox'));

// Admin pages
const AdminUsers = lazy(() => import('./pages/admin/Users'));
const AdminUserPermissions = lazy(() => import('./pages/admin/UserPermissions'));
const AdminRoles = lazy(() => import('./pages/admin/Roles'));
const AdminFAQCategories = lazy(() => import('./pages/admin/FAQCategories'));
const AdminFAQKnowledgeBase = lazy(() => import('./pages/admin/FAQKnowledgeBase'));
const AutoAssign = lazy(() => import('./pages/admin/AutoAssign'));

// Chatbot
const ChatbotPage = lazy(() => import('./pages/ChatbotPage'));
const ChatbotKnowledgeBase = lazy(() => import('./pages/ChatbotKnowledgeBase'));
const ChatbotDecisionTrees = lazy(() => import('./pages/ChatbotDecisionTrees'));
const ChatbotFaqCategories = lazy(() => import('./pages/ChatbotFaqCategories'));
const ChatbotConversations = lazy(() => import('./pages/ChatbotConversations'));
const ChatbotConversationDetail = lazy(() => import('./pages/ChatbotConversationDetail'));
const ChatbotAnalytics = lazy(() => import('./pages/ChatbotAnalytics'));
const ChatbotConfig = lazy(() => import('./pages/ChatbotConfig'));

// Damage Reports
const DamageReports = lazy(() => import('./pages/DamageReports'));
const DamageReportDetail = lazy(() => import('./pages/DamageReportDetail'));

// GTD Task Manager
const GTDDashboard = lazy(() => import('./pages/GTDDashboard'));
const BrunoTest = lazy(() => import('./pages/BrunoTest'));

// CarePath
const CarePathDashboard = lazy(() => import('./pages/CarePath/CarePathDashboard'));
const ProviderDirectory = lazy(() => import('./pages/CarePath/ProviderDirectory'));
const CasesManagement = lazy(() => import('./pages/CarePath/CasesManagement'));
const BookingsOverview = lazy(() => import('./pages/CarePath/BookingsOverview'));
const ServiceCategories = lazy(() => import('./pages/CarePath/ServiceCategories'));

// WellMind
const WellMindDashboard = lazy(() => import('./pages/WellMind/WellMindDashboard'));
const RiskEmployees = lazy(() => import('./pages/WellMind/RiskEmployees'));
const QuestionManagement = lazy(() => import('./pages/WellMind/QuestionManagement'));
const TrendsAnalytics = lazy(() => import('./pages/WellMind/TrendsAnalytics'));
const InterventionsManagement = lazy(() => import('./pages/WellMind/InterventionsManagement'));
const TeamMetrics = lazy(() => import('./pages/WellMind/TeamMetrics'));
const SentimentDashboard = lazy(() => import('./pages/WellMind/SentimentDashboard'));

// Slack
const SlackIntegration = lazy(() => import('./pages/SlackIntegration'));

// Suspense fallback
function PageLoader() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <CircularProgress />
    </Box>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
        />

        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route path="/" element={<PrivateRoute />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<PermissionGuard permission="dashboard.view"><Dashboard /></PermissionGuard>} />
              <Route path="my-tasks" element={<PermissionGuard permission="dashboard.view"><MyTasks /></PermissionGuard>} />
              <Route path="tickets" element={<PermissionGuard permission="tickets.view"><Tickets /></PermissionGuard>} />
              <Route path="tickets/:id" element={<PermissionGuard permission="tickets.view"><TicketDetail /></PermissionGuard>} />
              <Route path="users" element={<PermissionGuard permission="users.view"><Users /></PermissionGuard>} />
              <Route path="contractors" element={<PermissionGuard permission="employees.view"><Contractors /></PermissionGuard>} />
              <Route path="accommodations" element={<PermissionGuard permission="accommodations.view"><Accommodations /></PermissionGuard>} />
              <Route path="employees" element={<PermissionGuard permission="employees.view"><Employees /></PermissionGuard>} />
              <Route path="residents/import" element={<PermissionGuard permission="employees.create"><ResidentImport /></PermissionGuard>} />
              <Route path="documents" element={<PermissionGuard permission="documents.view"><Documents /></PermissionGuard>} />
              <Route path="reports" element={<PermissionGuard permission="reports.view"><Reports /></PermissionGuard>} />
              <Route path="calendar" element={<PermissionGuard permission="calendar.view"><Calendar /></PermissionGuard>} />
              <Route path="settings" element={<PermissionGuard permission="settings.view"><Settings /></PermissionGuard>} />
              <Route path="videos" element={<PermissionGuard permission="videos.view"><Videos /></PermissionGuard>} />
              <Route path="faq" element={<PermissionGuard permission="faq.view"><FAQ /></PermissionGuard>} />
              <Route path="reports/occupancy" element={<PermissionGuard permission="reports.view"><OccupancyReports /></PermissionGuard>} />
              <Route path="activity-log" element={<PermissionGuard permission="settings.view"><ActivityLog /></PermissionGuard>} />
              <Route path="reports/scheduled" element={<PermissionGuard permission="reports.schedule"><ScheduledReports /></PermissionGuard>} />
              <Route path="email-templates" element={<PermissionGuard permission="settings.edit"><EmailTemplates /></PermissionGuard>} />
              <Route path="cost-centers" element={<PermissionGuard permission="settings.edit"><CostCenters /></PermissionGuard>} />
              <Route path="invoices" element={<PermissionGuard permission="settings.edit"><Invoices /></PermissionGuard>} />
              <Route path="invoice-reports" element={<PermissionGuard permission="settings.edit"><InvoiceReports /></PermissionGuard>} />
              <Route path="invoice-management" element={<PermissionGuard permission="settings.edit"><InvoiceListPage /></PermissionGuard>} />
              <Route path="admin/users" element={<PermissionGuard permission="users.manage_permissions"><AdminUsers /></PermissionGuard>} />
              <Route path="admin/users/:id/permissions" element={<PermissionGuard permission="users.manage_permissions"><AdminUserPermissions /></PermissionGuard>} />
              <Route path="admin/roles" element={<PermissionGuard permission="users.manage_permissions"><AdminRoles /></PermissionGuard>} />
              <Route path="admin/faq-categories" element={<PermissionGuard permission="faq.edit"><AdminFAQCategories /></PermissionGuard>} />
              <Route path="admin/faq-knowledge-base" element={<PermissionGuard permission="faq.edit"><AdminFAQKnowledgeBase /></PermissionGuard>} />
              <Route path="projects" element={<PermissionGuard permission="projects.view"><Projects /></PermissionGuard>} />
              <Route path="projects/:id" element={<PermissionGuard permission="projects.view"><ProjectDetail /></PermissionGuard>} />
              <Route path="admin/auto-assign" element={<PermissionGuard permission="settings.view"><AutoAssign /></PermissionGuard>} />
              <Route path="email-inbox" element={<PermissionGuard permission="settings.edit"><EmailInbox /></PermissionGuard>} />
              <Route path="salary-transparency" element={<PermissionGuard permission="settings.view"><SalaryTransparency /></PermissionGuard>} />
              <Route path="chatbot" element={<PermissionGuard permission="dashboard.view"><ChatbotPage /></PermissionGuard>} />
              <Route path="chatbot/knowledge-base" element={<PermissionGuard permission="faq.edit"><ChatbotKnowledgeBase /></PermissionGuard>} />
              <Route path="chatbot/decision-trees" element={<PermissionGuard permission="faq.edit"><ChatbotDecisionTrees /></PermissionGuard>} />
              <Route path="chatbot/faq-categories" element={<PermissionGuard permission="faq.edit"><ChatbotFaqCategories /></PermissionGuard>} />
              <Route path="chatbot/conversations" element={<PermissionGuard permission="faq.edit"><ChatbotConversations /></PermissionGuard>} />
              <Route path="chatbot/conversations/:id" element={<PermissionGuard permission="faq.edit"><ChatbotConversationDetail /></PermissionGuard>} />
              <Route path="chatbot/analytics" element={<PermissionGuard permission="faq.edit"><ChatbotAnalytics /></PermissionGuard>} />
              <Route path="chatbot/config" element={<PermissionGuard permission="faq.edit"><ChatbotConfig /></PermissionGuard>} />

              {/* Damage Reports */}
              <Route path="damage-reports" element={<PermissionGuard permission="tickets.view"><DamageReports /></PermissionGuard>} />
              <Route path="damage-reports/:id" element={<PermissionGuard permission="tickets.view"><DamageReportDetail /></PermissionGuard>} />

              {/* GTD Task Manager */}
              <Route path="gtd" element={<PermissionGuard permission="dashboard.view"><GTDDashboard /></PermissionGuard>} />
              <Route path="bruno-test" element={<BrunoTest />} />

              {/* CarePath */}
              <Route path="carepath" element={<CarePathDashboard />} />
              <Route path="carepath/providers" element={<ProviderDirectory />} />
              <Route path="carepath/cases" element={<CasesManagement />} />
              <Route path="carepath/bookings" element={<BookingsOverview />} />
              <Route path="carepath/categories" element={<ServiceCategories />} />

              {/* Slack Integration */}
              <Route path="slack" element={<PermissionGuard permission="settings.edit"><SlackIntegration /></PermissionGuard>} />

              {/* WellMind */}
              <Route path="wellmind" element={<WellMindDashboard />} />
              <Route path="wellmind/risk-employees" element={<RiskEmployees />} />
              <Route path="wellmind/questions" element={<QuestionManagement />} />
              <Route path="wellmind/trends" element={<TrendsAnalytics />} />
              <Route path="wellmind/interventions" element={<InterventionsManagement />} />
              <Route path="wellmind/team-metrics" element={<TeamMetrics />} />
              <Route path="wellmind/sentiment" element={<PermissionGuard permission="settings.edit"><SentimentDashboard /></PermissionGuard>} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
        <InstallPrompt />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
