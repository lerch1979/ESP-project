const { Pool } = require('pg');
const { logger } = require('../utils/logger');

// SSL configuration for production
const sslConfig = process.env.DB_SSL === 'true'
  ? {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      ca: process.env.DB_SSL_CA || undefined,
    }
  : false;

// PostgreSQL connection pool — production-tuned
const isProduction = process.env.NODE_ENV === 'production';
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'hr_erp_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: parseInt(process.env.DB_POOL_MAX) || (isProduction ? 100 : 20),
  min: parseInt(process.env.DB_POOL_MIN) || (isProduction ? 10 : 2),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000, // kill queries running >30s
  ssl: sslConfig,
});

// Pool monitoring
let poolStats = { totalConnections: 0, errors: 0 };

pool.on('connect', () => {
  poolStats.totalConnections++;
  logger.debug('Új adatbázis kapcsolat létrejött');
});

pool.on('error', (err) => {
  poolStats.errors++;
  logger.error('Váratlan adatbázis hiba:', err);
});

pool.on('remove', () => {
  logger.debug('Adatbázis kapcsolat lezárva');
});

const getPoolStats = () => ({
  total: pool.totalCount,
  idle: pool.idleCount,
  waiting: pool.waitingCount,
  lifetime: poolStats,
});

// Query helper function
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    logger.debug('Lekérdezés végrehajtva', {
      query: text,
      duration: `${duration}ms`,
      rows: res.rowCount
    });
    
    return res;
  } catch (error) {
    logger.error('Lekérdezési hiba:', {
      query: text,
      error: error.message
    });
    throw error;
  }
};

// Transaction helper
const transaction = async (callback) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Test connection
const testConnection = async () => {
  try {
    const result = await query('SELECT NOW() as current_time');
    logger.info('Adatbázis kapcsolat teszt sikeres', {
      time: result.rows[0].current_time
    });
    return true;
  } catch (error) {
    logger.error('Adatbázis kapcsolat teszt sikertelen:', error);
    throw error;
  }
};

// Graceful pool shutdown
const closePool = async () => {
  logger.info('Adatbázis kapcsolatok lezárása...');
  await pool.end();
  logger.info('Adatbázis pool lezárva');
};

module.exports = {
  pool,
  query,
  transaction,
  testConnection,
  getPoolStats,
  closePool,
};
