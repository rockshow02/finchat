// ============================================================
//  FinChat — Hybrid Parser (v2 — bug fixed)
//
//  Bug fixes:
//  1. False positive — "tadi hujan deras", "meeting jam 3"
//     → tambah confidence check sebelum trigger
//  2. Format ribuan dengan titik — "45.000" tidak terbaca
//     → normalise titik ribuan sebelum parse
//  3. Validasi amount — 0, negatif, terlalu besar ditolak
//  4. Label kotor — angka sisa tidak dihapus sempurna
// ============================================================

const Parser = (() => {
  // ── Konstanta ──────────────────────────────────────────────
  const MIN_AMOUNT = 100; // Rp 100 minimum
  const MAX_AMOUNT = 100_000_000_000; // Rp 100 miliar maximum

  // Kata-kata yang WAJIB ada untuk trigger transaksi
  // Kalau input tidak mengandung satupun → langsung ke AI
  const FINANCIAL_SIGNALS = [
    // kata kerja transaksi
    "beli",
    "bayar",
    "jajan",
    "makan",
    "minum",
    "nonton",
    "isi",
    "cas",
    "charge",
    "belanja",
    "sewa",
    "cicilan",
    "langganan",
    "transfer",
    "kirim",
    "habis",
    "keluar",
    "pakai",
    "isi ulang",
    "nyicil",
    "pinjam",
    "pinjem",
    // utang
    "utang",
    "hutang",
    "bayar utang",
    "angsuran",
    "dp",
    // pemasukan
    "gaji",
    "salary",
    "bonus",
    "freelance",
    "proyek",
    "project",
    "fee",
    "komisi",
    "dividen",
    "bunga",
    "pensiun",
    "dapat",
    "dapet",
    "terima",
    "masuk",
    "income",
    // kata benda keuangan — produk & layanan digital
    "netflix",
    "spotify",
    "youtube",
    "steam",
    "disney",
    "prime",
    "canva",
    "figma",
    "chatgpt",
    "claude",
    "openai",
    "adobe",
    "notion",
    "zoom",
    // kata benda keuangan — fisik & harian
    "bensin",
    "bbm",
    "parkir",
    "listrik",
    "air",
    "internet",
    "pulsa",
    "kuota",
    "token",
    "kopi",
    "coffee",
    "nasi",
    "bakso",
    "mie",
    "pizza",
    "burger",
    "soto",
    "snack",
    "boba",
    "grab",
    "gojek",
    "ojek",
    "obat",
    "dokter",
    "apotek",
    "tiket",
    "hotel",
    "hp",
    "handphone",
    "laptop",
    "gadget",
    "elektronik",
    // tempat & merchant
    "indomaret",
    "alfamart",
    "supermarket",
    "mall",
    "shopee",
    "tokopedia",
    "lazada",
    "traveloka",
    "tiket.com",
  ];

  // Kata-kata yang langsung ke AI meski ada angka
  const NON_FINANCIAL = [
    "jam",
    "pukul",
    "menit",
    "detik",
    "hari",
    "bulan",
    "tahun",
    "orang",
    "meter",
    "km",
    "kilo",
    "liter",
    "kg",
    "gram",
    "derajat",
    "persen",
    "nomor",
    "no",
    "#",
    "telepon",
    "whatsapp",
    "meeting",
    "rapat",
    "cuaca",
    "hujan",
    "panas",
    "dingin",
    "macet",
    "jarak",
    "lantai",
    "kamar",
    "ruang",
    "halaman",
  ];

  // ── Format angka ribuan dengan titik ──────────────────────
  // "45.000" → "45000", "1.500.000" → "1500000"
  // "8.500.000" → "8500000" (multi titik)
  // "1.5jt" tetap "1.5jt" (desimal + satuan, tidak diubah)
  function _normalizeNumber(str) {
    // Loop sampai tidak ada lagi pola ribuan yang bisa diubah
    // Ini handle kasus multi-titik seperti 8.500.000
    let prev = "";
    let s = str;
    while (prev !== s) {
      prev = s;
      s = s.replace(/(\d)\.(\d{3})(?!\d)/g, "$1$2");
    }
    return s;
  }

  // ── Parse angka dari string natural ───────────────────────
  function parseAmount(str) {
    if (!str) return null;
    let s = str.toLowerCase().trim();
    s = s.replace(/,/g, "."); // koma jadi titik desimal
    s = _normalizeNumber(s); // "45.000" → "45000"
    s = s.replace(/\s+/g, "");

    const rules = [
      { re: /^(\d+\.?\d*)(miliar|b)$/, mul: 1_000_000_000 },
      { re: /^(\d+\.?\d*)(juta|jt)$/, mul: 1_000_000 },
      { re: /^(\d+\.?\d*)(ribu|rb|k)$/, mul: 1_000 },
      { re: /^(\d+)$/, mul: 1 },
    ];

    for (const { re, mul } of rules) {
      const m = s.match(re);
      if (m) {
        const val = parseFloat(m[1]) * mul;
        if (!isNaN(val)) return val;
      }
    }
    return null;
  }

  // ── Ekstrak angka dari kalimat ─────────────────────────────
  function _extractAmount(text) {
    // Deteksi angka negatif — langsung return null (ke AI)
    if (/[-−]\s*\d/.test(text)) return null;

    const s = _normalizeNumber(text.toLowerCase().replace(/,/g, "."));

    const patterns = [
      /(\d+\.?\d*)\s*(miliar|b)(?:\s|$)/i,
      /(\d+\.?\d*)\s*(juta|jt)(?:\s|$)/i,
      /(\d+\.?\d*)\s*(ribu|rb|k)(?:\s|$)/i,
      /(\d{4,})/, // angka 4+ digit: 45000, 250000, 999999999999
      /\b(\d{1,3})\b/, // angka 1-3 digit: 0, 50, 100
    ];

    for (const p of patterns) {
      const m = s.match(p);
      if (!m) continue;
      const raw = m[0].trim();
      const val = parseAmount(raw);

      // Return 0 secara eksplisit (falsy tapi valid untuk divalidasi)
      if (val === 0) return 0;
      // Return nilai apapun yang ter-parse — biar _validateAmount yang putuskan
      if (val !== null && !isNaN(val) && val > 0) return val;
    }
    return null;
  }

  // ── Validasi amount ────────────────────────────────────────
  function _validateAmount(amount) {
    if (amount === null || amount === undefined || isNaN(amount))
      return { valid: false, reason: "Jumlah tidak valid" };
    if (amount === 0 || amount < MIN_AMOUNT)
      return {
        valid: false,
        reason: `Jumlah minimal Rp ${MIN_AMOUNT.toLocaleString("id-ID")}`,
      };
    if (amount > MAX_AMOUNT)
      return { valid: false, reason: "Jumlah terlalu besar, cek kembali ya" };
    return { valid: true };
  }

  // ── Confidence check ───────────────────────────────────────
  // Return 'high' | 'low' | 'none'
  function _hasWord(text, word) {
    // Word boundary check — "no" tidak cocok dengan "nonton"
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![a-z])${escaped}(?![a-z])`, "i").test(text);
  }

  function _confidence(text) {
    const lower = text.toLowerCase();

    // Blacklist — pakai word boundary
    if (NON_FINANCIAL.some((w) => _hasWord(lower, w))) return "none";

    // Harus ada angka — null berarti tidak ada angka sama sekali
    const amt = _extractAmount(lower);
    if (amt === null) return "none";

    // Whitelist signals
    const hasSignal = FINANCIAL_SIGNALS.some((w) => _hasWord(lower, w));
    return hasSignal ? "high" : "low";
  }

  // ── Kategori ───────────────────────────────────────────────
  const CATEGORY_MAP = {
    "Makan & Minum": [
      "makan",
      "minum",
      "kopi",
      "coffee",
      "resto",
      "restoran",
      "warung",
      "cafe",
      "nasi",
      "bakso",
      "mie",
      "pizza",
      "burger",
      "soto",
      "ayam",
      "seafood",
      "jajan",
      "snack",
      "cemilan",
      "boba",
      "minuman",
      "lunch",
      "dinner",
      "breakfast",
      "sarapan",
      "siang",
      "malam",
      "es",
      "teh",
      "susu",
    ],
    Transport: [
      "bensin",
      "bbm",
      "parkir",
      "grab",
      "gojek",
      "ojek",
      "taxi",
      "taksi",
      "bus",
      "kereta",
      "toll",
      "tol",
      "transport",
      "motor",
      "mobil",
      "uber",
      "maxim",
      "indriver",
      "busway",
      "commuter",
      "mrt",
      "lrt",
      "tiket",
    ],
    Belanja: [
      "belanja",
      "beli",
      "shopee",
      "tokopedia",
      "lazada",
      "toko",
      "supermarket",
      "indomaret",
      "alfamart",
      "giant",
      "carrefour",
      "hypermart",
      "mall",
      "online",
      "marketplace",
      "pakaian",
      "baju",
      "sepatu",
      "tas",
    ],
    Tagihan: [
      "listrik",
      "air",
      "pdam",
      "internet",
      "wifi",
      "indihome",
      "firstmedia",
      "telkom",
      "pulsa",
      "kuota",
      "token",
      "iuran",
      "tagihan",
      "cicilan",
      "kredit",
      "kpr",
      "rent",
      "sewa",
      "kos",
      "kontrak",
      "pln",
    ],
    Kesehatan: [
      "dokter",
      "rumah sakit",
      "rs",
      "klinik",
      "apotek",
      "obat",
      "vitamin",
      "gym",
      "fitness",
      "olahraga",
      "kesehatan",
      "medical",
      "lab",
    ],
    Hiburan: [
      "netflix",
      "spotify",
      "youtube",
      "games",
      "game",
      "bioskop",
      "cinema",
      "konser",
      "nonton",
      "hiburan",
      "liburan",
      "wisata",
      "hotel",
      "travel",
    ],
    Pendidikan: [
      "buku",
      "kursus",
      "les",
      "sekolah",
      "kuliah",
      "kampus",
      "seminar",
      "workshop",
      "training",
      "pendidikan",
      "spp",
    ],
    "Utang & Pinjaman": [
      "utang",
      "hutang",
      "pinjam",
      "pinjem",
      "nyicil",
      "bayar utang",
      "bayar pinjaman",
      "angsuran",
      "dp",
      "uang muka",
    ],
    Transfer: ["transfer", "kirim", "kirim uang", "kirimin", "titip"],
    Gaji: ["gaji", "salary", "upah", "honor", "honorarium"],
    Freelance: [
      "freelance",
      "project",
      "proyek",
      "fee",
      "jasa",
      "klien",
      "client",
    ],
    Investasi: [
      "investasi",
      "saham",
      "reksadana",
      "deposito",
      "crypto",
      "bitcoin",
      "nabung",
      "tabungan",
    ],
  };

  function detectCategory(text) {
    const t = text.toLowerCase();
    for (const [cat, kws] of Object.entries(CATEGORY_MAP)) {
      if (kws.some((k) => t.includes(k))) return cat;
    }
    return "Lainnya";
  }

  function _incomeCategory(text) {
    if (/gaji|salary|upah/.test(text)) return "Gaji";
    if (/bonus/.test(text)) return "Bonus";
    if (/freelance|project|proyek|fee/.test(text)) return "Freelance";
    if (/investasi|dividen|bunga/.test(text)) return "Investasi";
    return "Pemasukan Lain";
  }

  // ── Tanggal ────────────────────────────────────────────────
  function detectDate(text) {
    const t = text.toLowerCase();
    const today = new Date();
    const fmt = (d) =>
      d.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });

    if (t.includes("kemarin") || t.includes("yesterday")) {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      return fmt(d);
    }
    // "3 hari lalu", "2 hari yang lalu"
    const hariLalu = t.match(/(\d+)\s*hari\s*(lalu|yang lalu)/);
    if (hariLalu) {
      const d = new Date(today);
      d.setDate(d.getDate() - parseInt(hariLalu[1]));
      return fmt(d);
    }
    // Date picker injection
    const injected = text.match(/tanggal:\s*(\d{4}-\d{2}-\d{2})/);
    if (injected) return fmt(new Date(injected[1]));

    return fmt(today);
  }

  // ── Bersihkan label ────────────────────────────────────────
  function _cleanLabel(text) {
    let s = text
      // hapus date injection
      .replace(/\(tanggal:.*?\)/gi, "")
      // hapus angka + satuan
      .replace(
        /\d+[\d.,]*\s*(rb|ribu|juta|jt|k|miliar|m|b|000)?(?:\s|$)/gi,
        " ",
      )
      // hapus kata keterangan waktu
      .replace(
        /\b(tadi|kemarin|hari ini|today|yesterday|barusan|baru saja)\b/gi,
        " ",
      )
      // hapus kata tipe transaksi
      .replace(/\b(pengeluaran|pemasukan|expense|income)\b/gi, " ")
      // rapikan spasi
      .replace(/\s+/g, " ")
      .trim();

    // Pertahankan "ke X" untuk transfer — "transfer ke mama" → "Transfer ke Mama"
    // Kapitalisasi setiap kata
    s = s.replace(/\b\w/g, (c) => c.toUpperCase());

    return s || "Transaksi";
  }

  // ── PARSE MAIN ────────────────────────────────────────────
  function parse(input) {
    const text = input.trim();
    const lower = text.toLowerCase().replace(/\s+/g, " ");

    // ── Intent non-transaksi dulu ─────────────────────────
    if (
      /^(berapa |cek |lihat |tampilkan )?(saldo|sisa uang|uang saya|uang aku)(ku| saya| aku| gue)?[?!.]?$/.test(
        lower,
      ) ||
      lower === "saldo" ||
      lower === "cek saldo"
    ) {
      return { intent: "saldo" };
    }

    if (
      /^(lihat |tampilkan |buat )?(laporan|ringkasan|summary|rekap)/.test(lower)
    ) {
      return { intent: "laporan" };
    }

    if (/grafik|chart|diagram|visualisasi|pie chart|donat/.test(lower)) {
      return { intent: "grafik" };
    }

    if (
      /^(hapus|batalkan|undo|cancel)\s*(transaksi)?\s*(terakhir|tadi|barusan)?[?!.]?$/.test(
        lower,
      )
    ) {
      return { intent: "hapus_terakhir" };
    }

    // ── Confidence check ──────────────────────────────────
    const conf = _confidence(lower);
    if (conf === "none") return null; // → AI

    // ── Ekstrak amount ────────────────────────────────────
    const amount = _extractAmount(lower);

    // amount null = tidak ada angka sama sekali → AI
    if (amount === null) return null;

    // Validasi amount (termasuk 0 dan terlalu besar)
    const validation = _validateAmount(amount);
    if (!validation.valid) {
      return {
        intent: "error",
        message: `⚠️ ${validation.reason}. Coba ketik ulang ya!`,
      };
    }

    const date = detectDate(text);
    const label = _cleanLabel(text);

    // ── Deteksi pemasukan ─────────────────────────────────
    const isIncomeSignal =
      /\b(gaji|salary|bonus|freelance|proyek|project|fee|komisi|dividen|bunga|pensiun)\b/.test(
        lower,
      );
    const isMasuk = /\b(masuk|diterima|terima|dapat|dapet)\b/.test(lower);

    if (isIncomeSignal || (isMasuk && conf === "high")) {
      return {
        intent: "income",
        data: {
          label: label || "Pemasukan",
          amount,
          category: _incomeCategory(lower),
          date,
        },
      };
    }

    // ── Deteksi pengeluaran ───────────────────────────────
    // high confidence → catat, low confidence → AI
    if (conf === "high") {
      return {
        intent: "expense",
        data: {
          label: label || "Pengeluaran",
          amount,
          category: detectCategory(lower),
          date,
        },
      };
    }

    // low confidence — ada angka tapi sinyal lemah → AI
    return null;
  }

  return { parse, parseAmount, detectCategory, detectDate };
})();
