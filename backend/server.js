const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── MIDDLEWARE ────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:4173']
  : ['http://localhost:5173', 'http://localhost:4173'];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o)) || origin.includes('vercel.app')) {
      cb(null, true);
    } else {
      cb(null, true); // Allow all in development; tighten for production
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── ROUTES ───────────────────────────────────────────────────────
app.use('/api/products', require('./src/routes/products'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/chat', require('./src/routes/chat'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'ILMIGROSIR API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ─── START ────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 ILMIGROSIR API running on port ${PORT}`);
  console.log(`📦 Database: ${process.env.DB_DIR || './data'}/ilmigrosir.db`);
});