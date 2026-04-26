const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Railway persistent volume: set DB_DIR=/data in Railway env vars
const DB_DIR = process.env.DB_DIR || path.join(__dirname, '../../../data');
const DB_PATH = path.join(DB_DIR, 'ilmigrosir.db');

// Ensure directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Performance optimizations
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 10000');
db.pragma('foreign_keys = ON');

// ─── SCHEMA ───────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    kode_item    TEXT,
    nama_item    TEXT NOT NULL,
    jenis        TEXT,
    stok         REAL    DEFAULT 0,
    satuan       TEXT,
    isi          INTEGER DEFAULT 1,
    dasar        TEXT,
    pokok        REAL    DEFAULT 0,
    harga_retail REAL    DEFAULT 0,
    harga_grosir REAL    DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_products_jenis    ON products(jenis);
  CREATE INDEX IF NOT EXISTS idx_products_nama     ON products(nama_item);
  CREATE INDEX IF NOT EXISTS idx_products_retail   ON products(harga_retail);

  CREATE TABLE IF NOT EXISTS upload_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    filename    TEXT    NOT NULL,
    total_rows  INTEGER NOT NULL,
    uploaded_at TEXT    DEFAULT (datetime('now', 'localtime'))
  );
`);

console.log(`✅ SQLite database ready: ${DB_PATH}`);

module.exports = db;