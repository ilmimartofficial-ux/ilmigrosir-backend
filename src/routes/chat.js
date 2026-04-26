const express  = require('express');
const router   = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const db       = require('../db/database');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// ─── POST /api/chat ────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Pesan tidak boleh kosong' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({
        success: false,
        message: 'Layanan AI belum dikonfigurasi. Silakan hubungi admin.'
      });
    }

    // ── 1. Smart product search based on message ──────────────────
    const words = message
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !['yang', 'ada', 'dan', 'ini', 'itu', 'untuk', 'dengan', 'atau', 'berapa', 'harga', 'produk'].includes(w));

    const seen     = new Set();
    let products   = [];

    // Search by keyword
    for (const word of words.slice(0, 4)) {
      const found = db.prepare(`
        SELECT nama_item, jenis, harga_retail, harga_grosir, satuan, isi, stok, kode_item
        FROM products
        WHERE nama_item LIKE ? OR jenis LIKE ? OR kode_item LIKE ?
        LIMIT 8
      `).all(`%${word}%`, `%${word}%`, `%${word}%`);

      for (const p of found) {
        if (!seen.has(p.nama_item)) {
          seen.add(p.nama_item);
          products.push(p);
        }
      }
    }

    // Limit to 15 most relevant
    products = products.slice(0, 15);

    // ── 2. Get store stats ────────────────────────────────────────
    const stats = db.prepare(`
      SELECT COUNT(*) as total, COUNT(DISTINCT jenis) as categories FROM products
    `).get();

    // ── 3. Format product context ─────────────────────────────────
    const formatRupiah = (n) => `Rp ${Number(n).toLocaleString('id-ID')}`;

    const productContext = products.length > 0
      ? products.map(p => {
          const grosir = p.harga_grosir > 0
            ? ` | Grosir: ${formatRupiah(p.harga_grosir)}`
            : '';
          const unit = p.isi > 1 ? `${p.isi} ${p.dasar || 'PCS'}/${p.satuan}` : p.satuan;
          return `• ${p.nama_item} [${p.jenis}] — Retail: ${formatRupiah(p.harga_retail)}${grosir} | Satuan: ${unit}`;
        }).join('\n')
      : 'Tidak ada produk spesifik yang cocok. Sarankan customer untuk hubungi WA.';

    // ── 4. System prompt ──────────────────────────────────────────
    const systemPrompt = `Kamu adalah asisten AI toko grosir **ILMIGROSIR** yang ramah, cepat, dan profesional.
Toko: ILMIGROSIR — "JUAL KEMBALI UNTUNG BERKALI" 📦
Database: ${stats.total.toLocaleString('id-ID')} produk | ${stats.categories} kategori

CARA MENJAWAB:
- Gunakan Bahasa Indonesia yang ramah, singkat, dan mudah dipahami
- Format harga: Rp X.XXX (misal: Rp 4.000, Rp 15.500)
- Jika produk ada → tampilkan nama, harga retail, dan harga grosir (jika ada)
- Jika ada harga grosir → jelaskan keuntungan beli grosir
- Untuk pemesanan/pertanyaan stok detail → arahkan ke WhatsApp: 085373373233
- Jangan sebutkan harga pokok/modal
- Beri rekomendasi produk serupa jika ada
- Gunakan emoji secukupnya agar ramah 😊

PRODUK RELEVAN DARI DATABASE:
${productContext}`;

    // ── 5. Call Claude claude-haiku-4-5-20251001 ─────────────────────────────────────
    const messages = [
      ...history.slice(-8).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message.trim() }
    ];

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: systemPrompt,
      messages
    });

    res.json({
      success: true,
      reply: response.content[0].text,
      products_found: products.length
    });

  } catch (err) {
    console.error('Chat error:', err.message);

    if (err.status === 401) {
      return res.status(503).json({
        success: false,
        message: 'API Key tidak valid. Silakan hubungi admin untuk memperbaiki konfigurasi.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Asisten AI sedang gangguan. Silakan hubungi WhatsApp kami di 085373373233 🙏'
    });
  }
});

module.exports = router;