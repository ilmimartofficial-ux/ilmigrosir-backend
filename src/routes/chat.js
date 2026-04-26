const express = require('express');
const router  = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const db      = require('./database');

// Inisialisasi Gemini (Pastikan GEMINI_API_KEY sudah ada di Variables Railway)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ─── POST /api/chat ────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Pesan tidak boleh kosong' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        success: false,
        message: 'Layanan AI belum dikonfigurasi. Silakan isi GEMINI_API_KEY di Railway.'
      });
    }

    // ── 1. Pencarian Produk Pintar ──────────────────
    const words = message
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !['yang', 'ada', 'dan', 'ini', 'itu', 'untuk', 'dengan', 'atau', 'berapa', 'harga', 'produk'].includes(w));

    const seen     = new Set();
    let products   = [];

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

    products = products.slice(0, 15);

    // ── 2. Ambil Statistik Toko ────────────────────────────────────────
    const stats = db.prepare(`
      SELECT COUNT(*) as total, COUNT(DISTINCT jenis) as categories FROM products
    `).get();

    // ── 3. Format Konteks Produk ─────────────────────────────────
    const formatRupiah = (n) => `Rp ${Number(n).toLocaleString('id-ID')}`;

    const productContext = products.length > 0
      ? products.map(p => {
          const grosir = p.harga_grosir > 0
            ? ` | Grosir: ${formatRupiah(p.harga_grosir)}`
            : '';
          const unit = p.isi > 1 ? `${p.isi} ${p.dasar || 'PCS'}/${p.satuan}` : p.satuan;
          return `• ${p.nama_item} [${p.jenis}] — Retail: ${formatRupiah(p.harga_retail)}${grosir} | Satuan: ${unit}`;
        }).join('\n')
      : 'Tidak ada produk spesifik yang cocok di database saat ini.';

    // ── 4. Setup Gemini Model ──────────────────────────────────────────
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      systemInstruction: `Kamu adalah asisten AI toko grosir **ILMIGROSIR** yang ramah, cepat, dan profesional.
Toko: ILMIGROSIR — "JUAL KEMBALI UNTUNG BERKALI" 📦
Database: ${stats.total.toLocaleString('id-ID')} produk | ${stats.categories} kategori

CARA MENJAWAB:
- Gunakan Bahasa Indonesia yang ramah, singkat, dan mudah dipahami.
- Format harga selalu: Rp X.XXX.
- Jika produk ada → tampilkan nama, harga retail, dan harga grosir (jika ada).
- Jika ada harga grosir → jelaskan keuntungan beli grosir.
- Untuk pemesanan/pertanyaan stok detail → arahkan ke WhatsApp: 085373373233.
- Jangan sebutkan harga pokok/modal.
- Beri rekomendasi produk serupa jika ada.
- Gunakan emoji agar ramah 😊.

DATA PRODUK RELEVAN:
${productContext}`
    });

    // ── 5. Jalankan Chat ─────────────────────────────────────
    // Transform history untuk format Gemini
    const chat = model.startChat({
      history: history.slice(-8).map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }],
      })),
    });

    const result = await chat.sendMessage(message.trim());
    const response = await result.response;

    res.json({
      success: true,
      reply: response.text(),
      products_found: products.length
    });

  } catch (err) {
    console.error('Gemini Chat error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Asisten AI sedang gangguan. Silakan hubungi WhatsApp kami di 085373373233 🙏'
    });
  }
});

module.exports = router;
