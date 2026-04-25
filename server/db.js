const sql    = require('mssql');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const baseConfig = {
  server: process.env.DB_SERVER || 'localhost',
  user:   process.env.DB_USER   || 'sa',
  password: process.env.DB_PASSWORD || '',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  connectionTimeout: 15000,
  requestTimeout:    30000,
};

let pool = null;

async function getPool() {
  // Reconnect if the pool was closed or errored
  if (!pool || !pool.connected) {
    if (pool) { try { await pool.close(); } catch (_) {} }
    pool = new sql.ConnectionPool({ ...baseConfig, database: process.env.DB_NAME || 'TireProDB' });
    pool.on('error', err => {
      console.error('SQL pool error:', err.message);
      pool = null; // force reconnect on next call
    });
    await pool.connect();
  }
  return pool;
}

async function getSetting(key, defaultValue = '', orgId = 1) {
  try {
    const p = await getPool();
    const result = await p.request()
      .input('key',    sql.NVarChar, key)
      .input('org_id', sql.Int,      orgId)
      .query('SELECT value FROM settings WHERE [key] = @key AND organization_id = @org_id');
    return result.recordset[0]?.value ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

async function setupDatabase() {
  const masterPool = new sql.ConnectionPool({ ...baseConfig, database: 'master' });
  await masterPool.connect();
  await masterPool.request().query(`
    IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'TireProDB')
    BEGIN
      CREATE DATABASE TireProDB;
    END
  `);
  await masterPool.close();

  const dbPool = new sql.ConnectionPool({ ...baseConfig, database: 'TireProDB' });
  await dbPool.connect();
  const r = dbPool.request();

  await r.query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='customers' AND xtype='U')
    CREATE TABLE customers (
      id          INT IDENTITY(1,1) PRIMARY KEY,
      code        NVARCHAR(20)  UNIQUE NOT NULL,
      name        NVARCHAR(100) NOT NULL,
      phone       NVARCHAR(50),
      email       NVARCHAR(100),
      address     NVARCHAR(200),
      balance     DECIMAL(18,2) DEFAULT 0,
      created_at  DATETIME DEFAULT GETDATE()
    )
  `);

  await r.query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='suppliers' AND xtype='U')
    CREATE TABLE suppliers (
      id          INT IDENTITY(1,1) PRIMARY KEY,
      code        NVARCHAR(20)  UNIQUE NOT NULL,
      name        NVARCHAR(100) NOT NULL,
      phone       NVARCHAR(50),
      email       NVARCHAR(100),
      address     NVARCHAR(200),
      balance     DECIMAL(18,2) DEFAULT 0,
      created_at  DATETIME DEFAULT GETDATE()
    )
  `);

  await r.query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='tires' AND xtype='U')
    CREATE TABLE tires (
      id            INT IDENTITY(1,1) PRIMARY KEY,
      brand         NVARCHAR(100) NOT NULL,
      model         NVARCHAR(100) NOT NULL,
      size          NVARCHAR(50)  NOT NULL,
      type          NVARCHAR(50),
      stock         INT DEFAULT 0,
      cost_price    DECIMAL(18,2) NOT NULL DEFAULT 0,
      sale_price    DECIMAL(18,2) NOT NULL DEFAULT 0,
      reorder_level INT DEFAULT 10,
      created_at    DATETIME DEFAULT GETDATE()
    )
  `);

  // Products / goods catalog (services, accessories, non-tire items)
  await r.query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='products' AND xtype='U')
    CREATE TABLE products (
      id          INT IDENTITY(1,1) PRIMARY KEY,
      code        NVARCHAR(50),
      name        NVARCHAR(200) NOT NULL,
      description NVARCHAR(500),
      category    NVARCHAR(100),
      unit        NVARCHAR(50) DEFAULT 'pcs',
      cost_price  DECIMAL(18,2) DEFAULT 0,
      sale_price  DECIMAL(18,2) DEFAULT 0,
      is_active   BIT DEFAULT 1,
      created_at  DATETIME DEFAULT GETDATE()
    )
  `);

  await r.query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='sales' AND xtype='U')
    CREATE TABLE sales (
      id           INT IDENTITY(1,1) PRIMARY KEY,
      invoice_no   NVARCHAR(50)  UNIQUE NOT NULL,
      customer_id  INT REFERENCES customers(id),
      date         DATE NOT NULL,
      subtotal     DECIMAL(18,2) NOT NULL DEFAULT 0,
      tax          DECIMAL(18,2) NOT NULL DEFAULT 0,
      total        DECIMAL(18,2) NOT NULL DEFAULT 0,
      status       NVARCHAR(20)  DEFAULT 'pending',
      notes        NVARCHAR(500),
      created_at   DATETIME DEFAULT GETDATE()
    )
  `);

  await r.query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='sale_items' AND xtype='U')
    CREATE TABLE sale_items (
      id          INT IDENTITY(1,1) PRIMARY KEY,
      sale_id     INT REFERENCES sales(id) ON DELETE CASCADE,
      tire_id     INT REFERENCES tires(id),
      product_id  INT REFERENCES products(id),
      tire_name   NVARCHAR(200),
      qty         INT NOT NULL DEFAULT 1,
      unit_price  DECIMAL(18,2) NOT NULL DEFAULT 0,
      amount      DECIMAL(18,2) NOT NULL DEFAULT 0
    )
  `);

  await r.query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='purchases' AND xtype='U')
    CREATE TABLE purchases (
      id           INT IDENTITY(1,1) PRIMARY KEY,
      po_no        NVARCHAR(50)  UNIQUE NOT NULL,
      supplier_id  INT REFERENCES suppliers(id),
      date         DATE NOT NULL,
      subtotal     DECIMAL(18,2) NOT NULL DEFAULT 0,
      tax          DECIMAL(18,2) NOT NULL DEFAULT 0,
      total        DECIMAL(18,2) NOT NULL DEFAULT 0,
      status       NVARCHAR(20)  DEFAULT 'pending',
      notes        NVARCHAR(500),
      created_at   DATETIME DEFAULT GETDATE()
    )
  `);

  await r.query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='purchase_items' AND xtype='U')
    CREATE TABLE purchase_items (
      id           INT IDENTITY(1,1) PRIMARY KEY,
      purchase_id  INT REFERENCES purchases(id) ON DELETE CASCADE,
      tire_id      INT REFERENCES tires(id),
      product_id   INT REFERENCES products(id),
      tire_name    NVARCHAR(200),
      qty          INT NOT NULL DEFAULT 1,
      unit_price   DECIMAL(18,2) NOT NULL DEFAULT 0,
      amount       DECIMAL(18,2) NOT NULL DEFAULT 0
    )
  `);

  // Settings key-value store
  await r.query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='settings' AND xtype='U')
    CREATE TABLE settings (
      [key]      NVARCHAR(100) PRIMARY KEY,
      value      NVARCHAR(1000),
      updated_at DATETIME DEFAULT GETDATE()
    )
  `);

  // Payments against sales invoices (for partial/full payment tracking)
  await r.query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='sale_payments' AND xtype='U')
    CREATE TABLE sale_payments (
      id             INT IDENTITY(1,1) PRIMARY KEY,
      sale_id        INT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      customer_id    INT NOT NULL REFERENCES customers(id),
      amount         DECIMAL(18,2) NOT NULL,
      payment_date   DATE NOT NULL,
      payment_method NVARCHAR(50) DEFAULT 'cash',
      reference_no   NVARCHAR(100) DEFAULT '',
      notes          NVARCHAR(500) DEFAULT '',
      created_at     DATETIME DEFAULT GETDATE()
    )
  `);

  // Payments to suppliers against purchase orders
  await r.query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='purchase_payments' AND xtype='U')
    CREATE TABLE purchase_payments (
      id             INT IDENTITY(1,1) PRIMARY KEY,
      purchase_id    INT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      supplier_id    INT NOT NULL REFERENCES suppliers(id),
      amount         DECIMAL(18,2) NOT NULL,
      payment_date   DATE NOT NULL,
      payment_method NVARCHAR(50) DEFAULT 'cash',
      reference_no   NVARCHAR(100) DEFAULT '',
      notes          NVARCHAR(500) DEFAULT '',
      created_at     DATETIME DEFAULT GETDATE()
    )
  `);

  // Financial ledger — immutable journal entries (banking-style)
  await r.query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ledger_entries' AND xtype='U')
    CREATE TABLE ledger_entries (
      id           INT IDENTITY(1,1) PRIMARY KEY,
      entry_date   DATE NOT NULL,
      entity_type  NVARCHAR(20) NOT NULL,
      entity_id    INT NOT NULL,
      entry_type   NVARCHAR(30) NOT NULL,
      debit        DECIMAL(18,2) DEFAULT 0,
      credit       DECIMAL(18,2) DEFAULT 0,
      description  NVARCHAR(500) DEFAULT '',
      reference_no NVARCHAR(100) DEFAULT '',
      sale_id      INT REFERENCES sales(id),
      purchase_id  INT REFERENCES purchases(id),
      created_at   DATETIME DEFAULT GETDATE()
    )
  `);

  // Tire type lookups
  await r.query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='tire_types' AND xtype='U')
    CREATE TABLE tire_types (
      id         INT IDENTITY(1,1) PRIMARY KEY,
      name       NVARCHAR(100) NOT NULL,
      sort_order INT DEFAULT 0
    )
  `);

  // ── Multi-org / multi-branch ───────────────────────────────────────────────
  await r.query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='organizations' AND xtype='U')
    CREATE TABLE organizations (
      id           INT IDENTITY(1,1) PRIMARY KEY,
      name         NVARCHAR(200) NOT NULL,
      code         NVARCHAR(50)  NOT NULL,
      type         NVARCHAR(50)  DEFAULT 'retail',
      address      NVARCHAR(500),
      phone        NVARCHAR(50),
      email        NVARCHAR(200),
      currency     NVARCHAR(10)  DEFAULT 'PKR',
      logo_url     NVARCHAR(500),
      is_active    BIT           DEFAULT 1,
      created_at   DATETIME2     DEFAULT GETDATE(),
      CONSTRAINT UQ_org_code UNIQUE (code)
    )
  `);

  await r.query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='branches' AND xtype='U')
    CREATE TABLE branches (
      id              INT IDENTITY(1,1) PRIMARY KEY,
      organization_id INT NOT NULL,
      name            NVARCHAR(200) NOT NULL,
      code            NVARCHAR(50)  NOT NULL,
      address         NVARCHAR(500),
      phone           NVARCHAR(50),
      email           NVARCHAR(200),
      is_active       BIT           DEFAULT 1,
      created_at      DATETIME2     DEFAULT GETDATE()
    )
  `);

  // Users table — password_hash stores bcrypt hash (never plaintext)
  await r.query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
    CREATE TABLE users (
      id            INT IDENTITY(1,1) PRIMARY KEY,
      name          NVARCHAR(100) NOT NULL,
      email         NVARCHAR(100) NOT NULL,
      phone         NVARCHAR(50),
      company       NVARCHAR(100),
      city          NVARCHAR(100),
      password_hash NVARCHAR(255) NOT NULL,
      role          NVARCHAR(50)  DEFAULT 'Administrator',
      is_active     BIT           DEFAULT 1,
      created_at    DATETIME      DEFAULT GETDATE(),
      CONSTRAINT UQ_users_email UNIQUE (email)
    )
  `);

  // Migrations — add columns to existing tables if they don't have them yet
  await dbPool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('sale_items') AND name = 'product_id')
      ALTER TABLE sale_items ADD product_id INT REFERENCES products(id);
  `);
  await dbPool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('purchase_items') AND name = 'product_id')
      ALTER TABLE purchase_items ADD product_id INT REFERENCES products(id);
  `);
  await dbPool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('sales') AND name = 'tax_rate')
      ALTER TABLE sales ADD tax_rate DECIMAL(5,2) DEFAULT 0;
  `);
  await dbPool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('sales') AND name = 'amount_paid')
      ALTER TABLE sales ADD amount_paid DECIMAL(18,2) DEFAULT 0;
  `);
  await dbPool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('purchases') AND name = 'amount_paid')
      ALTER TABLE purchases ADD amount_paid DECIMAL(18,2) DEFAULT 0;
  `);

  // ── Multi-org column migrations ────────────────────────────────────────────
  // Org-scoped tables (no branch_id — entity is shared across all branches of an org)
  for (const tbl of ['customers', 'suppliers', 'products', 'tire_types']) {
    await dbPool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('${tbl}') AND name = 'organization_id')
        ALTER TABLE ${tbl} ADD organization_id INT NOT NULL DEFAULT 1
    `);
  }
  // Branch-scoped tables
  for (const tbl of ['tires', 'sales', 'purchases', 'sale_payments', 'purchase_payments', 'ledger_entries']) {
    await dbPool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('${tbl}') AND name = 'organization_id')
        ALTER TABLE ${tbl} ADD organization_id INT NOT NULL DEFAULT 1
    `);
    await dbPool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('${tbl}') AND name = 'branch_id')
        ALTER TABLE ${tbl} ADD branch_id INT NOT NULL DEFAULT 1
    `);
  }
  // Users: organization_id (required) + branch_id (null = org admin sees all branches)
  await dbPool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'organization_id')
      ALTER TABLE users ADD organization_id INT NOT NULL DEFAULT 1
  `);
  await dbPool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'branch_id')
      ALTER TABLE users ADD branch_id INT NULL
  `);

  // Settings: migrate to per-org key-value (change PK from (key) to (organization_id, key))
  const settingsOrgExists = await dbPool.request().query(
    `SELECT COUNT(*) AS cnt FROM sys.columns WHERE object_id = OBJECT_ID('settings') AND name = 'organization_id'`
  );
  if (settingsOrgExists.recordset[0].cnt === 0) {
    await dbPool.request().query(`ALTER TABLE settings ADD organization_id INT NOT NULL DEFAULT 1`);
    // Drop old single-column PK
    const pkRow = await dbPool.request().query(`
      SELECT kc.name AS pk_name
      FROM sys.key_constraints kc
      JOIN sys.tables t ON t.object_id = kc.parent_object_id
      WHERE t.name = 'settings' AND kc.type = 'PK'
    `);
    const pkName = pkRow.recordset[0]?.pk_name;
    if (pkName) {
      await dbPool.request().query(`ALTER TABLE settings DROP CONSTRAINT [${pkName}]`);
    }
    await dbPool.request().query(
      `ALTER TABLE settings ADD CONSTRAINT PK_settings PRIMARY KEY (organization_id, [key])`
    );
  }

  // Seed default organization + branch (only if none exist)
  const orgCount = await dbPool.request().query('SELECT COUNT(*) AS cnt FROM organizations');
  if (orgCount.recordset[0].cnt === 0) {
    const orgRes = await dbPool.request()
      .input('name', sql.NVarChar, 'TirePro')
      .input('code', sql.NVarChar, 'TIREPRO')
      .input('type', sql.NVarChar, 'retail')
      .query(`INSERT INTO organizations (name, code, type) OUTPUT INSERTED.id VALUES (@name, @code, @type)`);
    const defaultOrgId = orgRes.recordset[0].id;
    await dbPool.request()
      .input('org_id', sql.Int,      defaultOrgId)
      .input('name',   sql.NVarChar, 'Main Branch')
      .input('code',   sql.NVarChar, 'MAIN')
      .query(`INSERT INTO branches (organization_id, name, code) VALUES (@org_id, @name, @code)`);
    console.log('✅ Default organization and branch seeded');
  }

  // Seed default settings for org 1 (only if table is empty)
  const settingsCount = await dbPool.request()
    .query(`SELECT COUNT(*) AS cnt FROM settings WHERE organization_id = 1`);
  if (settingsCount.recordset[0].cnt === 0) {
    const defaults = [
      ['company_name',        'TirePro'],
      ['company_tagline',     'Tyre & Wheel Solutions'],
      ['company_address',     '123 Industrial Zone, Lahore, Pakistan'],
      ['company_phone',       '+92-42-1234567'],
      ['company_email',       'info@tirepro.pk'],
      ['invoice_prefix',      'INV'],
      ['po_prefix',           'PO'],
      ['default_tax_rate',    '15'],
      ['payment_due_days',    '30'],
      ['default_sale_status', 'pending'],
      ['currency',            'PKR'],
      ['announcement',        ''],
    ];
    for (const [key, value] of defaults) {
      await dbPool.request()
        .input('org_id', sql.Int,      1)
        .input('key',    sql.NVarChar, key)
        .input('value',  sql.NVarChar, value)
        .query(`INSERT INTO settings (organization_id, [key], value) VALUES (@org_id, @key, @value)`);
    }
  }

  // Seed default tire types (only if empty)
  const typesCount = await dbPool.request()
    .query('SELECT COUNT(*) AS cnt FROM tire_types');
  if (typesCount.recordset[0].cnt === 0) {
    const types = ['Passenger', 'SUV', '4x4', 'LT', 'Performance', 'Motorcycle'];
    for (let i = 0; i < types.length; i++) {
      await dbPool.request()
        .input('name',       sql.NVarChar, types[i])
        .input('sort_order', sql.Int,      i)
        .query(`INSERT INTO tire_types (name, sort_order) VALUES (@name, @sort_order)`);
    }
  }

  // Ensure announcement key exists for org 1 on existing databases
  await dbPool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM settings WHERE organization_id = 1 AND [key] = 'announcement')
      INSERT INTO settings (organization_id, [key], value) VALUES (1, 'announcement', '')
  `);

  // Seed admin user — only inserts once; safe to run on every restart
  const adminEmail = 'zmehmood@tirepro.com';
  const adminCheck = await dbPool.request()
    .input('email', sql.NVarChar, adminEmail)
    .query('SELECT id FROM users WHERE email = @email');
  if (adminCheck.recordset.length === 0) {
    const hash = await bcrypt.hash('Boca6920', 12);
    await dbPool.request()
      .input('name',            sql.NVarChar, 'Ziyad Mehmood')
      .input('email',           sql.NVarChar, adminEmail)
      .input('password_hash',   sql.NVarChar, hash)
      .input('company',         sql.NVarChar, 'TirePro')
      .input('role',            sql.NVarChar, 'org_admin')
      .input('organization_id', sql.Int,      1)
      .query(`
        INSERT INTO users (name, email, password_hash, company, role, organization_id)
        VALUES (@name, @email, @password_hash, @company, @role, @organization_id)
      `);
    console.log('✅ Admin user seeded:', adminEmail);
  } else {
    // Backfill existing admin with org context
    await dbPool.request()
      .input('email',           sql.NVarChar, adminEmail)
      .input('organization_id', sql.Int,      1)
      .query(`
        UPDATE users SET organization_id = @organization_id
        WHERE email = @email AND organization_id = 0
      `);
  }

  await dbPool.close();

  pool = new sql.ConnectionPool({ ...baseConfig, database: 'TireProDB' });
  await pool.connect();
  console.log('✅ Database TireProDB and all tables ready.');
}

module.exports = { getPool, setupDatabase, getSetting, sql };
