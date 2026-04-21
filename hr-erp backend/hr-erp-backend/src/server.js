require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { logger } = require('./utils/logger');
const db = require('./database/connection');

// Security middleware
const { createSecurityHeaders, cspReportHandler, additionalHeaders } = require('./middleware/securityHeaders');
const { globalLimiter, authLimiter, speedLimiter } = require('./middleware/rateLimiter');
const { csrfProtection, csrfTokenHandler } = require('./middleware/csrf');
const { enforceHTTPS } = require('./config/ssl.config');
const { validateSSLConfig } = require('./config/ssl.config');

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
const projectRoutes = require('./routes/project.routes');
const taskRoutes = require('./routes/task.routes');
const taskDirectRoutes = require('./routes/taskDirect.routes');
const timesheetRoutes = require('./routes/timesheet.routes');
const assignmentRuleRoutes = require('./routes/assignmentRule.routes');
const userWorkloadRoutes = require('./routes/userWorkload.routes');
const slaPolicyRoutes = require('./routes/sla.routes');
const invoiceRoutes = require('./routes/invoice.routes');
const invoiceDraftRoutes = require('./routes/invoiceDraft.routes');
const paymentRoutes = require('./routes/payment.routes');
const emailInboxRoutes = require('./routes/emailInbox.routes');
const salaryRoutes = require('./routes/salary.routes');
const wellmindRoutes = require('./routes/wellmind.routes');
const carepathRoutes = require('./routes/carepath.routes');
const wellbeingIntegrationRoutes = require('./routes/wellbeingIntegration.routes');
const housingRoutes = require('./routes/housing.routes');
const gamificationRoutes = require('./routes/gamification.routes');
const slackRoutes = require('./routes/slack.routes');
const nlpRoutes = require('./routes/nlp.routes');
const damageReportRoutes = require('./routes/damageReport.routes');
const translationRoutes = require('./routes/translation.routes');
const classificationRulesRoutes = require('./routes/classificationRules.routes');
const inspectionRoutes = require('./routes/inspection.routes');
const inspectionTemplateRoutes = require('./routes/inspectionTemplate.routes');
const inspectionScheduleRoutes = require('./routes/inspectionSchedule.routes');
const inspectionTaskRoutes = require('./routes/inspectionTask.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const gtdRoutes = require('./routes/gtd.routes');
const googleCalendarController = require('./controllers/google-calendar.controller');
const { startScheduler } = require('./services/report-scheduler.service');
const slackBotService = require('./services/slack/slackBot.service');
const cron = require('node-cron');
const gmailUniversalPoller = require('./services/gmailUniversalPoller.service');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE
// ============================================

// Trust proxy - szükséges Docker/Nginx mögötti futáshoz
// (express-rate-limit és req.ip helyes működéséhez)
app.set('trust proxy', 1);

// 0. HTTPS enforcement (production only)
app.use(enforceHTTPS);

// 1. Security headers (Helmet + custom) — first in stack
app.use(createSecurityHeaders());
app.use(additionalHeaders);

// 2. CORS - never fall back to wildcard '*' with credentials
const corsOptions = {
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : ['http://localhost:3001', 'http://localhost:3000', 'http://localhost:8081'],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
};
if (!process.env.CORS_ORIGIN) {
  logger.warn('CORS_ORIGIN not set — using localhost defaults only');
}
app.use(cors(corsOptions));

// 3. Response compression (gzip/brotli)
app.use(compression());

// 3b. Response time tracking + ETag HTTP caching
const responseTime = require('./middleware/responseTime');
const etagMiddleware = require('./middleware/etag');
app.use(responseTime);
app.use(etagMiddleware);

// 4. Cookie parser (required for CSRF double-submit cookie)
app.use(cookieParser());

// 4. Body parsing — reduced from 10mb to 2mb (per-route overrides for file uploads)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// 5. Rate limiting — global + speed limiter
app.use('/api/', globalLimiter);
app.use('/api/', speedLimiter);

// 6. CSRF protection (skips JWT Bearer requests automatically)
app.use(csrfProtection({
  exemptPaths: ['/auth/google/callback', '/api/health', '/health', '/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/auth/reset-password'],
}));

// 7. Request logging
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

// Health check — basic (k8s liveness)
app.get('/health', (req, res) => res.json({ status: 'OK' }));

// Health check — readiness (deep: checks DB + pool stats)
app.get('/health/ready', async (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid,
    memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
    database: 'unknown',
    redis: require('./config/redis').isConnected() ? 'connected' : 'unavailable',
    pool: db.getPoolStats(),
  };

  try {
    const start = Date.now();
    await db.query('SELECT 1');
    health.database = 'connected';
    health.dbLatency = Date.now() - start + 'ms';
  } catch {
    health.status = 'DEGRADED';
    health.database = 'disconnected';
  }

  const code = health.status === 'OK' ? 200 : 503;
  res.status(code).json(health);
});

