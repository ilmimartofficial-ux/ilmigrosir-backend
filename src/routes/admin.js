const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const crypto  = require('crypto');
const db      = require('../db/database');

// ─── CONFIG ───────────────────────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'nopal123';
const SECRET         = process.env.JWT_SECRET     || 'ilmigrosir_s3cr3t_k3y_2024';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    ok ? cb(null, true) : cb(new Error('Hanya file .xlsx, .xls, atau .csv yang diperbolehkan'));
  }
});

// ─── AUTH HELPERS ─────────────────────────────────────────────────
function makeToken() {
  return crypto.createHmac('sha256', SECRET).update(ADMIN_PASSWORD).digest('hex');
}

function verifyToken(req, res, next) {
  const auth  = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token || token !== makeToken()) {
    return res.status(401).json({ success: false, message: 'Akses ditolak. Token tidak valid.' });
  }
  next();
}

// ─── POST /api/admin/login ─────────────────────────────────────────
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ success: false, message: 'Password harus diisi' });

  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, token: makeToken(), message: 'Login berhasil' });
  } else {
    res.status(401).json({ success: false, message: 'Password salah. Coba lagi.' });
  }
});

// ─── POST /api/admin/upload ────────────────────────────────────────
router.post('/upload', verifyToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'File tidak ditemukan' });

    // Parse Excel or CSV
    let rows = [];
    const ext = req.file.originalname.split('.').pop().toLowerCase();

    if (ext === 'csv') {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheet    = workbook.Sheets[workbook.SheetNames[0]];
      rows           = XLSX.utils.sheet_to_json(sheet);
    } else {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheet    = workbook.Sheets[workbook.SheetNames[0]];
      rows           = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    }

    if (!rows.length) {
      return res.status(400).json({ success: false, message: 'File tidak memiliki data' });
    }

    // Column name resolver (handles trailing spaces, case insensitive)
    function getCol(row, ...names) {
      const keys = Object.keys(row);
      for (const name of names) {
        const found = keys.find(k => k.trim().toLowerCase() === name.trim().toLowerCase());
        if (found !== undefined) return row[found];
      }
      return null;
    }

    // Validate columns
    const sample = rows[0];
    const namaItem = getCol(sample, 'Nama Item', 'nama_item', 'NAMA ITEM');
    if (namaItem === null) {
      return res.status(400).json({
        success: false,
        message: 'Kolom "Nama Item" tidak ditemukan. Pastikan file benar.',
        columns_found: Object.keys(sample)
      });
    }

    // Clear existing and insert new
    const insertStmt = db.prepare(`
      INSERT INTO products
        (kode_item, nama_item, jenis, stok, satuan, isi, dasar, pokok, harga_retail, harga_grosir)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const processAll = db.transaction((data) => {
      db.prepare('DELETE FROM products').run();
      let inserted = 0;
      for (const row of data) {
        const nama = String(getCol(row, 'Nama Item') || '').trim();
        if (!nama) continue; // Skip empty rows

        insertStmt.run(
          String(getCol(row, 'Kode Item', 'kode_item') || '').trim(),
          nama,
          String(getCol(row, 'Jenis', 'jenis') || '').trim().toUpperCase(),
          parseFloat(getCol(row, 'Stok', 'stok') || 0) || 0,
          String(getCol(row, 'Satuan', 'satuan') || 'PCS').trim(),
          parseInt(getCol(row, 'ISI', 'isi') || 1) || 1,
          String(getCol(row, 'DASAR', 'dasar') || '').trim(),
          parseFloat(getCol(row, 'Pokok', 'pokok') || 0) || 0,
          parseFloat(getCol(row, 'Harga Retail', 'Harga Retail ', 'harga_retail') || 0) || 0,
          parseFloat(getCol(row, 'Harga Grosir', 'harga_grosir') || 0) || 0
        );
        inserted++;
      }
      return inserted;
    });

    const inserted = processAll(rows);

    // Log history
    db.prepare('INSERT INTO upload_history (filename, total_rows) VALUES (?, ?)').run(
      req.file.originalname,
      inserted
    );

    res.json({
      success: true,
      message: `✅ Berhasil! ${inserted.toLocaleString('id-ID')} produk telah disinkronkan.`,
      total: inserted
    });

  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ success: false, message: `Gagal proses file: ${err.message}` });
  }
});

// ─── GET /api/admin/history ────────────────────────────────────────
router.get('/history', verifyToken, (req, res) => {
  try {
    const history = db.prepare('SELECT * FROM upload_history ORDER BY id DESC LIMIT 10').all();
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;