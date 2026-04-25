const express = require('express');
const router  = express.Router();
const { getPool, sql } = require('../db');
const { getContext }   = require('../context');

router.get('/tire-types', async (req, res) => {
  try {
    const { orgId } = getContext(req);
    const pool   = await getPool();
    const result = await pool.request()
      .input('orgId', sql.Int, orgId)
      .query('SELECT * FROM tire_types WHERE organization_id = @orgId ORDER BY sort_order, name');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tire-types', async (req, res) => {
  try {
    const { orgId } = getContext(req);
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const pool = await getPool();

    const dup = await pool.request()
      .input('orgId', sql.Int,      orgId)
      .input('name',  sql.NVarChar, name.trim())
      .query('SELECT COUNT(*) AS cnt FROM tire_types WHERE LOWER(name) = LOWER(@name) AND organization_id = @orgId');
    if (dup.recordset[0].cnt > 0) {
      return res.status(400).json({ error: 'A tire type with this name already exists' });
    }

    const maxOrder = await pool.request()
      .input('orgId', sql.Int, orgId)
      .query('SELECT ISNULL(MAX(sort_order), -1) AS mx FROM tire_types WHERE organization_id = @orgId');

    const result = await pool.request()
      .input('orgId',      sql.Int,      orgId)
      .input('name',       sql.NVarChar, name.trim())
      .input('sort_order', sql.Int,      maxOrder.recordset[0].mx + 1)
      .query(`
        INSERT INTO tire_types (organization_id, name, sort_order)
        OUTPUT INSERTED.*
        VALUES (@orgId, @name, @sort_order)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/tire-types/:id', async (req, res) => {
  try {
    const { orgId } = getContext(req);
    const { name, sort_order } = req.body;
    const pool = await getPool();

    if (name) {
      const dup = await pool.request()
        .input('orgId', sql.Int,      orgId)
        .input('name',  sql.NVarChar, name.trim())
        .input('id',    sql.Int,      req.params.id)
        .query('SELECT COUNT(*) AS cnt FROM tire_types WHERE LOWER(name) = LOWER(@name) AND organization_id = @orgId AND id <> @id');
      if (dup.recordset[0].cnt > 0) {
        return res.status(400).json({ error: 'A tire type with this name already exists' });
      }
    }

    const current = await pool.request()
      .input('id',    sql.Int, req.params.id)
      .input('orgId', sql.Int, orgId)
      .query('SELECT * FROM tire_types WHERE id = @id AND organization_id = @orgId');
    if (!current.recordset.length) return res.status(404).json({ error: 'Not found' });

    const row    = current.recordset[0];
    const result = await pool.request()
      .input('id',         sql.Int,      req.params.id)
      .input('name',       sql.NVarChar, name?.trim() ?? row.name)
      .input('sort_order', sql.Int,      sort_order   ?? row.sort_order)
      .query(`UPDATE tire_types SET name = @name, sort_order = @sort_order OUTPUT INSERTED.* WHERE id = @id`);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/tire-types/:id', async (req, res) => {
  try {
    const { orgId } = getContext(req);
    const pool = await getPool();
    const check = await pool.request()
      .input('id',    sql.Int, req.params.id)
      .input('orgId', sql.Int, orgId)
      .query(`
        SELECT COUNT(*) AS cnt FROM tires t
        INNER JOIN tire_types tt ON t.type = tt.name
        WHERE tt.id = @id AND tt.organization_id = @orgId
      `);
    if (check.recordset[0].cnt > 0) {
      return res.status(400).json({ error: `Cannot delete — ${check.recordset[0].cnt} tire(s) use this type.` });
    }
    await pool.request()
      .input('id',    sql.Int, req.params.id)
      .input('orgId', sql.Int, orgId)
      .query('DELETE FROM tire_types WHERE id = @id AND organization_id = @orgId');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