// Health check — liveness (k8s)
app.get('/health/live', (req, res) => {
  res.json({ status: 'OK', pid: process.pid, uptime: process.uptime() });
});

// API health (under prefix)
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'ERROR', message: 'Database unavailable' });
  }
});

// API Routes
const API_PREFIX = `/api/${process.env.API_VERSION || 'v1'}`;

// Security endpoints
app.get(`${API_PREFIX}/csrf-token`, csrfTokenHandler);
app.post(`${API_PREFIX}/csp-report`, express.json({ type: 'application/csp-report' }), cspReportHandler);

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
app.use(`${API_PREFIX}/projects`, projectRoutes);
app.use(`${API_PREFIX}/projects/:projectId/tasks`, taskRoutes); // /projects/:projectId/tasks (nested)
app.use(`${API_PREFIX}/tasks`, taskDirectRoutes); // /tasks/:id (direct)
app.use(`${API_PREFIX}/timesheets`, timesheetRoutes);
app.use(`${API_PREFIX}/assignment-rules`, assignmentRuleRoutes);
app.use(`${API_PREFIX}/user-workload`, userWorkloadRoutes);
app.use(`${API_PREFIX}/sla-policies`, slaPolicyRoutes);
app.use(`${API_PREFIX}/invoices`, invoiceRoutes);
app.use(`${API_PREFIX}/payments`, paymentRoutes);
app.use(`${API_PREFIX}/invoice-drafts`, invoiceDraftRoutes);
app.use(`${API_PREFIX}/email-inbox`, emailInboxRoutes);
app.use(`${API_PREFIX}/salary`, salaryRoutes);
app.use(`${API_PREFIX}/wellmind`, wellmindRoutes);
app.use(`${API_PREFIX}/carepath`, carepathRoutes);
app.use(`${API_PREFIX}/wellbeing`, wellbeingIntegrationRoutes);
app.use(`${API_PREFIX}/housing`, housingRoutes);
app.use(`${API_PREFIX}/gamification`, gamificationRoutes);
app.use(`${API_PREFIX}/slack`, slackRoutes);
app.use(`${API_PREFIX}/nlp`, nlpRoutes);
app.use(`${API_PREFIX}/damage-reports`, damageReportRoutes);
app.use(`${API_PREFIX}/translation`, translationRoutes);
app.use(`${API_PREFIX}/classification-rules`, classificationRulesRoutes);
app.use(`${API_PREFIX}/inspections`, inspectionRoutes);
app.use(`${API_PREFIX}/inspection-templates`, inspectionTemplateRoutes);
app.use(`${API_PREFIX}/inspection-schedules`, inspectionScheduleRoutes);
app.use(`${API_PREFIX}/inspection-tasks`, inspectionTaskRoutes);
// Top-level /translate alias — matches the documented contract { text, fromLang, toLang }
const { authenticateToken } = require('./middleware/auth');
app.post(`${API_PREFIX}/translate`, authenticateToken, translationRoutes.translateHandler);
app.use(`${API_PREFIX}/analytics`, analyticsRoutes);
app.use(`${API_PREFIX}/gtd`, gtdRoutes);

