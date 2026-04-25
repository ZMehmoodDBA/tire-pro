const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const { setupDatabase } = require('./db');

const app  = express();
const PORT = 3001;

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-site' },
  contentSecurityPolicy: false, // API-only server; browser CSP is on the frontend
}));

// ── CORS — only allow the Vite dev server ─────────────────────────────────────
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-Org-ID', 'X-Branch-ID'],
}));

// ── Body parsing — cap at 500 KB to block oversized payloads ─────────────────
app.use(express.json({ limit: '500kb' }));

// ── General API rate limit (loose — protects against scraping/flooding) ──────
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});
app.use('/api', generalLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/sales',     require('./routes/sales'));
app.use('/api/purchases', require('./routes/purchases'));
app.use('/api/settings',  require('./routes/settings'));
app.use('/api/lookups',   require('./routes/lookups'));
app.use('/api/products',  require('./routes/products'));
app.use('/api/payments',      require('./routes/payments'));
app.use('/api/ledger',        require('./routes/ledger'));
app.use('/api/organizations', require('./routes/organizations'));
app.use('/api/branches',      require('./routes/branches'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  // Avoid leaking stack traces in error responses
  console.error('[API Error]', err.message);
  res.status(500).json({ error: 'An internal error occurred' });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await setupDatabase();
    app.listen(PORT, () => {
      console.log(`🚀 TirePro API running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
})();
