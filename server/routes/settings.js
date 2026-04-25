const express = require('express');
const router  = express.Router();
const { getPool, sql } = require('../db');
const { getContext }   = require('../context');

router.get('/', async (req, res) => {
  try {
    const { orgId } = getContext(req);
    const pool   = await getPool();
    const result = await pool.request()
      .input('org_id', sql.Int, orgId)
      .query('SELECT [key], value FROM settings WHERE organization_id = @org_id');
    const map = {};
    for (const row of result.recordset) map[row.key] = row.value;
    res.json(map);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { orgId } = getContext(req);
    const pool    = await getPool();
    const entries = Object.entries(req.body || {});
    if (!entries.length) return res.status(400).json({ error: 'No settings provided' });

    for (const [key, value] of entries) {
      await pool.request()
        .input('org_id', sql.Int,      orgId)
        .input('key',    sql.NVarChar, key)
        .input('value',  sql.NVarChar, String(value ?? ''))
        .query(`
          MERGE settings AS target
          USING (SELECT @org_id AS organization_id, @key AS [key]) AS source
            ON target.organization_id = source.organization_id AND target.[key] = source.[key]
          WHEN MATCHED     THEN UPDATE SET value = @value, updated_at = GETDATE()
          WHEN NOT MATCHED THEN INSERT (organization_id, [key], value) VALUES (@org_id, @key, @value);
        `);
    }

    const result = await pool.request()
      .input('org_id', sql.Int, orgId)
      .query('SELECT [key], value FROM settings WHERE organization_id = @org_id');
    const map = {};
    for (const row of result.recordset) map[row.key] = row.value;
    res.json(map);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
