const express = require('express');
const router  = express.Router();
const { getPool, sql } = require('../db');
const { getContext }   = require('../context');

router.get('/', async (req, res) => {
  try {
    const { orgId } = getContext(req);
    const pool   = await getPool();
    const result = await pool.request()
      .input('orgId', sql.Int, orgId)
      .query('SELECT * FROM products WHERE organization_id = @orgId ORDER BY category, name');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { orgId } = getContext(req);
    const { code, name, description, category, unit, cost_price, sale_price, is_active } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const pool   = await getPool();
    const result = await pool.request()
      .input('orgId',       sql.Int,          orgId)
      .input('code',        sql.NVarChar,     code?.trim()        || null)
      .input('name',        sql.NVarChar,     name.trim())
      .input('description', sql.NVarChar,     description?.trim() || '')
      .input('category',    sql.NVarChar,     category?.trim()    || '')
      .input('unit',        sql.NVarChar,     unit?.trim()        || 'pcs')
      .input('cost_price',  sql.Decimal(18,2), Number(cost_price) || 0)
      .input('sale_price',  sql.Decimal(18,2), Number(sale_price) || 0)
      .input('is_active',   sql.Bit,           is_active !== false ? 1 : 0)
      .query(`
        INSERT INTO products (organization_id, code, name, description, category, unit, cost_price, sale_price, is_active)
        OUTPUT INSERTED.*
        VALUES (@orgId, @code, @name, @description, @category, @unit, @cost_price, @sale_price, @is_active)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { orgId } = getContext(req);
    const { code, name, description, category, unit, cost_price, sale_price, is_active } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const pool   = await getPool();
    const result = await pool.request()
      .input('id',          sql.Int,           req.params.id)
      .input('orgId',       sql.Int,           orgId)
      .input('code',        sql.NVarChar,     code?.trim()        || null)
      .input('name',        sql.NVarChar,     name.trim())
      .input('description', sql.NVarChar,     description?.trim() || '')
      .input('category',    sql.NVarChar,     category?.trim()    || '')
      .input('unit',        sql.NVarChar,     unit?.trim()        || 'pcs')
      .input('cost_price',  sql.Decimal(18,2), Number(cost_price) || 0)
      .input('sale_price',  sql.Decimal(18,2), Number(sale_price) || 0)
      .input('is_active',   sql.Bit,           is_active !== false ? 1 : 0)
      .query(`
        UPDATE products
        SET code=@code, name=@name, description=@description, category=@category,
            unit=@unit, cost_price=@cost_price, sale_price=@sale_price, is_active=@is_active
        OUTPUT INSERTED.*
        WHERE id = @id AND organization_id = @orgId
      `);
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { orgId } = getContext(req);
    const pool = await getPool();
    const usedRes = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT COUNT(*) AS cnt FROM (
          SELECT product_id FROM sale_items     WHERE product_id = @id
          UNION ALL
          SELECT product_id FROM purchase_items WHERE product_id = @id
        ) x
      `);
    if (usedRes.recordset[0].cnt > 0) {
      return res.status(409).json({ error: 'Cannot delete — product is used in existing transactions. Deactivate it instead.' });
    }
    await pool.request()
      .input('id',    sql.Int, req.params.id)
      .input('orgId', sql.Int, orgId)
      .query('DELETE FROM products WHERE id = @id AND organization_id = @orgId');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
