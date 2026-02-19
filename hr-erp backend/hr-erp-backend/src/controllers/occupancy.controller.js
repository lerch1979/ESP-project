const { query } = require('../database/connection');
const { logger } = require('../utils/logger');


// ============================================================
// GET /reports/occupancy/daily?date=YYYY-MM-DD
// ============================================================

const getDailyOccupancy = async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const accommodationsResult = await query(`
      SELECT
        a.id,
        a.name,
        a.address,
        a.type,
        COALESCE(a.capacity, 0) as total_beds,
        COUNT(e.id) as occupied_beds,
        COALESCE(a.capacity, 0) - COUNT(e.id) as free_beds,
        CASE WHEN COALESCE(a.capacity, 0) > 0
          THEN ROUND((COUNT(e.id)::numeric / a.capacity) * 100)
          ELSE 0
        END as occupancy_percentage,
        COALESCE(
          json_agg(
            json_build_object('name', CONCAT(e.last_name, ' ', e.first_name), 'room_number', e.room_number)
          ) FILTER (WHERE e.id IS NOT NULL),
          '[]'::json
        ) as current_residents
      FROM accommodations a
      LEFT JOIN employees e
        ON e.accommodation_id = a.id
        AND e.arrival_date <= $1
        AND (e.end_date IS NULL OR e.end_date > $1)
      WHERE a.is_active = true
      GROUP BY a.id, a.name, a.address, a.type, a.capacity
      ORDER BY a.name
    `, [date]);

    const accommodations = accommodationsResult.rows.map(r => ({
      id: r.id,
      name: r.name,
      address: r.address,
      type: r.type,
      total_beds: parseInt(r.total_beds),
      occupied_beds: parseInt(r.occupied_beds),
      free_beds: parseInt(r.free_beds),
      occupancy_percentage: parseInt(r.occupancy_percentage),
      current_residents: r.current_residents,
    }));

    const totalBeds = accommodations.reduce((sum, a) => sum + a.total_beds, 0);
    const totalOccupied = accommodations.reduce((sum, a) => sum + a.occupied_beds, 0);
    const totalFree = totalBeds - totalOccupied;
    const overallPercentage = totalBeds > 0 ? Math.round((totalOccupied / totalBeds) * 100) : 0;

    res.json({
      success: true,
      data: {
        date,
        summary: {
          total_beds: totalBeds,
          occupied_beds: totalOccupied,
          free_beds: totalFree,
          occupancy_percentage: overallPercentage,
        },
        accommodations,
      },
    });
  } catch (error) {
    logger.error('Napi kihasználtság riport hiba:', error);
    res.status(500).json({ success: false, message: 'Napi kihasználtság lekérési hiba' });
  }
};


// ============================================================
// GET /reports/occupancy/monthly?year=YYYY&month=MM
// ============================================================

