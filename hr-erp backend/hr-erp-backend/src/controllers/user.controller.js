const pool = require('../database/connection');

// Felhasználók lekérdezése (role szűrővel)
const getUsers = async (req, res) => {
  try {
    const { role } = req.query;
    const userId = req.user?.id; // Auth middleware-ből
    const contractorId = req.user?.contractorId; // Auth middleware-ből
    
    let query = `
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        u.contractor_id,
        u.created_at
      FROM users u
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    // Contractor szűrés (ha nem superadmin)
    if (contractorId) {
      query += ` AND u.contractor_id = $${paramIndex}`;
      params.push(contractorId);
      paramIndex++;
    }
    
    // Szerepkör szerinti szűrés
    if (role) {
      query += ` AND EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = u.id AND r.slug = $${paramIndex}
      )`;
      params.push(role);
      paramIndex++;
    }
    
    query += ` ORDER BY u.first_name, u.last_name`;

    console.log('Users query:', query);
    console.log('Params:', params);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: {
        users: result.rows,
        count: result.rows.length,
      },
    });
  } catch (error) {
    console.error('Felhasználók lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba a felhasználók lekérdezése során',
      error: error.message,
    });
  }
};

// Felhasználó részletek
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        u.contractor_id,
        u.created_at
       FROM users u
       WHERE u.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Felhasználó nem található',
      });
    }

    res.json({
      success: true,
      data: {
        user: result.rows[0],
      },
    });
  } catch (error) {
    console.error('Felhasználó lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba a felhasználó lekérdezése során',
    });
  }
};

module.exports = {
  getUsers,
  getUserById,
};