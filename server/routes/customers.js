const express = require('express');
const router  = express.Router();
const { getPool, sql } = require('../db');
const { getContext }   = require('../context');

router.get('/', async (req, res) => {
  try {
    const { orgId } = getContext(req);
    const pool = await getPool();
    const result = await pool.request()
      .input('orgId', sql.Int, orgId)
      .query(`
        SELECT
          c.*,
          ISNULL((SELECT SUM(s.total)   FROM sales s          WHERE s.customer_id  = c.id AND s.organization_id = @orgId), 0) AS total_invoiced,
          ISNULL((SELECT SUM(sp.amount) FROM sale_payments sp  WHERE sp.customer_id = c.id AND sp.organization_id = @orgId), 0) AS total_paid,
          ISNULL((SELECT SUM(s.total)   FROM sales s          WHERE s.customer_id  = c.id AND s.organization_id = @orgId), 0) -
          ISNULL((SELECT SUM(sp.amount) FROM sale_payments sp  WHERE sp.customer_id = c.id AND sp.organization_id = @orgId), 0) AS balance_due,
          ISNULL((SELECT COUNT(*)       FROM sales s          WHERE s.customer_id  = c.id AND s.organization_id = @orgId), 0) AS invoice_count,
          ISNULL((SELECT COUNT(*)       FROM sales s          WHERE s.customer_id  = c.id AND s.organization_id = @orgId
                                          AND s.status IN ('pending','overdue','partial')), 0) AS unpaid_count
        FROM customers c
        WHERE c.organization_id = @orgId
        ORDER BY balance_due DESC, c.name ASC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { orgId } = getContext(req);
    const pool = await getPool();
    const result = await pool.request()
      .input('id',    sql.Int, req.params.id)
      .input('orgId', sql.Int, orgId)
      .query('SELECT * FROM customers WHERE id = @id AND organization_id = @orgId');
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { orgId } = getContext(req);
    const { name, phone, email, address } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const pool = await getPool();
    const countRes = await pool.request()
      .input('orgId', sql.Int, orgId)
      .query('SELECT COUNT(*) AS cnt FROM customers WHERE organization_id = @orgId');
    const code = `C${String(countRes.recordset[0].cnt + 1).padStart(3, '0')}`;
    const result = await pool.request()
      .input('orgId',   sql.Int,      orgId)
      .input('code',    sql.NVarChar, code)
      .input('name',    sql.NVarChar, name)
      .input('phone',   sql.NVarChar, phone   || '')
      .input('email',   sql.NVarChar, email   || '')
      .input('address', sql.NVarChar, address || '')
      .query(`
        INSERT INTO customers (organization_id, code, name, phone, email, address)
        OUTPUT INSERTED.*
        VALUES (@orgId, @code, @name, @phone, @email, @address)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { orgId } = getContext(req);
    const { name, phone, email, address, balance } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('id',      sql.Int,         req.params.id)
      .input('orgId',   sql.Int,         orgId)
      .input('name',    sql.NVarChar,    name)
      .input('phone',   sql.NVarChar,    phone   || '')
      .input('email',   sql.NVarChar,    email   || '')
      .input('address', sql.NVarChar,    address || '')
      .input('balance', sql.Decimal(18,2), balance || 0)
      .query(`
        UPDATE customers SET name=@name, phone=@phone, email=@email, address=@address, balance=@balance
        OUTPUT INSERTED.*
        WHERE id = @id AND organization_id = @orgId
      `);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { orgId } = getContext(req);
    const pool = await getPool();
    const check = await pool.request()
      .input('id',    sql.Int, req.params.id)
      .input('orgId', sql.Int, orgId)
      .query('SELECT COUNT(*) AS cnt FROM sales WHERE customer_id = @id AND organization_id = @orgId');
    if (check.recordset[0].cnt > 0) {
      return res.status(400).json({ error: 'Cannot delete customer with existing sales records.' });
    }
    await pool.request()
      .input('id',    sql.Int, req.params.id)
      .input('orgId', sql.Int, orgId)
      .query('DELETE FROM customers WHERE id = @id AND organization_id = @orgId');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk', async (req, res) => {
  const { orgId } = getContext(req);
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'No rows provided' });
  }
  const pool = await getPool();
  let inserted = 0;
  const errors = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const name = String(row.name || '').trim();
      if (!name) { errors.push({ row: i + 2, message: 'Name is required' }); continue; }
      const countRes = await pool.request()
        .input('orgId', sql.Int, orgId)
        .query('SELECT COUNT(*) AS cnt FROM customers WHERE organization_id = @orgId');
      const code = `C${String(countRes.recordset[0].cnt + 1).padStart(3, '0')}`;
      await pool.request()
        .input('orgId',   sql.Int,      orgId)
        .input('code',    sql.NVarChar, code)
        .input('name',    sql.NVarChar, name)
        .input('phone',   sql.NVarChar, String(row.phone   || ''))
        .input('email',   sql.NVarChar, String(row.email   || ''))
        .input('address', sql.NVarChar, String(row.address || ''))
        .query('INSERT INTO customers (organization_id,code,name,phone,email,address) VALUES (@orgId,@code,@name,@phone,@email,@address)');
      inserted++;
    } catch (err) {
      errors.push({ row: i + 2, message: err.message });
    }
  }
  res.json({ inserted, errors });
});

module.exports = router;
