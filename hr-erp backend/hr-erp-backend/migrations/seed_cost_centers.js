require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'hr_erp_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

async function seed() {
  const client = await pool.connect();
  try {
    // Level 1 roots
    await client.query(`
      INSERT INTO cost_centers (name, code, parent_id, description, color, icon) VALUES
        ('Operatív költségek', 'OPR', NULL, 'Napi működési költségek', '#3b82f6', '📊'),
        ('Stratégiai befektetések', 'STR', NULL, 'Hosszú távú befektetések', '#10b981', '📈'),
        ('Emberi erőforrás', 'HR', NULL, 'Munkaerő költségek', '#8b5cf6', '👥')
      ON CONFLICT (code) DO NOTHING
    `);
    console.log('L1: roots');

    // Level 2 under OPR
    for (const [name, code, desc, color, icon] of [
      ['Budapest Projekt', 'OPR-BP', 'Budapesti építkezés', '#f59e0b', '🏗️'],
      ['Szálláshelyek', 'OPR-SZALL', 'Szálláshely költségek', '#ec4899', '🏢'],
      ['Irodai költségek', 'OPR-IRODA', 'Irodai működés', '#6366f1', '🏬'],
    ]) {
      await client.query(`
        INSERT INTO cost_centers (name, code, parent_id, description, color, icon)
        SELECT $1, $2, id, $3, $4, $5
        FROM cost_centers WHERE code = 'OPR'
        ON CONFLICT (code) DO NOTHING
      `, [name, code, desc, color, icon]);
    }

    // Level 2 under STR
    for (const [name, code, desc, color, icon] of [
      ['Ingatlan vásárlás', 'STR-INGAT', 'Új ingatlan beszerzés', '#10b981', '🏘️'],
      ['IT fejlesztés', 'STR-IT', 'Szoftverfejlesztés és rendszerek', '#06b6d4', '💻'],
    ]) {
      await client.query(`
        INSERT INTO cost_centers (name, code, parent_id, description, color, icon)
        SELECT $1, $2, id, $3, $4, $5
        FROM cost_centers WHERE code = 'STR'
        ON CONFLICT (code) DO NOTHING
      `, [name, code, desc, color, icon]);
    }

    // Level 2 under HR
    for (const [name, code, desc, color, icon] of [
      ['Bérek és juttatások', 'HR-BER', 'Fizetések, bónuszok', '#8b5cf6', '💰'],
      ['Képzés és oktatás', 'HR-KEPZES', 'Tréningek, továbbképzés', '#a855f7', '🎓'],
    ]) {
      await client.query(`
        INSERT INTO cost_centers (name, code, parent_id, description, color, icon)
        SELECT $1, $2, id, $3, $4, $5
        FROM cost_centers WHERE code = 'HR'
        ON CONFLICT (code) DO NOTHING
      `, [name, code, desc, color, icon]);
    }
    console.log('L2: children');

    // Level 3 under OPR-BP
    for (const [name, code, desc, color, icon] of [
      ['Rezsi', 'OPR-BP-REZSI', 'Közüzemi költségek', '#f59e0b', '⚡'],
      ['Anyagok', 'OPR-BP-ANYAG', 'Építőanyag beszerzés', '#3b82f6', '🔨'],
      ['Alvállalkozók', 'OPR-BP-ALVAL', 'Alvállalkozói díjak', '#ef4444', '👷'],
    ]) {
      await client.query(`
        INSERT INTO cost_centers (name, code, parent_id, description, color, icon)
        SELECT $1, $2, id, $3, $4, $5
        FROM cost_centers WHERE code = 'OPR-BP'
        ON CONFLICT (code) DO NOTHING
      `, [name, code, desc, color, icon]);
    }

    // Level 3 under OPR-SZALL
    for (const [name, code, desc, color, icon] of [
      ['Budapest Lakás 101', 'OPR-SZALL-BP101', 'Budapest lakás', '#ec4899', '🏠'],
      ['Budapest Lakás 202', 'OPR-SZALL-BP202', 'Budapest lakás 2', '#f472b6', '🏠'],
    ]) {
      await client.query(`
        INSERT INTO cost_centers (name, code, parent_id, description, color, icon)
        SELECT $1, $2, id, $3, $4, $5
        FROM cost_centers WHERE code = 'OPR-SZALL'
        ON CONFLICT (code) DO NOTHING
      `, [name, code, desc, color, icon]);
    }
    console.log('L3: grandchildren');

    // Level 4 under OPR-SZALL-BP101
    for (const [name, code, desc, color, icon] of [
      ['Áram', 'OPR-SZALL-BP101-ARAM', 'Villanyáram', '#f59e0b', '⚡'],
      ['Víz', 'OPR-SZALL-BP101-VIZ', 'Vízfogyasztás', '#3b82f6', '💧'],
      ['Gáz', 'OPR-SZALL-BP101-GAZ', 'Gázfogyasztás', '#ef4444', '🔥'],
      ['Internet', 'OPR-SZALL-BP101-NET', 'Internet szolgáltatás', '#06b6d4', '🌐'],
    ]) {
      await client.query(`
        INSERT INTO cost_centers (name, code, parent_id, description, color, icon)
        SELECT $1, $2, id, $3, $4, $5
        FROM cost_centers WHERE code = 'OPR-SZALL-BP101'
        ON CONFLICT (code) DO NOTHING
      `, [name, code, desc, color, icon]);
    }
    console.log('L4: great-grandchildren');

    // Invoice categories
    const existingCats = await client.query('SELECT COUNT(*) FROM invoice_categories');
    if (parseInt(existingCats.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO invoice_categories (name, icon, color) VALUES
          ('Rezsi (Utilities)', '⚡', '#f59e0b'),
          ('Anyagköltség', '🔨', '#3b82f6'),
          ('Bérköltség', '👷', '#10b981'),
          ('Szolgáltatás', '🛠️', '#8b5cf6'),
          ('Beszerzés', '📦', '#ec4899'),
          ('Marketing', '📢', '#ef4444'),
          ('Egyéb', '📋', '#6b7280')
      `);
      console.log('Invoice categories seeded');
    } else {
      console.log('Invoice categories already exist, skipping');
    }

    // Print tree
    const cc = await client.query('SELECT id, name, code, level, path FROM cost_centers ORDER BY path, name');
    console.log('\n=== Cost Center Tree (' + cc.rows.length + ' total) ===');
    cc.rows.forEach(r => {
      const indent = '  '.repeat((r.level || 1) - 1);
      console.log('  ' + indent + (r.icon || '') + ' ' + (r.code || '?') + ' - ' + r.name + ' (L' + (r.level || '?') + ')');
    });

    const ic = await client.query('SELECT name, icon FROM invoice_categories ORDER BY name');
    console.log('\n=== Invoice Categories (' + ic.rows.length + ') ===');
    ic.rows.forEach(r => console.log('  ' + (r.icon || '') + ' ' + r.name));

    console.log('\nSeed complete!');
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
