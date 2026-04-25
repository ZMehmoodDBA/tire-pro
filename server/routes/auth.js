const express   = require('express');
const bcrypt    = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const router    = express.Router();
const { getPool, sql } = require('../db');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
router.use(authLimiter);

function isValidEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}
function sanitize(s, maxLen = 200) {
  if (typeof s !== 'string') return '';
  return s.trim().slice(0, maxLen);
}

// POST /api/auth/register
// Creates: organization → first branch (Main Branch) → org_admin user
router.post('/register', async (req, res) => {
  try {
    const {
      fullName, email, password, phone,
      org_name, org_type, org_address, org_phone, org_email,
      branch_name,
    } = req.body || {};

    const name        = sanitize(fullName, 100);
    const cleanEmail  = sanitize(email, 100).toLowerCase();
    const cleanPhone  = sanitize(phone, 50);
    const cleanOrgName = sanitize(org_name, 200);

    if (!name)                     return res.status(400).json({ error: 'Full name is required' });
    if (!isValidEmail(cleanEmail)) return res.status(400).json({ error: 'Enter a valid email address' });
    if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (!cleanOrgName)             return res.status(400).json({ error: 'Organization name is required' });

    const pool = await getPool();

    // Check duplicate email
    const existing = await pool.request()
      .input('email', sql.NVarChar, cleanEmail)
      .query('SELECT id FROM users WHERE email = @email');
    if (existing.recordset.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // Generate org code
    let orgCode = cleanOrgName.toUpperCase().replace(/[^A-Z0-9]/g, '-').replace(/-+/g, '-').slice(0, 20);
    const dupCode = await pool.request()
      .input('code', sql.NVarChar, orgCode)
      .query('SELECT id FROM organizations WHERE code = @code');
    if (dupCode.recordset.length > 0) orgCode = `${orgCode}-${Date.now().toString().slice(-4)}`;

    // 1. Create organization
    const orgRes = await pool.request()
      .input('name',    sql.NVarChar, cleanOrgName)
      .input('code',    sql.NVarChar, orgCode)
      .input('type',    sql.NVarChar, sanitize(org_type, 50) || 'retail')
      .input('address', sql.NVarChar, sanitize(org_address, 500))
      .input('phone',   sql.NVarChar, sanitize(org_phone, 50))
      .input('email',   sql.NVarChar, sanitize(org_email, 200))
      .query(`
        INSERT INTO organizations (name, code, type, address, phone, email)
        OUTPUT INSERTED.*
        VALUES (@name, @code, @type, @address, @phone, @email)
      `);
    const org = orgRes.recordset[0];

    // 2. Create first branch
    const firstBranch = sanitize(branch_name, 200) || 'Main Branch';
    const branchRes = await pool.request()
      .input('org_id',  sql.Int,      org.id)
      .input('name',    sql.NVarChar, firstBranch)
      .input('code',    sql.NVarChar, 'MAIN')
      .input('address', sql.NVarChar, sanitize(org_address, 500))
      .input('phone',   sql.NVarChar, sanitize(org_phone, 50))
      .query(`
        INSERT INTO branches (organization_id, name, code, address, phone)
        OUTPUT INSERTED.*
        VALUES (@org_id, @name, @code, @address, @phone)
      `);
    const branch = branchRes.recordset[0];

    // 3. Seed default settings for this org
    const defaults = [
      ['company_name',        cleanOrgName],
      ['company_tagline',     ''],
      ['company_address',     sanitize(org_address, 500)],
      ['company_phone',       sanitize(org_phone, 50)],
      ['company_email',       sanitize(org_email, 200)],
      ['invoice_prefix',      'INV'],
      ['po_prefix',           'PO'],
      ['default_tax_rate',    '15'],
      ['payment_due_days',    '30'],
      ['default_sale_status', 'pending'],
      ['currency',            'PKR'],
      ['announcement',        ''],
    ];
    for (const [key, value] of defaults) {
      await pool.request()
        .input('org_id', sql.Int,      org.id)
        .input('key',    sql.NVarChar, key)
        .input('value',  sql.NVarChar, value)
        .query(`INSERT INTO settings (organization_id, [key], value) VALUES (@org_id, @key, @value)`);
    }

    // 4. Create org_admin user (branch_id = NULL → sees all branches)
    const hash = await bcrypt.hash(password, 12);
    await pool.request()
      .input('name',            sql.NVarChar, name)
      .input('email',           sql.NVarChar, cleanEmail)
      .input('phone',           sql.NVarChar, cleanPhone)
      .input('password_hash',   sql.NVarChar, hash)
      .input('role',            sql.NVarChar, 'org_admin')
      .input('organization_id', sql.Int,      org.id)
      .query(`
        INSERT INTO users (name, email, phone, password_hash, role, organization_id)
        VALUES (@name, @email, @phone, @password_hash, @role, @organization_id)
      `);

    res.status(201).json({ success: true, organization_id: org.id, branch_id: branch.id });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const cleanEmail = sanitize(email, 100).toLowerCase();
    if (!isValidEmail(cleanEmail)) return res.status(400).json({ error: 'Enter a valid email address' });
    if (!password)                 return res.status(400).json({ error: 'Password is required' });

    const pool = await getPool();
    const result = await pool.request()
      .input('email', sql.NVarChar, cleanEmail)
      .query(`
        SELECT u.id, u.name, u.email, u.role, u.password_hash, u.is_active,
               u.organization_id, u.branch_id,
               o.name AS org_name, o.code AS org_code, o.currency AS org_currency
        FROM users u
        LEFT JOIN organizations o ON o.id = u.organization_id
        WHERE u.email = @email
      `);

    const user = result.recordset[0];
    const dummyHash = '$2a$12$invaliddummyhashtopreventtimingattacks000000000000000000';
    const hashToCheck = user ? user.password_hash : dummyHash;
    const match = await bcrypt.compare(password, hashToCheck);

    if (!user || !match)  return res.status(401).json({ error: 'Invalid email or password' });
    if (!user.is_active)  return res.status(403).json({ error: 'Your account has been deactivated' });

    // Fetch branches for this org
    const branchRes = await pool.request()
      .input('org_id', sql.Int, user.organization_id || 1)
      .query('SELECT id, name, code, address, phone FROM branches WHERE organization_id = @org_id AND is_active = 1 ORDER BY name');

    res.json({
      id:              user.id,
      name:            user.name,
      email:           user.email,
      role:            user.role,
      organization_id: user.organization_id || 1,
      branch_id:       user.branch_id,          // null = org admin (picks a branch on login)
      organization: {
        name:     user.org_name,
        code:     user.org_code,
        currency: user.org_currency || 'PKR',
      },
      branches: branchRes.recordset,
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

module.exports = router;
