const express = require('express');
const router  = express.Router();
const { getPool, sql } = require('../db');
const { getContext }   = require('../context');

router.get('/', async (req, res) => {
  try {
    const { orgId, branchId } = getContext(req);
    const pool   = await getPool();
    const result = await pool.request()
      .input('orgId',    sql.Int, orgId)
      .input('branchId', sql.Int, branchId)
      .query('SELECT * FROM tires WHERE organization_id = @orgId AND branch_id = @branchId ORDER BY brand, model');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { orgId, branchId } = getContext(req);
    const pool   = await getPool();
    const result = await pool.request()
      .input('id',       sql.Int, req.params.id)
      .input('orgId',    sql.Int, orgId)
      .input('branchId', sql.Int, branchId)
      .query('SELECT * FROM tires WHERE id = @id AND organization_id = @orgId AND branch_id = @branchId');
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { orgId, branchId } = getContext(req);
    const { brand, model, size, type, stock, cost_price, sale_price, reorder_level } = req.body;
    if (!brand || !model || !size) return res.status(400).json({ error: 'Brand, model, and size are required' });
    const pool   = await getPool();
    const result = await pool.request()
      .input('orgId',         sql.Int,          orgId)
      .input('branchId',      sql.Int,          branchId)
      .input('brand',         sql.NVarChar,     brand)
      .input('model',         sql.NVarChar,     model)
      .input('size',          sql.NVarChar,     size)
      .input('type',          sql.NVarChar,     type || 'Passenger')
      .input('stock',         sql.Int,          stock || 0)
      .input('cost_price',    sql.Decimal(18,2), cost_price || 0)
      .input('sale_price',    sql.Decimal(18,2), sale_price || 0)
      .input('reorder_level', sql.Int,          reorder_level || 10)
      .query(`
        INSERT INTO tires (organization_id, branch_id, brand, model, size, type, stock, cost_price, sale_price, reorder_level)
        OUTPUT INSERTED.*
        VALUES (@orgId, @branchId, @brand, @model, @size, @type, @stock, @cost_price, @sale_price, @reorder_level)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { orgId, branchId } = getContext(req);
    const { brand, model, size, type, stock, cost_price, sale_price, reorder_level } = req.body;
    const pool   = await getPool();
    const result = await pool.request()
      .input('id',            sql.Int,          req.params.id)
      .input('orgId',         sql.Int,          orgId)
      .input('branchId',      sql.Int,          branchId)
      .input('brand',         sql.NVarChar,     brand)
      .input('model',         sql.NVarChar,     model)
      .input('size',          sql.NVarChar,     size)
      .input('type',          sql.NVarChar,     type || 'Passenger')
      .input('stock',         sql.Int,          stock || 0)
      .input('cost_price',    sql.Decimal(18,2), cost_price || 0)
      .input('sale_price',    sql.Decimal(18,2), sale_price || 0)
      .input('reorder_level', sql.Int,          reorder_level || 10)
      .query(`
        UPDATE tires SET brand=@brand, model=@model, size=@size, type=@type,
          stock=@stock, cost_price=@cost_price, sale_price=@sale_price, reorder_level=@reorder_level
        OUTPUT INSERTED.*
        WHERE id = @id AND organization_id = @orgId AND branch_id = @branchId
      `);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { orgId, branchId } = getContext(req);
    const pool = await getPool();
    const saleCheck = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT COUNT(*) AS cnt FROM sale_items WHERE tire_id = @id');
    if (saleCheck.recordset[0].cnt > 0) {
      return res.status(400).json({ error: 'Cannot delete tire — it appears in existing sales records.' });
    }
    const poCheck = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT COUNT(*) AS cnt FROM purchase_items WHERE tire_id = @id');
    if (poCheck.recordset[0].cnt > 0) {
      return res.status(400).json({ error: 'Cannot delete tire — it appears in existing purchase orders.' });
    }
    await pool.request()
      .input('id',       sql.Int, req.params.id)
      .input('orgId',    sql.Int, orgId)
      .input('branchId', sql.Int, branchId)
      .query('DELETE FROM tires WHERE id = @id AND organization_id = @orgId AND branch_id = @branchId');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk', async (req, res) => {
  const { orgId, branchId } = getContext(req);
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
      const brand = String(row.brand || '').trim();
      const model = String(row.model || '').trim();
      const size  = String(row.size  || '').trim();
      if (!brand || !model || !size) {
        errors.push({ row: i + 2, message: 'brand, model, and size are required' });
        continue;
      }
      await pool.request()
        .input('orgId',         sql.Int,          orgId)
        .input('branchId',      sql.Int,          branchId)
        .input('brand',         sql.NVarChar,     brand)
        .input('model',         sql.NVarChar,     model)
        .input('size',          sql.NVarChar,     size)
        .input('type',          sql.NVarChar,     String(row.type || 'Passenger'))
        .input('cost_price',    sql.Decimal(18,2), parseFloat(row.cost_price  || 0))
        .input('sale_price',    sql.Decimal(18,2), parseFloat(row.sale_price  || 0))
        .input('stock',         sql.Int,           parseInt(row.stock         || 0))
        .input('reorder_level', sql.Int,           parseInt(row.reorder_level || 5))
        .query(`
          INSERT INTO tires (organization_id,branch_id,brand,model,size,type,cost_price,sale_price,stock,reorder_level)
          VALUES (@orgId,@branchId,@brand,@model,@size,@type,@cost_price,@sale_price,@stock,@reorder_level)
        `);
      inserted++;
    } catch (err) {
      errors.push({ row: i + 2, message: err.message });
    }
  }
  res.json({ inserted, errors });
});

module.exports = router;
