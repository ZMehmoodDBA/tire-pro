const express = require('express');
const router  = express.Router();
const { getPool, getSetting, sql } = require('../db');
const { getContext } = require('../context');

router.get('/', async (req, res) => {
  try {
    const { orgId, branchId } = getContext(req);
    const pool   = await getPool();
    const result = await pool.request()
      .input('orgId',    sql.Int, orgId)
      .input('branchId', sql.Int, branchId)
      .query(`
        SELECT s.*, c.name AS customer_name, c.code AS customer_code
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.organization_id = @orgId AND s.branch_id = @branchId
        ORDER BY s.created_at DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MUST be before /:id
router.get('/by-tire-type', async (req, res) => {
  try {
    const { orgId, branchId } = getContext(req);
    const pool   = await getPool();
    const result = await pool.request()
      .input('orgId',    sql.Int, orgId)
      .input('branchId', sql.Int, branchId)
      .query(`
        SELECT
          ISNULL(NULLIF(LTRIM(RTRIM(t.type)), ''), 'Other') AS tire_type,
          COUNT(si.id)   AS item_count,
          SUM(si.amount) AS revenue
        FROM sale_items si
        INNER JOIN tires t ON si.tire_id = t.id
        INNER JOIN sales s ON si.sale_id = s.id
        WHERE s.organization_id = @orgId AND s.branch_id = @branchId
        GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(t.type)), ''), 'Other')
        ORDER BY revenue DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MUST be before /:id
router.get('/stats/summary', async (req, res) => {
  try {
    const { orgId, branchId } = getContext(req);
    const pool   = await getPool();
    const result = await pool.request()
      .input('orgId',    sql.Int, orgId)
      .input('branchId', sql.Int, branchId)
      .query(`
        SELECT
          SUM(total) AS total_revenue,
          COUNT(*) AS total_sales,
          SUM(CASE WHEN status != 'paid' THEN total ELSE 0 END) AS pending_amount,
          COUNT(CASE WHEN status != 'paid' THEN 1 END) AS pending_count
        FROM sales
        WHERE organization_id = @orgId AND branch_id = @branchId
      `);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { orgId } = getContext(req);
    const pool = await getPool();
    const saleRes = await pool.request()
      .input('id',    sql.Int, req.params.id)
      .input('orgId', sql.Int, orgId)
      .query(`
        SELECT s.*, c.name AS customer_name, c.code AS customer_code,
               c.phone AS customer_phone, c.email AS customer_email, c.address AS customer_address
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.id = @id AND s.organization_id = @orgId
      `);
    if (!saleRes.recordset.length) return res.status(404).json({ error: 'Not found' });

    const itemsRes = await pool.request()
      .input('sale_id', sql.Int, req.params.id)
      .query(`
        SELECT si.*, t.brand, t.model, t.size,
               p.name AS product_name, p.category AS product_category, p.unit AS product_unit
        FROM sale_items si
        LEFT JOIN tires    t ON si.tire_id    = t.id
        LEFT JOIN products p ON si.product_id = p.id
        WHERE si.sale_id = @sale_id
      `);
    res.json({ ...saleRes.recordset[0], items: itemsRes.recordset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { orgId, branchId } = getContext(req);
  const pool        = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    const { customer_id, date, items, tax_rate = 15, status = 'pending', notes } = req.body;
    if (!customer_id) return res.status(400).json({ error: 'Customer is required' });
    if (!items?.length) return res.status(400).json({ error: 'At least one item is required' });

    const countRes = await pool.request()
      .input('orgId', sql.Int, orgId)
      .query('SELECT COUNT(*) AS cnt FROM sales WHERE organization_id = @orgId');
    const prefix    = await getSetting('invoice_prefix', 'INV', orgId);
    const invoiceNo = `${prefix}-${new Date().getFullYear()}-${String(countRes.recordset[0].cnt + 1).padStart(3, '0')}`;

    const subtotal = items.reduce((s, it) => s + (it.qty * it.unit_price), 0);
    const tax      = parseFloat((subtotal * (tax_rate / 100)).toFixed(2));
    const total    = parseFloat((subtotal + tax).toFixed(2));

    await transaction.begin();

    const saleRes = await new sql.Request(transaction)
      .input('org_id',     sql.Int,          orgId)
      .input('branch_id',  sql.Int,          branchId)
      .input('invoice_no', sql.NVarChar,     invoiceNo)
      .input('customer_id',sql.Int,          customer_id)
      .input('date',       sql.Date,         date || new Date())
      .input('subtotal',   sql.Decimal(18,2), subtotal)
      .input('tax',        sql.Decimal(18,2), tax)
      .input('total',      sql.Decimal(18,2), total)
      .input('status',     sql.NVarChar,     status)
      .input('notes',      sql.NVarChar,     notes || '')
      .query(`
        INSERT INTO sales (organization_id, branch_id, invoice_no, customer_id, date, subtotal, tax, total, status, notes)
        OUTPUT INSERTED.*
        VALUES (@org_id, @branch_id, @invoice_no, @customer_id, @date, @subtotal, @tax, @total, @status, @notes)
      `);
    const saleId = saleRes.recordset[0].id;

    for (const item of items) {
      const itemName  = item.tire_name || item.item_name || (item.tire_id ? `Tire #${item.tire_id}` : `Product #${item.product_id}`);
      const amount    = parseFloat((item.qty * item.unit_price).toFixed(2));
      const tireId    = item.tire_id    ? Number(item.tire_id)    : null;
      const productId = item.product_id ? Number(item.product_id) : null;
      await new sql.Request(transaction)
        .input('sale_id',    sql.Int,          saleId)
        .input('tire_id',    sql.Int,          tireId)
        .input('product_id', sql.Int,          productId)
        .input('tire_name',  sql.NVarChar,     itemName)
        .input('qty',        sql.Int,          item.qty)
        .input('unit_price', sql.Decimal(18,2), item.unit_price)
        .input('amount',     sql.Decimal(18,2), amount)
        .query(`INSERT INTO sale_items (sale_id,tire_id,product_id,tire_name,qty,unit_price,amount) VALUES (@sale_id,@tire_id,@product_id,@tire_name,@qty,@unit_price,@amount)`);

      if (tireId) {
        await new sql.Request(transaction)
          .input('tire_id', sql.Int, tireId)
          .input('qty',     sql.Int, item.qty)
          .query('UPDATE tires SET stock = stock - @qty WHERE id = @tire_id');
      }
    }

    await transaction.commit();
    res.status(201).json({ ...saleRes.recordset[0], invoice_no: invoiceNo });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['paid', 'partial', 'pending', 'overdue'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }
    const { orgId } = getContext(req);
    const pool = await getPool();
    await pool.request()
      .input('id',    sql.Int,      req.params.id)
      .input('orgId', sql.Int,      orgId)
      .input('status',sql.NVarChar, status)
      .query('UPDATE sales SET status = @status WHERE id = @id AND organization_id = @orgId');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const { orgId } = getContext(req);
  const pool        = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    const itemsRes = await new sql.Request(transaction)
      .input('sale_id', sql.Int, req.params.id)
      .query('SELECT tire_id, qty FROM sale_items WHERE sale_id = @sale_id');

    for (const item of itemsRes.recordset) {
      if (item.tire_id) {
        await new sql.Request(transaction)
          .input('tire_id', sql.Int, item.tire_id)
          .input('qty',     sql.Int, item.qty)
          .query('UPDATE tires SET stock = stock + @qty WHERE id = @tire_id');
      }
    }

    await new sql.Request(transaction)
      .input('id',    sql.Int, req.params.id)
      .input('orgId', sql.Int, orgId)
      .query('DELETE FROM sales WHERE id = @id AND organization_id = @orgId');

    await transaction.commit();
    res.json({ success: true });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk', async (req, res) => {
  const { orgId, branchId } = getContext(req);
  const { invoices } = req.body;
  if (!Array.isArray(invoices) || invoices.length === 0) {
    return res.status(400).json({ error: 'No invoices provided' });
  }
  const pool   = await getPool();
  const prefix = await getSetting('invoice_prefix', 'INV', orgId);
  let inserted = 0;
  const errors = [];

  for (const inv of invoices) {
    const transaction = new sql.Transaction(pool);
    try {
      const custRes = await pool.request()
        .input('name',  sql.NVarChar, String(inv.customer_name || '').trim())
        .input('orgId', sql.Int,      orgId)
        .query('SELECT TOP 1 id FROM customers WHERE LOWER(name) = LOWER(@name) AND organization_id = @orgId');
      if (!custRes.recordset.length) {
        errors.push({ ref: inv.invoice_ref, message: `Customer "${inv.customer_name}" not found` });
        continue;
      }
      const customer_id = custRes.recordset[0].id;
      const items       = Array.isArray(inv.items) ? inv.items : [];
      if (!items.length) { errors.push({ ref: inv.invoice_ref, message: 'No line items' }); continue; }

      const resolvedItems = [];
      for (const item of items) {
        const itemName  = String(item.item_name || '').trim();
        let tire_id = null, product_id = null;
        const prodRes = await pool.request()
          .input('n',     sql.NVarChar, itemName)
          .input('orgId', sql.Int,      orgId)
          .query('SELECT TOP 1 id FROM products WHERE LOWER(name) = LOWER(@n) AND is_active = 1 AND organization_id = @orgId');
        if (prodRes.recordset.length) {
          product_id = prodRes.recordset[0].id;
        } else {
          const tireRes = await pool.request()
            .input('n',        sql.NVarChar, itemName)
            .input('orgId',    sql.Int,      orgId)
            .input('branchId', sql.Int,      branchId)
            .query("SELECT TOP 1 id FROM tires WHERE LOWER(CONCAT(brand,' ',model,' ',size)) = LOWER(@n) AND organization_id = @orgId AND branch_id = @branchId");
          if (tireRes.recordset.length) tire_id = tireRes.recordset[0].id;
        }
        resolvedItems.push({ item_name: itemName, qty: Number(item.qty) || 1, unit_price: parseFloat(item.unit_price) || 0, tire_id, product_id });
      }

      const taxRate  = parseFloat(inv.tax_rate || 0);
      const subtotal = resolvedItems.reduce((s, it) => s + it.qty * it.unit_price, 0);
      const tax      = parseFloat((subtotal * taxRate / 100).toFixed(2));
      const total    = parseFloat((subtotal + tax).toFixed(2));

      await transaction.begin();
      const countRes   = await new sql.Request(transaction)
        .input('orgId', sql.Int, orgId)
        .query('SELECT COUNT(*) AS cnt FROM sales WHERE organization_id = @orgId');
      const invoice_no = `${prefix}-${new Date().getFullYear()}-${String(countRes.recordset[0].cnt + 1).padStart(3, '0')}`;

      const saleRes = await new sql.Request(transaction)
        .input('org_id',     sql.Int,          orgId)
        .input('branch_id',  sql.Int,          branchId)
        .input('invoice_no', sql.NVarChar,     invoice_no)
        .input('customer_id',sql.Int,          customer_id)
        .input('date',       sql.Date,         inv.date || new Date())
        .input('subtotal',   sql.Decimal(18,2), subtotal)
        .input('tax',        sql.Decimal(18,2), tax)
        .input('total',      sql.Decimal(18,2), total)
        .input('status',     sql.NVarChar,     inv.status || 'pending')
        .input('notes',      sql.NVarChar,     inv.notes  || '')
        .input('tax_rate',   sql.Decimal(5,2), taxRate)
        .query(`INSERT INTO sales (organization_id,branch_id,invoice_no,customer_id,date,subtotal,tax,total,status,notes,tax_rate)
                OUTPUT INSERTED.id VALUES (@org_id,@branch_id,@invoice_no,@customer_id,@date,@subtotal,@tax,@total,@status,@notes,@tax_rate)`);
      const saleId = saleRes.recordset[0].id;

      for (const item of resolvedItems) {
        const amount = parseFloat((item.qty * item.unit_price).toFixed(2));
        await new sql.Request(transaction)
          .input('sale_id',    sql.Int,          saleId)
          .input('tire_id',    sql.Int,          item.tire_id)
          .input('product_id', sql.Int,          item.product_id)
          .input('tire_name',  sql.NVarChar,     item.item_name)
          .input('qty',        sql.Int,          item.qty)
          .input('unit_price', sql.Decimal(18,2), item.unit_price)
          .input('amount',     sql.Decimal(18,2), amount)
          .query(`INSERT INTO sale_items (sale_id,tire_id,product_id,tire_name,qty,unit_price,amount) VALUES (@sale_id,@tire_id,@product_id,@tire_name,@qty,@unit_price,@amount)`);
        if (item.tire_id) {
          await new sql.Request(transaction)
            .input('tire_id', sql.Int, item.tire_id)
            .input('qty',     sql.Int, item.qty)
            .query('UPDATE tires SET stock = stock - @qty WHERE id = @tire_id');
        }
      }
      await transaction.commit();
      inserted++;
    } catch (err) {
      try { await transaction.rollback(); } catch {}
      errors.push({ ref: inv.invoice_ref, message: err.message });
    }
  }
  res.json({ inserted, errors });
});

module.exports = router;
