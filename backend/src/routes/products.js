const express = require('express');
const router = express.Router();
const db = require('../db/database');

// ─── GET /api/products ─────────────────────────────────────────────
// Query params: search, category, page, limit
router.get('/', (req, res) => {
  try {
    const {
      search   = '',
      category = 'all',
      page     = 1,
      limit    = 60
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const offset   = (pageNum - 1) * limitNum;

    const conditions = [];
    const params     = [];

    if (search.trim()) {
      conditions.push('(nama_item LIKE ? OR kode_item LIKE ? OR jenis LIKE ?)');
      params.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
    }

    if (category && category !== 'all') {
      conditions.push('UPPER(jenis) = UPPER(?)');
      params.push(category);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countStmt   = db.prepare(`SELECT COUNT(*) as total FROM products ${where}`);
    const selectStmt  = db.prepare(`
      SELECT id, kode_item, nama_item, jenis, stok, satuan, isi, dasar, harga_retail, harga_grosir
      FROM products ${where}
      ORDER BY nama_item ASC
      LIMIT ? OFFSET ?
    `);

    const { total }  = countStmt.get(...params);
    const products   = selectStmt.all(...params, limitNum, offset);

    res.json({
      success: true,
      data: products,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
        has_next: pageNum < Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('GET /products error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/products/categories ─────────────────────────────────
router.get('/categories', (req, res) => {
  try {
    const categories = db.prepare(`
      SELECT UPPER(jenis) AS jenis, COUNT(*) AS count
      FROM products
      WHERE jenis IS NOT NULL AND TRIM(jenis) != ''
      GROUP BY UPPER(jenis)
      ORDER BY count DESC
    `).all();

    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/products/stats ───────────────────────────────────────
router.get('/stats', (req, res) => {
  try {
    const total       = db.prepare('SELECT COUNT(*) as count FROM products').get();
    const categories  = db.prepare('SELECT COUNT(DISTINCT UPPER(jenis)) as count FROM products WHERE jenis IS NOT NULL').get();
    const withGrosir  = db.prepare('SELECT COUNT(*) as count FROM products WHERE harga_grosir > 0').get();
    const lastUpload  = db.prepare('SELECT * FROM upload_history ORDER BY id DESC LIMIT 1').get();

    res.json({
      success: true,
      data: {
        total_products:   total.count,
        total_categories: categories.count,
        total_grosir:     withGrosir.count,
        last_upload:      lastUpload || null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;