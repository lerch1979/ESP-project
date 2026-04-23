const winston = require('winston');
const path = require('path');
const { getRequestId } = require('../middleware/requestId');

let DailyRotateFile;
try {
  DailyRotateFile = require('winston-daily-rotate-file');
} catch { /* optional dependency */ }

// Inject the current request_id (from AsyncLocalStorage) into every log line.
// Runs as a winston format so it applies across transports and below all other formatters.
const injectRequestId = winston.format((info) => {
  if (info.request_id) return info;
  const id = getRequestId();
  if (id) info.request_id = id;
  return info;
});

const logFormat = winston.format.combine(
  injectRequestId(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  injectRequestId(),
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, request_id, ...metadata }) => {
    const rid = request_id ? ` [${String(request_id).slice(0, 8)}]` : '';
    let msg = `${timestamp}${rid} [${level}] : ${message}`;
    if (Object.keys(metadata).length > 0 && metadata.service === undefined) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Default log level is env-aware when LOG_LEVEL is unset.
//   production:  info     (default signal/noise balance)
//   test:        error    (keep CI output clean)
//   development: debug    (verbose local dev)
function defaultLevel() {
  if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;
  switch (process.env.NODE_ENV) {
    case 'production': return 'info';
    case 'test':       return 'error';
    default:           return 'debug';
  }
}

// Build transports — use daily rotation if available, fallback to basic file
const transports = [];

if (DailyRotateFile) {
  transports.push(
    new DailyRotateFile({
      filename: path.join('logs', 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '30d',
      maxSize: '20m',
    }),
    new DailyRotateFile({
      filename: path.join('logs', 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      maxSize: '20m',
    })
  );
} else {
  transports.push(
    new winston.transports.File({ filename: path.join('logs', 'error.log'), level: 'error', maxsize: 5242880, maxFiles: 5 }),
    new winston.transports.File({ filename: path.join('logs', 'combined.log'), maxsize: 5242880, maxFiles: 5 })
  );
}

const logger = winston.createLogger({
  level: defaultLevel(),
  format: logFormat,
  defaultMeta: { service: 'hr-erp-api' },
  transports,
});

// Console in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({ format: consoleFormat }));
}

module.exports = { logger };
