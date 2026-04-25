// One-time script to update the admin account password in the live database.
// Run once with: node scripts/reset-admin-password.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const sql    = require('mssql');

const ADMIN_EMAIL = 'zmehmood@tirepro.com';

async function main() {
  const newPassword = process.env.ADMIN_PASSWORD;
  if (!newPassword) {
    console.error('ERROR: Set ADMIN_PASSWORD in server/.env first, then re-run.');
    process.exit(1);
  }

  const pool = await sql.connect({
    server:   process.env.DB_SERVER,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    options:  { trustServerCertificate: true, encrypt: false },
  });

  const hash   = await bcrypt.hash(newPassword, 12);
  const result = await pool.request()
    .input('hash',  sql.NVarChar, hash)
    .input('email', sql.NVarChar, ADMIN_EMAIL)
    .query('UPDATE users SET password_hash = @hash WHERE email = @email');

  if (result.rowsAffected[0] === 0) {
    console.warn('No user found with email:', ADMIN_EMAIL);
  } else {
    console.log('Password updated for', ADMIN_EMAIL);
  }

  await pool.close();
}

main().catch(err => { console.error(err.message); process.exit(1); });
