// ============================================================
//  FinChat — Laporan Bulanan Otomatis
//  Tampil otomatis di awal bulan — 0 token, murni lokal
// ============================================================

const MonthlyReport = (() => {
  const LS_LAST_REPORT = "finchat_last_monthly_report";

  const BULAN_NAMES = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];

  // ── Parse tanggal ─────────────────────────────────────────
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

  // ── Hitung data bulan tertentu ────────────────────────────
  function _calcMonth(transactions, year, month) {
    const txs = transactions.filter((tx) => {
      const d = _parseDate(tx.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });

    const income = txs
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + (t.amount || 0), 0);
    const expense = txs
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + (t.amount || 0), 0);

    // Kategori terbesar
    const cats = {};
    txs
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        const c = t.category || "Lainnya";
        cats[c] = (cats[c] || 0) + (t.amount || 0);
      });
    const topCats = Object.entries(cats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    // Hari aktif catat
    const activeDays = new Set(
      txs.map((t) => _parseDate(t.date).toDateString()),
    ).size;

    return {
      income,
      expense,
      balance: income - expense,
      topCats,
      count: txs.length,
      activeDays,
    };
  }

  // ── Generate teks laporan ─────────────────────────────────
  function _buildReport(data, monthName, year) {
    const fmt = Chat.fmt;
    const { income, expense, balance, topCats, count, activeDays } = data;
    const savingsRate =
      income > 0 ? Math.round(((income - expense) / income) * 100) : 0;
    const statusEmoji = balance >= 0 ? (savingsRate >= 20 ? "🟢" : "🟡") : "🔴";

    const lines = [];
    lines.push(`📅 **Laporan Bulan ${monthName} ${year}**`);
    lines.push("");
    lines.push(`${statusEmoji} **Ringkasan:**`);
    lines.push(`📥 Pemasukan: **${fmt(income)}**`);
    lines.push(`📤 Pengeluaran: **${fmt(expense)}**`);
    lines.push(`💰 Saldo: **${fmt(balance)}** (savings rate ${savingsRate}%)`);
    lines.push("");

    if (topCats.length > 0) {
      lines.push(`🏷️ **Top Pengeluaran:**`);
      topCats.forEach(([cat, amt], i) => {
        const pct = expense > 0 ? Math.round((amt / expense) * 100) : 0;
        const medals = ["🥇", "🥈", "🥉"];
        lines.push(`${medals[i]} ${cat}: ${fmt(amt)} (${pct}%)`);
      });
      lines.push("");
    }

    lines.push(
      `📝 **Konsistensi:** ${count} transaksi dalam ${activeDays} hari aktif`,
    );
    lines.push("");

    // Saran singkat berdasarkan data
    if (balance < 0) {
      lines.push(
        `⚠️ Bulan lalu pengeluaran melebihi pemasukan sebesar ${fmt(Math.abs(balance))}. Yuk evaluasi pengeluaran terbesar!`,
      );
    } else if (savingsRate >= 20) {
      lines.push(
        `✨ Luar biasa! Savings rate ${savingsRate}% — keuanganmu bulan lalu sangat sehat!`,
      );
    } else if (savingsRate >= 10) {
      lines.push(
        `👍 Bulan lalu cukup baik. Coba tingkatkan savings rate ke 20% bulan ini!`,
      );
    } else if (income > 0) {
      lines.push(
        `💡 Savings rate bulan lalu hanya ${savingsRate}%. Ada kategori yang bisa dikurangi?`,
      );
    }

    if (count === 0) {
      return null; // tidak ada data bulan lalu
    }

    return lines.join("\n");
  }

  // ── Cek apakah perlu tampil laporan ──────────────────────
  function checkAutoShow() {
    const now = new Date();
    const currentDay = now.getDate();

    // Hanya tampil di 3 hari pertama bulan
    if (currentDay > 3) return;

    const lastReport = localStorage.getItem(LS_LAST_REPORT);
    const thisMonth = `${now.getFullYear()}-${now.getMonth()}`;

    // Sudah ditampilkan bulan ini
    if (lastReport === thisMonth) return;

    const { transactions } = App.getFinancial();
    if (transactions.length === 0) return;

    // Hitung data bulan lalu
    const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const prevYear =
      now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const data = _calcMonth(transactions, prevYear, prevMonth);

    if (data.count === 0) return; // tidak ada transaksi bulan lalu

    // Tampilkan dengan delay kecil
    setTimeout(() => {
      const report = _buildReport(data, BULAN_NAMES[prevMonth], prevYear);
      if (report) {
        Chat.appendMessage("bot", report);
        localStorage.setItem(LS_LAST_REPORT, thisMonth);
      }
    }, 2000);
  }

  // ── Generate manual untuk bulan tertentu ─────────────────
  function generate(monthsAgo = 1, specificMonth = null) {
    const now = new Date();
    let month, year;

    if (specificMonth !== null) {
      month = specificMonth;
      // Kalau bulan target > bulan sekarang, berarti tahun lalu
      year =
        specificMonth > now.getMonth()
          ? now.getFullYear() - 1
          : now.getFullYear();
    } else {
      month = now.getMonth() - monthsAgo;
      year = now.getFullYear();
      while (month < 0) {
        month += 12;
        year--;
      }
    }

    const { transactions } = App.getFinancial();
    const data = _calcMonth(transactions, year, month);
    const label = BULAN_NAMES[month];

    let reply;
    if (data.count === 0) {
      reply = `📅 Tidak ada transaksi di bulan ${label} ${year}.`;
    } else {
      reply = _buildReport(data, label, year);
    }

    if (reply) {
      Chat.appendMessage("bot", reply);
      App.pushMessage({ role: "assistant", content: reply });
      App.save();
    }
  }

  // ── Handle chat command ───────────────────────────────────
  function handleChatCommand(text) {
    const lower = text.toLowerCase();

    // Harus ada kata laporan/rekap
    if (!/\b(laporan|rekap)\b/.test(lower)) return false;

    const BULAN_IDX = {
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
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      jun: 5,
      jul: 6,
      agu: 7,
      sep: 8,
      okt: 9,
      nov: 10,
      des: 11,
    };

    // Handle nama bulan spesifik — "laporan april", "laporan bulan mei"
    for (const [name, idx] of Object.entries(BULAN_IDX)) {
      if (new RegExp(`\\b${name}\\b`).test(lower)) {
        Chat.appendMessage("user", text);
        App.pushMessage({ role: "user", content: text });
        setTimeout(() => generate(null, idx), 100);
        return true;
      }
    }

    // Handle relatif
    let monthsAgo = null;
    if (/laporan\s+(bulan\s+lalu|kemarin|kemaren)/.test(lower)) monthsAgo = 1;
    else if (/laporan\s+2\s+bulan/.test(lower)) monthsAgo = 2;
    else if (/laporan\s+bulanan/.test(lower)) monthsAgo = 1;

    if (monthsAgo === null) return false;

    Chat.appendMessage("user", text);
    App.pushMessage({ role: "user", content: text });
    setTimeout(() => generate(monthsAgo), 100);
    return true;
  }

  return { checkAutoShow, generate, handleChatCommand };
})();
