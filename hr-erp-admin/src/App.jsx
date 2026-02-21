import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

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
import OccupancyReports from './pages/OccupancyReports';
import ActivityLog from './pages/ActivityLog';
import ScheduledReports from './pages/ScheduledReports';
import EmailTemplates from './pages/EmailTemplates';
import ChatbotKnowledgeBase from './pages/ChatbotKnowledgeBase';
import ChatbotDecisionTrees from './pages/ChatbotDecisionTrees';
import ChatbotFaqCategories from './pages/ChatbotFaqCategories';
import ChatbotConversations from './pages/ChatbotConversations';
import ChatbotConversationDetail from './pages/ChatbotConversationDetail';
import ChatbotAnalytics from './pages/ChatbotAnalytics';
import ChatbotConfig from './pages/ChatbotConfig';
import PrivateRoute from './components/PrivateRoute';
import InstallPrompt from './components/InstallPrompt';

function App() {
  return (
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
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="tickets" element={<Tickets />} />
          <Route path="tickets/:id" element={<TicketDetail />} />
          <Route path="users" element={<Users />} />
          <Route path="contractors" element={<Contractors />} />
          <Route path="accommodations" element={<Accommodations />} />
          <Route path="employees" element={<Employees />} />
          <Route path="documents" element={<Documents />} />
          <Route path="reports" element={<Reports />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="settings" element={<Settings />} />
          <Route path="videos" element={<Videos />} />
          <Route path="reports/occupancy" element={<OccupancyReports />} />
          <Route path="activity-log" element={<ActivityLog />} />
          <Route path="reports/scheduled" element={<ScheduledReports />} />
          <Route path="email-templates" element={<EmailTemplates />} />
          <Route path="chatbot/knowledge-base" element={<ChatbotKnowledgeBase />} />
          <Route path="chatbot/decision-trees" element={<ChatbotDecisionTrees />} />
          <Route path="chatbot/faq-categories" element={<ChatbotFaqCategories />} />
          <Route path="chatbot/conversations" element={<ChatbotConversations />} />
          <Route path="chatbot/conversations/:conversationId" element={<ChatbotConversationDetail />} />
          <Route path="chatbot/analytics" element={<ChatbotAnalytics />} />
          <Route path="chatbot/config" element={<ChatbotConfig />} />
        </Route>
        
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <InstallPrompt />
    </BrowserRouter>
  );
}

export default App;