const getMonthlyOccupancy = async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year) || now.getFullYear();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;

    // Daily trend across all accommodations
    const dailyTrendResult = await query(`
      WITH days AS (
        SELECT d::date as day
        FROM generate_series(
          $1::date,
          ($1::date + INTERVAL '1 month' - INTERVAL '1 day')::date,
          '1 day'
        ) d
      ),
      active_acc AS (
        SELECT id, COALESCE(capacity, 0) as capacity
        FROM accommodations
        WHERE is_active = true
      ),
      per_acc_daily AS (
        SELECT
          d.day,
          aa.id as acc_id,
          aa.capacity,
          COUNT(e.id) as occupied
        FROM days d
        CROSS JOIN active_acc aa
        LEFT JOIN employees e
          ON e.accommodation_id = aa.id
          AND e.arrival_date <= d.day
          AND (e.end_date IS NULL OR e.end_date > d.day)
        GROUP BY d.day, aa.id, aa.capacity
      ),
      daily_counts AS (
        SELECT
          day,
          SUM(capacity) as total_capacity,
          SUM(occupied) as total_occupied
        FROM per_acc_daily
        GROUP BY day
      )
      SELECT
        to_char(day, 'YYYY-MM-DD') as date,
        total_occupied::int,
        total_capacity::int,
        CASE WHEN total_capacity > 0
          THEN ROUND((total_occupied::numeric / total_capacity) * 100)
          ELSE 0
        END as percentage
      FROM daily_counts
      ORDER BY day
    `, [firstDay]);

    // Per-accommodation monthly stats
    const perAccResult = await query(`
      WITH days AS (
        SELECT d::date as day
        FROM generate_series(
          $1::date,
          ($1::date + INTERVAL '1 month' - INTERVAL '1 day')::date,
          '1 day'
        ) d
      ),
      daily AS (
        SELECT
          a.id,
          a.name,
          COALESCE(a.capacity, 0) as capacity,
          d.day,
          COUNT(e.id) as occupied
        FROM accommodations a
        CROSS JOIN days d
        LEFT JOIN employees e
          ON e.accommodation_id = a.id
          AND e.arrival_date <= d.day
          AND (e.end_date IS NULL OR e.end_date > d.day)
        WHERE a.is_active = true
        GROUP BY a.id, a.name, a.capacity, d.day
      )
      SELECT
        id,
        name,
        capacity,
        SUM(occupied) as total_nights,
        ROUND(AVG(CASE WHEN capacity > 0 THEN (occupied::numeric / capacity) * 100 ELSE 0 END)) as avg_occupancy_pct,
        MAX(occupied) as peak_occupied,
        MIN(occupied) as lowest_occupied
      FROM daily
      GROUP BY id, name, capacity
      ORDER BY name
    `, [firstDay]);

    // Top residents by nights stayed
    const topResidentsResult = await query(`
      WITH days AS (
        SELECT d::date as day
        FROM generate_series(
          $1::date,
          ($1::date + INTERVAL '1 month' - INTERVAL '1 day')::date,
          '1 day'
        ) d
      )
      SELECT
        CONCAT(e.last_name, ' ', e.first_name) as name,
        a.name as accommodation_name,
        COUNT(d.day) as nights_stayed
      FROM employees e
      JOIN accommodations a ON e.accommodation_id = a.id
      CROSS JOIN days d
      WHERE e.arrival_date <= d.day
        AND (e.end_date IS NULL OR e.end_date > d.day)
        AND a.is_active = true
      GROUP BY e.id, e.last_name, e.first_name, a.name
      ORDER BY nights_stayed DESC
      LIMIT 10
    `, [firstDay]);

    const dailyTrend = dailyTrendResult.rows.map(r => ({
      date: r.date,
      total_occupied: parseInt(r.total_occupied),
      total_capacity: parseInt(r.total_capacity),
      percentage: parseInt(r.percentage),
    }));

    const totalNights = dailyTrend.reduce((sum, d) => sum + d.total_occupied, 0);
    const totalCapacityNights = dailyTrend.reduce((sum, d) => sum + d.total_capacity, 0);
    const avgPercentage = totalCapacityNights > 0
      ? Math.round((totalNights / totalCapacityNights) * 100)
      : 0;
    const peakDay = dailyTrend.reduce((max, d) => d.percentage > (max?.percentage || 0) ? d : max, null);
    const lowestDay = dailyTrend.reduce((min, d) => d.percentage < (min?.percentage ?? Infinity) ? d : min, null);

    res.json({
      success: true,
      data: {
        year,
        month,
        summary: {
          total_nights: totalNights,
          total_capacity_nights: totalCapacityNights,
          avg_occupancy_percentage: avgPercentage,
          peak_day: peakDay,
          lowest_day: lowestDay,
        },
        daily_trend: dailyTrend,
        accommodations: perAccResult.rows.map(r => ({
          id: r.id,
          name: r.name,
          capacity: parseInt(r.capacity),
          total_nights: parseInt(r.total_nights),
          avg_occupancy_pct: parseInt(r.avg_occupancy_pct),
          peak_occupied: parseInt(r.peak_occupied),
          lowest_occupied: parseInt(r.lowest_occupied),
        })),
        top_residents: topResidentsResult.rows.map(r => ({
          name: r.name,
          accommodation_name: r.accommodation_name,
          nights_stayed: parseInt(r.nights_stayed),
        })),
      },
    });
  } catch (error) {
    logger.error('Havi kihasználtság riport hiba:', error);
    res.status(500).json({ success: false, message: 'Havi kihasználtság lekérési hiba' });
  }
};


// ============================================================
// GET /reports/occupancy/range?from=YYYY-MM-DD&to=YYYY-MM-DD
// ============================================================

