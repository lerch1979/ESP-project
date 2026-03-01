import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { AuthProvider } from './contexts/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Tickets from './pages/Tickets';
import TicketDetail from './pages/TicketDetail';
import Users from './pages/Users';
import Contractors from './pages/Contractors';
import Accommodations from './pages/Accommodations';
import Employees from './pages/Employees';
import Reports from './pages/Reports';
import Calendar from './pages/Calendar';
import Documents from './pages/Documents';
import Settings from './pages/Settings';
import Videos from './pages/Videos';
import FAQ from './pages/FAQ';
import OccupancyReports from './pages/OccupancyReports';
import ActivityLog from './pages/ActivityLog';
import ScheduledReports from './pages/ScheduledReports';
import EmailTemplates from './pages/EmailTemplates';
import CostCenters from './pages/CostCenters';
import Invoices from './pages/Invoices';
import InvoiceReports from './pages/invoices/InvoiceReports';
import AdminUsers from './pages/admin/Users';
import AdminUserPermissions from './pages/admin/UserPermissions';
import AdminRoles from './pages/admin/Roles';
import AdminFAQCategories from './pages/admin/FAQCategories';
import AdminFAQKnowledgeBase from './pages/admin/FAQKnowledgeBase';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import MyTasks from './pages/MyTasks';
import AutoAssign from './pages/admin/AutoAssign';
import EmailInbox from './pages/finance/EmailInbox';
import PrivateRoute from './components/PrivateRoute';
import PermissionGuard from './components/PermissionGuard';
import InstallPrompt from './components/InstallPrompt';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
            <Route path="admin/users" element={<PermissionGuard permission="users.manage_permissions"><AdminUsers /></PermissionGuard>} />
            <Route path="admin/users/:id/permissions" element={<PermissionGuard permission="users.manage_permissions"><AdminUserPermissions /></PermissionGuard>} />
            <Route path="admin/roles" element={<PermissionGuard permission="users.manage_permissions"><AdminRoles /></PermissionGuard>} />
            <Route path="admin/faq-categories" element={<PermissionGuard permission="faq.edit"><AdminFAQCategories /></PermissionGuard>} />
            <Route path="admin/faq-knowledge-base" element={<PermissionGuard permission="faq.edit"><AdminFAQKnowledgeBase /></PermissionGuard>} />
            <Route path="projects" element={<PermissionGuard permission="projects.view"><Projects /></PermissionGuard>} />
            <Route path="projects/:id" element={<PermissionGuard permission="projects.view"><ProjectDetail /></PermissionGuard>} />
            <Route path="admin/auto-assign" element={<PermissionGuard permission="settings.view"><AutoAssign /></PermissionGuard>} />
            <Route path="email-inbox" element={<PermissionGuard permission="settings.edit"><EmailInbox /></PermissionGuard>} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        <InstallPrompt />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
