require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { logger } = require('./utils/logger');
const db = require('./database/connection');

// Routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const ticketRoutes = require('./routes/ticket.routes');
const notificationRoutes = require('./routes/notification.routes');
const categoryRoutes = require('./routes/category.routes');
const priorityRoutes = require('./routes/priority.routes');
const statusRoutes = require('./routes/status.routes');
const contractorRoutes = require('./routes/contractor.routes');
const accommodationRoutes = require('./routes/accommodation.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const employeeRoutes = require('./routes/employee.routes');
const exportRoutes = require('./routes/export.routes');
const reportRoutes = require('./routes/report.routes');
const calendarRoutes = require('./routes/calendar.routes');
const documentRoutes = require('./routes/document.routes');
const googleCalendarRoutes = require('./routes/google-calendar.routes');
const videoRoutes = require('./routes/video.routes');
const searchRoutes = require('./routes/search.routes');
const notificationCenterRoutes = require('./routes/notification-center.routes');
const activityLogRoutes = require('./routes/activity-log.routes');
const preferencesRoutes = require('./routes/preferences.routes');
const scheduledReportRoutes = require('./routes/scheduled-report.routes');
const chatbotRoutes = require('./routes/chatbot.routes');
const permissionRoutes = require('./routes/permission.routes');
const emailTemplateRoutes = require('./routes/email-template.routes');
const costCenterRoutes = require('./routes/costCenter.routes');
const invoiceReportRoutes = require('./routes/invoiceReport.routes');
const googleCalendarController = require('./controllers/google-calendar.controller');
const { startScheduler } = require('./services/report-scheduler.service');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE
// ============================================

// Security
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// CORS
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Túl sok kérés erről az IP címről, kérjük próbálja később.'
});
app.use('/api/', limiter);

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// ============================================
// STATIC FILES
// ============================================

const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ============================================
// ROUTES
// ============================================

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routes
const API_PREFIX = `/api/${process.env.API_VERSION || 'v1'}`;

app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/users`, userRoutes);
app.use(`${API_PREFIX}/tickets`, ticketRoutes);
app.use(`${API_PREFIX}/notifications`, notificationRoutes);
app.use(`${API_PREFIX}/categories`, categoryRoutes);
app.use(`${API_PREFIX}/priorities`, priorityRoutes);
app.use(`${API_PREFIX}/statuses`, statusRoutes);
app.use(`${API_PREFIX}/contractors`, contractorRoutes);
app.use(`${API_PREFIX}/accommodations`, accommodationRoutes);
app.use(`${API_PREFIX}/dashboard`, dashboardRoutes);
app.use(`${API_PREFIX}/employees`, employeeRoutes);
app.use(`${API_PREFIX}/export`, exportRoutes);
app.use(`${API_PREFIX}/reports`, reportRoutes);
app.use(`${API_PREFIX}/calendar`, calendarRoutes);
app.use(`${API_PREFIX}/documents`, documentRoutes);
app.use(`${API_PREFIX}/calendar/google`, googleCalendarRoutes);
app.use(`${API_PREFIX}/videos`, videoRoutes);
app.use(`${API_PREFIX}/search`, searchRoutes);
app.use(`${API_PREFIX}/notification-center`, notificationCenterRoutes);
app.use(`${API_PREFIX}/activity-log`, activityLogRoutes);
app.use(`${API_PREFIX}/preferences`, preferencesRoutes);
app.use(`${API_PREFIX}/scheduled-reports`, scheduledReportRoutes);
app.use(`${API_PREFIX}/chatbot`, chatbotRoutes);
app.use(`${API_PREFIX}/permissions`, permissionRoutes);
app.use(`${API_PREFIX}/email-templates`, emailTemplateRoutes);
app.use(`${API_PREFIX}/cost-centers`, costCenterRoutes);
app.use(`${API_PREFIX}/invoice-reports`, invoiceReportRoutes);

// Google OAuth callback (root-level, before 404 handler)
app.get('/auth/google/callback', googleCalendarController.handleGoogleCallback);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint nem található'
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Server error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Szerver hiba történt',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================
// SERVER START
// ============================================

async function startServer() {
  try {
    // Adatbázis kapcsolat ellenőrzése
    await db.testConnection();
    logger.info('✅ Adatbázis kapcsolat sikeres');

    // Start report scheduler
    startScheduler();

    // Szerver indítása
    app.listen(PORT, () => {
      logger.info(`🚀 Szerver fut: http://localhost:${PORT}`);
      logger.info(`📡 API endpoint: http://localhost:${PORT}${API_PREFIX}`);
      logger.info(`🌍 Környezet: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('❌ Szerver indítási hiba:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal fogadva, szerver leállítás...');
  await db.pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal fogadva, szerver leállítás...');
  await db.pool.end();
  process.exit(0);
});

startServer();

module.exports = app;
