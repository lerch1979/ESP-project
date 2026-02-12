const { Pool } = require('pg');
const { logger } = require('../utils/logger');

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'hr_erp_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20, // Maximum pool connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Pool event handlers
pool.on('connect', () => {
  logger.debug('Új adatbázis kapcsolat létrejött');
});

pool.on('error', (err) => {
  logger.error('Váratlan adatbázis hiba:', err);
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

module.exports = {
  pool,
  query,
  transaction,
  testConnection
};
