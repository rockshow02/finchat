// ============================================================
//  FinChat — Financial Story (Premium)
//  Narasi keuangan mingguan/bulanan via AI
//  Token hemat: data dihitung lokal, hanya summary ke AI
// ============================================================

const FinancialStory = (() => {
  const LS_CACHE = "finchat_story_cache";

  // ── Parse tanggal id-ID ───────────────────────────────────
  function _parseDate(str) {
    if (!str || str === "hari ini") return new Date();
    const BULAN = {
      januari: 0,
      februari: 1,
      maret: 2,
      april: 3,
      mei: 4,
      juni: 5,
      juli: 6,
      agustus: 7,
      september: 8,
      oktober: 9,
      november: 10,
      desember: 11,
    };
    let d = new Date(str);
    if (!isNaN(d)) return d;
    const m = str.toLowerCase().match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (m && BULAN[m[2]] !== undefined)
      return new Date(parseInt(m[3]), BULAN[m[2]], parseInt(m[1]));
    return new Date();
  }

  // ── Siapkan summary data lokal ────────────────────────────
  // Ini yang dikirim ke AI — bukan raw transaksi
  function _buildSummary(period) {
    const { transactions, income, expense } = App.getFinancial();
    const now = new Date();
    let from, to, label, prevFrom, prevTo;

    if (period === "week") {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      from = new Date(now);
      from.setDate(now.getDate() - diff);
      from.setHours(0, 0, 0, 0);
      to = new Date(now);
      const prevEnd = new Date(from);
      prevEnd.setDate(prevEnd.getDate() - 1);
      prevFrom = new Date(prevEnd);
      prevFrom.setDate(prevEnd.getDate() - 6);
      prevFrom.setHours(0, 0, 0, 0);
      prevTo = prevEnd;
      label = "minggu ini";
    } else {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now);
      prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevTo = new Date(now.getFullYear(), now.getMonth(), 0);
      label = "bulan ini";
    }

    const filter = (txs, f, t) =>
      txs.filter((tx) => {
        const d = _parseDate(tx.date);
        return d >= f && d <= t;
      });

    const curr = filter(transactions, from, to);
    const prev = filter(transactions, prevFrom, prevTo);

    const sum = (txs, type) =>
      txs
        .filter((t) => t.type === type)
        .reduce((s, t) => s + (t.amount || 0), 0);
    const cats = (txs) => {
      const c = {};
      txs
        .filter((t) => t.type === "expense")
        .forEach((t) => {
          c[t.category || "Lainnya"] =
            (c[t.category || "Lainnya"] || 0) + (t.amount || 0);
        });
      return Object.entries(c)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
    };

    const cIncome = sum(curr, "income");
    const cExpense = sum(curr, "expense");
    const pExpense = sum(prev, "expense");
    const pIncome = sum(prev, "income");
    const balance = cIncome - cExpense;
    const savRate =
      cIncome > 0 ? Math.round(((cIncome - cExpense) / cIncome) * 100) : 0;
    const expChange =
      pExpense > 0
        ? Math.round(((cExpense - pExpense) / pExpense) * 100)
        : null;

    return {
      label,
      period,
      income: cIncome,
      expense: cExpense,
      balance,
      savingsRate: savRate,
      txCount: curr.length,
      topCats: cats(curr),
      expChange,
      incChange:
        pIncome > 0 ? Math.round(((cIncome - pIncome) / pIncome) * 100) : null,
      streakDays: HealthScore.getStreak(),
    };
  }

  // ── Build prompt hemat token ──────────────────────────────
  function _buildPrompt(summary) {
    const fmt = (n) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
    const s = summary;
    const topCatsText = s.topCats
      .map(([cat, amt]) => `${cat} ${fmt(amt)}`)
      .join(", ");

    // Prompt sangat ringkas — hanya kirim angka yang sudah dihitung lokal
    return `Buat narasi keuangan personal dalam bahasa Indonesia yang casual, hangat, dan tidak menghakimi. Max 4 kalimat. Jangan ulangi semua angka, pilih yang paling relevan.

Data ${s.label}:
- Pemasukan: ${fmt(s.income)} | Pengeluaran: ${fmt(s.expense)} | Saldo: ${fmt(s.balance)}
- Savings rate: ${s.savingsRate}%
- Top pengeluaran: ${topCatsText || "belum ada data"}
- Perubahan pengeluaran vs periode lalu: ${s.expChange !== null ? s.expChange + "%" : "tidak ada data"}
- Konsistensi pencatatan: ${s.txCount} transaksi, streak ${s.streakDays} hari

Tulis seperti teman yang peduli — bisa mulai dengan situasi keuangan, lalu 1-2 insight menarik, tutup dengan kalimat semangat yang relevan.`;
  }

  // ── Generate story via AI ─────────────────────────────────
  async function generate(period = "month") {
    const summary = _buildSummary(period);

    // Cek cache — jangan generate ulang kalau sudah ada hari ini
    const cacheKey = `${period}_${new Date().toDateString()}`;
    try {
      const cache = JSON.parse(localStorage.getItem(LS_CACHE) || "{}");
      if (cache[cacheKey])
        return { story: cache[cacheKey], cached: true, summary };
    } catch {}

    if (summary.txCount === 0) {
      return {
        story: `Belum ada transaksi ${summary.label} yang dicatat. Yuk mulai catat biar aku bisa ceritain kondisi keuanganmu! 😊`,
        cached: false,
        summary,
      };
    }

    // Tampilkan loading di modal
    const bodyEl = document.getElementById("story-body");
    if (bodyEl) {
      bodyEl.innerHTML = `
        <div class="story-loading">
          <div class="story-loading-dots"><span></span><span></span><span></span></div>
          <div style="font-size:13px;color:var(--muted2);margin-top:8px">Sedang merangkai cerita keuanganmu...</div>
        </div>`;
    }

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CONFIG.MODEL,
          max_tokens: 400, // sengaja kecil — narasi pendek saja
          system:
            "Kamu asisten keuangan personal FinChat. Tulis narasi singkat, personal, dan tidak menghakimi dalam bahasa Indonesia casual.",
          messages: [{ role: "user", content: _buildPrompt(summary) }],
        }),
      });

      const data = await res.json();
      const story = data?.content?.[0]?.text || "Gagal generate story.";

      // Track token
      if (data.usage)
        TokenCounter.track(data.usage.input_tokens, data.usage.output_tokens);

      // Cache hasil — valid 1 hari
      try {
        const cache = JSON.parse(localStorage.getItem(LS_CACHE) || "{}");
        cache[cacheKey] = story;
        // Bersihkan cache lama (> 7 hari)
        const today = new Date();
        Object.keys(cache).forEach((k) => {
          const parts = k.split("_");
          const dateStr = parts.slice(1).join("_");
          const d = new Date(dateStr);
          if (!isNaN(d) && today - d > 7 * 24 * 60 * 60 * 1000) delete cache[k];
        });
        localStorage.setItem(LS_CACHE, JSON.stringify(cache));
      } catch {}

      return { story, cached: false, summary };
    } catch (e) {
      console.error("[FinancialStory]", e);
      return {
        story: "⚠️ Gagal generate story. Cek koneksi dan API key ya.",
        cached: false,
        summary,
      };
    }
  }

  // ── Modal ─────────────────────────────────────────────────
  function openModal() {
    document.getElementById("story-modal").classList.add("open");
    _renderModal("month"); // default bulan ini
  }

  function closeModal() {
    document.getElementById("story-modal").classList.remove("open");
  }

  async function _renderModal(period) {
    // Update tab active
    document.querySelectorAll(".story-tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.period === period);
    });

    const result = await generate(period);
    const bodyEl = document.getElementById("story-body");
    const { story, cached, summary } = result;
    const fmt = Chat.fmt;

    bodyEl.innerHTML = `
      <!-- Narasi -->
      <div class="story-text">${story.replace(/\n/g, "<br>")}</div>

      ${cached ? '<div class="story-cached">💾 Cached hari ini — klik 🔄 untuk generate ulang</div>' : ""}

      <!-- Mini summary -->
      <div class="story-mini-summary">
        <div class="story-stat">
          <div class="story-stat-label">Pemasukan</div>
          <div class="story-stat-value green">${fmt(summary.income)}</div>
        </div>
        <div class="story-stat">
          <div class="story-stat-label">Pengeluaran</div>
          <div class="story-stat-value red">${fmt(summary.expense)}</div>
        </div>
        <div class="story-stat">
          <div class="story-stat-label">Savings</div>
          <div class="story-stat-value ${summary.savingsRate >= 0 ? "amber" : "red"}">${summary.savingsRate}%</div>
        </div>
      </div>

      <!-- Regenerate -->
      <button class="story-regen-btn" onclick="FinancialStory.regenerate('${period}')">
        🔄 Generate ulang
      </button>`;
  }

  async function regenerate(period) {
    // Hapus cache untuk period ini
    try {
      const cache = JSON.parse(localStorage.getItem(LS_CACHE) || "{}");
      const cacheKey = `${period}_${new Date().toDateString()}`;
      delete cache[cacheKey];
      localStorage.setItem(LS_CACHE, JSON.stringify(cache));
    } catch {}
    await _renderModal(period);
  }

  function switchPeriod(period) {
    _renderModal(period);
  }

  return { generate, openModal, closeModal, regenerate, switchPeriod };
})();
