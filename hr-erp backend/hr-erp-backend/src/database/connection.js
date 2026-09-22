const { Pool, types } = require('pg');
const { logger } = require('../utils/logger');

// ─── DATE (OID 1082) SZÖVEGKÉNT, NEM Date OBJEKTUMKÉNT ──────────────────────
//
// A pg alapból JS `Date`-té alakítja a DATE oszlopokat, LOKÁLIS éjfélre. Ebből két
// külön hiba fakad, és ebben a repóban ÖTSZÖR fordult elő 2026 tavasza és szeptembere
// között:
//
//   1. `toISOString()` egy ilyen Date-en Budapesten EGY NAPPAL VISSZATOL
//      (2026-09-22 00:00 CEST → "2026-09-21T22:00:00Z" → "2026-09-21"). Ez rontotta el
//      209 születési dátumot az áprilisi importnál, és három saját szkriptem kimenetét.
//   2. `String()`-je "Mon Sep 22 2026 00:00:00 GMT+0200" — emberi szemnek olvashatatlan,
//      és a jelentésekben nyersen jelent meg.
//
// Az eddigi javítások mind HELYIEK voltak (kézi `getFullYear/getMonth/getDate`
// formázás), tehát minden új hívási hely újra elkövethette ugyanazt. Ez a beállítás a
// FORRÁSNÁL szünteti meg: a DATE pontosan az marad, ami a adatbázisban van — egy
// 'YYYY-MM-DD' szöveg —, amibe az időzóna nem tud belenyúlni.
//
// ⚠️ MIT NEM ÉRINT: a `timestamp` (1114) és a `timestamptz` (1184) továbbra is Date
// objektumként jön. Azoknál az időpont maga az adat, tehát a Date a helyes forma — a
// DATE-nél viszont nincs is időpont, csak egy naptári nap.
types.setTypeParser(types.builtins.DATE, (value) => value);

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
  // Cap below Postgres max_connections (100) so pg_dump/psql/admin always have
  // headroom. If cluster mode is enabled (N workers), set DB_POOL_MAX to ~80/N.
  max: parseInt(process.env.DB_POOL_MAX) || (isProduction ? 80 : 20),
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