// Google OAuth callback (root-level, before 404 handler)
app.get('/auth/google/callback', googleCalendarController.handleGoogleCallback);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint nem található'
  });
});

// Error handler — never leak stack traces or internal details
app.use((err, req, res, next) => {
  logger.error('Server error:', { message: err.message, stack: err.stack, path: req.path });

  const isDev = process.env.NODE_ENV === 'development';
  res.status(err.status || 500).json({
    success: false,
    message: isDev ? err.message : 'Szerver hiba történt',
    ...(isDev && { stack: err.stack }),
  });
});

// ============================================
// SERVER START
// ============================================

async function startServer() {
  try {
    // Validate SSL configuration
    validateSSLConfig();

    // Adatbázis kapcsolat ellenőrzése
    await db.testConnection();
    logger.info('✅ Adatbázis kapcsolat sikeres');

    // Start report scheduler
    startScheduler();

    // Initialize Slack bot (if token set)
    if (process.env.SLACK_BOT_TOKEN) {
      slackBotService.initialize().then(() => {
        logger.info('💬 Slack bot initialized');
      }).catch(err => {
        logger.warn('💬 Slack bot init skipped:', err.message);
      });
    } else {
      logger.info('💬 Slack integration disabled (SLACK_BOT_TOKEN not set)');
    }

    // Start Gmail universal polling (every 5 minutes)
    if (process.env.GMAIL_REFRESH_TOKEN) {
      cron.schedule('*/5 * * * *', () => {
        gmailUniversalPoller.pollAllEmails();
      });
      logger.info('📧 Gmail universal polling started (every 5 min)');
    } else {
      logger.info('📧 Gmail universal polling disabled (GMAIL_REFRESH_TOKEN not set)');
    }

    // Daily inspection automation: auto-create due inspections, mark overdue
    // tasks, refresh trends MV. Runs at 03:00 local time.
    const inspectionAutomation = require('./services/inspectionAutomation.service');
    cron.schedule('0 3 * * *', () => {
      inspectionAutomation.runDaily().catch((err) => {
        logger.error('[cron:inspectionAutomation] failed:', err.message);
      });
    });
    logger.info('📋 Inspection automation cron scheduled (daily at 03:00)');

    // Szerver indítása
    const server = app.listen(PORT, async () => {
      logger.info(`🚀 Szerver fut: http://localhost:${PORT} (PID: ${process.pid})`);
      logger.info(`📡 API endpoint: http://localhost:${PORT}${API_PREFIX}`);
      logger.info(`🌍 Környezet: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔗 DB pool: max=${db.pool.options.max}, min=${db.pool.options.min || 0}`);

      // Cache warming — pre-load frequently accessed data
      try {
        const cacheWarming = require('./services/cacheWarming.service');
        await cacheWarming.warmCriticalData();
        cacheWarming.startPeriodicRefresh();
      } catch (err) {
        logger.warn('Cache warming initialization skipped', { error: err.message });
      }
    });

    // Graceful shutdown handler
    const shutdown = async (signal) => {
      logger.info(`${signal} fogadva — graceful shutdown indítása...`);

      // 1. Stop accepting new connections
      server.close(() => {
        logger.info('HTTP szerver lezárva (új kapcsolatok elutasítva)');
      });

      // 2. Wait for existing requests (max 30s)
      const forceTimeout = setTimeout(() => {
        logger.warn('Graceful shutdown timeout (30s) — kényszerített kilépés');
        process.exit(1);
      }, 30000);

      try {
        // 3. Close DB pool
        await db.closePool();
        clearTimeout(forceTimeout);
        logger.info('Graceful shutdown kész');
        process.exit(0);
      } catch (err) {
        logger.error('Shutdown hiba:', err);
        clearTimeout(forceTimeout);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('❌ Szerver indítási hiba:', error);
    process.exit(1);
  }
}

// Don't auto-listen in test mode — integration tests import `app` via
// supertest and bind to a random port themselves. Attempting to listen on
// PORT (3001) during jest would EADDRINUSE against the dev server.
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

module.exports = app;