const getRangeOccupancy = async (req, res) => {
  try {
    const now = new Date();
    const to = req.query.to || now.toISOString().slice(0, 10);
    const from = req.query.from || new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);

    // Overall range stats
    const overallResult = await query(`
      WITH days AS (
        SELECT d::date as day
        FROM generate_series($1::date, $2::date, '1 day') d
      ),
      active_acc AS (
        SELECT id, COALESCE(capacity, 0) as capacity
        FROM accommodations WHERE is_active = true
      ),
      per_acc_daily AS (
        SELECT
          d.day,
          aa.id as acc_id,
          aa.capacity,
          COUNT(e.id) as occupied
        FROM days d
        CROSS JOIN active_acc aa
        LEFT JOIN employees e
          ON e.accommodation_id = aa.id
          AND e.arrival_date <= d.day
          AND (e.end_date IS NULL OR e.end_date > d.day)
        GROUP BY d.day, aa.id, aa.capacity
      ),
      daily_counts AS (
        SELECT
          day,
          SUM(capacity) as total_capacity,
          SUM(occupied) as total_occupied
        FROM per_acc_daily
        GROUP BY day
      )
      SELECT
        SUM(total_occupied) as total_nights,
        SUM(total_capacity) as total_capacity_nights,
        CASE WHEN SUM(total_capacity) > 0
          THEN ROUND((SUM(total_occupied)::numeric / SUM(total_capacity)) * 100)
          ELSE 0
        END as avg_occupancy_percentage
      FROM daily_counts
    `, [from, to]);

    // Turnover & average stay
    const turnoverResult = await query(`
      SELECT
        COUNT(DISTINCT e.id) as turnover,
        COALESCE(
          ROUND(AVG(
            LEAST(COALESCE(e.end_date, $2::date), $2::date) - GREATEST(e.arrival_date, $1::date) + 1
          )::numeric, 1),
          0
        ) as avg_stay_duration
      FROM employees e
      JOIN accommodations a ON e.accommodation_id = a.id AND a.is_active = true
      WHERE e.arrival_date <= $2
        AND (e.end_date IS NULL OR e.end_date >= $1)
    `, [from, to]);

    // Per-accommodation breakdown
    const perAccResult = await query(`
      WITH days AS (
        SELECT d::date as day
        FROM generate_series($1::date, $2::date, '1 day') d
      ),
      daily AS (
        SELECT
          a.id,
          a.name,
          COALESCE(a.capacity, 0) as capacity,
          d.day,
          COUNT(e.id) as occupied
        FROM accommodations a
        CROSS JOIN days d
        LEFT JOIN employees e
          ON e.accommodation_id = a.id
          AND e.arrival_date <= d.day
          AND (e.end_date IS NULL OR e.end_date > d.day)
        WHERE a.is_active = true
        GROUP BY a.id, a.name, a.capacity, d.day
      )
      SELECT
        id,
        name,
        capacity,
        SUM(occupied) as total_nights,
        ROUND(AVG(CASE WHEN capacity > 0 THEN (occupied::numeric / capacity) * 100 ELSE 0 END)) as avg_occupancy_pct,
        MAX(occupied) as peak_occupied
      FROM daily
      GROUP BY id, name, capacity
      ORDER BY name
    `, [from, to]);

    const overall = overallResult.rows[0];
    const turnover = turnoverResult.rows[0];

    res.json({
      success: true,
      data: {
        from,
        to,
        summary: {
          total_nights: parseInt(overall.total_nights) || 0,
          total_capacity_nights: parseInt(overall.total_capacity_nights) || 0,
          average_occupancy_percentage: parseInt(overall.avg_occupancy_percentage) || 0,
          average_stay_duration: parseFloat(turnover.avg_stay_duration) || 0,
          turnover: parseInt(turnover.turnover) || 0,
        },
        accommodations: perAccResult.rows.map(r => ({
          id: r.id,
          name: r.name,
          capacity: parseInt(r.capacity),
          total_nights: parseInt(r.total_nights),
          avg_occupancy_pct: parseInt(r.avg_occupancy_pct),
          peak_occupied: parseInt(r.peak_occupied),
        })),
      },
    });
  } catch (error) {
    logger.error('Időszakos kihasználtság riport hiba:', error);
    res.status(500).json({ success: false, message: 'Időszakos kihasználtság lekérési hiba' });
  }
};


module.exports = {
  getDailyOccupancy,
  getMonthlyOccupancy,
  getRangeOccupancy,
};
