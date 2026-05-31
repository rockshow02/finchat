// ============================================================
//  FinChat — Weekly Insight
//  Insight mingguan otomatis — 0 token, murni lokal
//  Tampil otomatis setiap Senin atau manual via menu
// ============================================================

const WeeklyInsight = (() => {
  const LS_LAST_INSIGHT = "finchat_last_insight";

  // ── Helpers tanggal ────────────────────────────────────────
  function _startOfWeek(date, weeksAgo = 0) {
    const d = new Date(date);
    const day = d.getDay(); // 0=minggu, 1=senin dst
    const diff = day === 0 ? 6 : day - 1; // jarak ke Senin
    d.setDate(d.getDate() - diff - weeksAgo * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function _endOfWeek(startOfWeek) {
    const d = new Date(startOfWeek);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  }

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
    if (m) {
      const bulan = BULAN[m[2]];
      if (bulan !== undefined)
        return new Date(parseInt(m[3]), bulan, parseInt(m[1]));
    }
    return new Date();
  }

  // ── Filter transaksi dalam range ───────────────────────────
  function _txInRange(transactions, from, to) {
    return transactions.filter((tx) => {
      const d = _parseDate(tx.date);
      return d >= from && d <= to;
    });
  }

  // ── Hitung summary dari array transaksi ────────────────────
  function _summary(txs) {
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

    return { income, expense, topCats, count: txs.length };
  }

  // ── Generate insight text ──────────────────────────────────
  function generate(weeksAgo = 1) {
    const { transactions } = App.getFinancial();
    const fmt = Chat.fmt;
    const now = new Date();

    // Range minggu yang diminta
    const weekStart = _startOfWeek(now, weeksAgo);
    const weekEnd = _endOfWeek(weekStart);

    // Range minggu sebelumnya (untuk perbandingan)
    const prevStart = _startOfWeek(now, weeksAgo + 1);
    const prevEnd = _endOfWeek(prevStart);

    const thisWeekTx = _txInRange(transactions, weekStart, weekEnd);
    const prevWeekTx = _txInRange(transactions, prevStart, prevEnd);

    const curr = _summary(thisWeekTx);
    const prev = _summary(prevWeekTx);

    // Label periode
    const weekLabel =
      weeksAgo === 0
        ? "Minggu ini"
        : weeksAgo === 1
          ? "Minggu lalu"
          : `${weeksAgo} minggu lalu`;

    const dateRange = `${weekStart.toLocaleDateString("id-ID", { day: "2-digit", month: "short" })} – ${weekEnd.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}`;

    if (curr.count === 0) {
      return {
        title: `📊 Insight ${weekLabel}`,
        period: dateRange,
        empty: true,
        message: `Tidak ada transaksi yang dicatat ${weekLabel.toLowerCase()} (${dateRange}).`,
      };
    }

    // Perbandingan pengeluaran
    let expenseChange = null;
    if (prev.expense > 0) {
      const diff = curr.expense - prev.expense;
      const pct = Math.abs(Math.round((diff / prev.expense) * 100));
      expenseChange = { diff, pct, naik: diff > 0 };
    }

    // Perbandingan income
    let incomeChange = null;
    if (prev.income > 0) {
      const diff = curr.income - prev.income;
      const pct = Math.abs(Math.round((diff / prev.income) * 100));
      incomeChange = { diff, pct, naik: diff > 0 };
    }

    // Savings rate
    const savingsRate =
      curr.income > 0
        ? Math.round(((curr.income - curr.expense) / curr.income) * 100)
        : null;

    // Bangun insight
    const lines = [];

    // Header ringkasan
    lines.push(`📥 Pemasukan: **${fmt(curr.income)}**`);
    lines.push(`📤 Pengeluaran: **${fmt(curr.expense)}**`);
    lines.push(
      `💰 Saldo: **${curr.income >= curr.expense ? "" : "-"}${fmt(Math.abs(curr.income - curr.expense))}**`,
    );

    if (savingsRate !== null) {
      const savingsEmoji =
        savingsRate >= 20 ? "🟢" : savingsRate >= 0 ? "🟡" : "🔴";
      lines.push(`${savingsEmoji} Savings rate: **${savingsRate}%**`);
    }

    lines.push("");

    // Perbandingan minggu lalu
    if (expenseChange) {
      const arrow = expenseChange.naik ? "📈" : "📉";
      const trend = expenseChange.naik ? "naik" : "turun";
      lines.push(
        `${arrow} Pengeluaran **${trend} ${expenseChange.pct}%** vs minggu sebelumnya`,
      );
    }
    if (incomeChange) {
      const arrow = incomeChange.naik ? "📈" : "📉";
      const trend = incomeChange.naik ? "naik" : "turun";
      lines.push(
        `${arrow} Pemasukan **${trend} ${incomeChange.pct}%** vs minggu sebelumnya`,
      );
    }

    if (expenseChange || incomeChange) lines.push("");

    // Kategori terbesar
    if (curr.topCats.length > 0) {
      lines.push("🏷️ **Pengeluaran terbesar:**");
      curr.topCats.forEach(([cat, amt], i) => {
        const pct =
          curr.expense > 0 ? Math.round((amt / curr.expense) * 100) : 0;
        const medals = ["🥇", "🥈", "🥉"];
        lines.push(`${medals[i] || "•"} ${cat}: ${fmt(amt)} (${pct}%)`);
      });
      lines.push("");
    }

    // Insight / saran
    const insights = _generateInsights(curr, prev, expenseChange, savingsRate);
    if (insights.length > 0) {
      lines.push("💡 **Insight:**");
      insights.forEach((ins) => lines.push(`• ${ins}`));
    }

    return {
      title: `📊 Insight ${weekLabel}`,
      period: dateRange,
      empty: false,
      text: lines.join("\n"),
      curr,
      prev,
      expenseChange,
      incomeChange,
      savingsRate,
    };
  }

  // ── Generate insight teks ──────────────────────────────────
  function _generateInsights(curr, prev, expenseChange, savingsRate) {
    const insights = [];
    const fmt = Chat.fmt;

    if (expenseChange && expenseChange.naik && expenseChange.pct >= 20) {
      insights.push(
        `Pengeluaran naik signifikan ${expenseChange.pct}% — cek kategori terbesar`,
      );
    }
    if (expenseChange && !expenseChange.naik && expenseChange.pct >= 10) {
      insights.push(
        `Bagus! Berhasil hemat ${expenseChange.pct}% dibanding minggu lalu 🎉`,
      );
    }
    if (savingsRate !== null && savingsRate >= 30) {
      insights.push(
        `Savings rate ${savingsRate}% — sangat baik! Pertahankan 👏`,
      );
    }
    if (savingsRate !== null && savingsRate < 0) {
      insights.push(
        `Pengeluaran melebihi pemasukan minggu ini — perlu dievaluasi`,
      );
    }
    if (curr.topCats.length > 0) {
      const [topCat, topAmt] = curr.topCats[0];
      const pct =
        curr.expense > 0 ? Math.round((topAmt / curr.expense) * 100) : 0;
      if (pct >= 50) {
        insights.push(
          `${topCat} menyumbang ${pct}% pengeluaran — proporsi cukup besar`,
        );
      }
    }
    if (curr.count >= 10) {
      insights.push(`Konsisten mencatat ${curr.count} transaksi minggu ini 📝`);
    }
    return insights.slice(0, 3); // max 3 insight
  }

  // ── Tampilkan di chat ──────────────────────────────────────
  function showInChat(weeksAgo = 1) {
    const insight = generate(weeksAgo);

    if (insight.empty) {
      Chat.appendMessage(
        "bot",
        `${insight.title} (${insight.period})\n\n${insight.message}`,
      );
      return;
    }

    const header = `${insight.title}\n📅 ${insight.period}\n\n`;
    Chat.appendMessage("bot", header + insight.text);
  }

  // ── Auto-show setiap Senin ─────────────────────────────────
  function checkAutoShow() {
    const today = new Date();
    if (today.getDay() !== 1) return; // bukan Senin

    const lastShown = localStorage.getItem(LS_LAST_INSIGHT);
    const thisMonday = _startOfWeek(today, 0).toDateString();

    if (lastShown === thisMonday) return; // sudah ditampilkan minggu ini

    const { transactions } = App.getFinancial();
    if (transactions.length === 0) return; // belum ada data

    localStorage.setItem(LS_LAST_INSIGHT, thisMonday);
    setTimeout(() => showInChat(1), 1500); // delay 1.5s biar tidak langsung
  }

  // ── Modal ──────────────────────────────────────────────────
  function openModal() {
    _renderModal();
    document.getElementById("insight-modal").classList.add("open");
  }

  function closeModal() {
    document.getElementById("insight-modal").classList.remove("open");
  }

  function _renderModal() {
    const fmt = Chat.fmt;
    const tabs = [
      { label: "Minggu ini", weeksAgo: 0 },
      { label: "Minggu lalu", weeksAgo: 1 },
      { label: "2 Minggu lalu", weeksAgo: 2 },
    ];

    let activeTab = 1; // default minggu lalu

    const render = (weeksAgo) => {
      const insight = generate(weeksAgo);
      const el = document.getElementById("insight-body");

      if (insight.empty) {
        el.innerHTML = `<div style="text-align:center;color:var(--muted2);padding:30px">
          <div style="font-size:32px;margin-bottom:8px">📭</div>
          <div>${insight.message}</div>
        </div>`;
        return;
      }

      const { curr, prev, expenseChange, savingsRate } = insight;
      const savingsColor =
        savingsRate >= 20
          ? "var(--green)"
          : savingsRate >= 0
            ? "var(--amber)"
            : "var(--red)";

      el.innerHTML = `
        <!-- Summary cards -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
          <div class="db-card">
            <div class="db-card-label">Pemasukan</div>
            <div class="db-card-value green">${fmt(curr.income)}</div>
          </div>
          <div class="db-card">
            <div class="db-card-label">Pengeluaran</div>
            <div class="db-card-value red">${fmt(curr.expense)}</div>
          </div>
          <div class="db-card">
            <div class="db-card-label">Savings</div>
            <div class="db-card-value" style="color:${savingsColor}">${savingsRate !== null ? savingsRate + "%" : "-"}</div>
          </div>
        </div>

        <!-- Perbandingan minggu lalu -->
        ${
          expenseChange
            ? `
        <div class="insight-compare">
          <div class="insight-compare-item">
            <span class="insight-compare-icon">${expenseChange.naik ? "📈" : "📉"}</span>
            <div>
              <div style="font-size:12px;font-weight:500;color:var(--text)">Pengeluaran ${expenseChange.naik ? "naik" : "turun"} ${expenseChange.pct}%</div>
              <div style="font-size:11px;color:var(--muted2)">vs minggu sebelumnya (${fmt(prev.expense)})</div>
            </div>
          </div>
        </div>`
            : ""
        }

        <!-- Kategori terbesar -->
        ${
          curr.topCats.length > 0
            ? `
        <div style="margin-top:14px">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px">🏷️ Pengeluaran per Kategori</div>
          ${curr.topCats
            .map(([cat, amt], i) => {
              const pct =
                curr.expense > 0 ? Math.round((amt / curr.expense) * 100) : 0;
              const colors = ["#7c6aff", "#34d399", "#fbbf24"];
              return `<div style="margin-bottom:8px">
              <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
                <span style="color:var(--text)">${["🥇", "🥈", "🥉"][i]} ${cat}</span>
                <span style="color:var(--muted2);font-family:JetBrains Mono,monospace">${fmt(amt)} (${pct}%)</span>
              </div>
              <div style="height:4px;background:var(--border2);border-radius:2px">
                <div style="width:${pct}%;height:100%;background:${colors[i]};border-radius:2px;transition:width .5s"></div>
              </div>
            </div>`;
            })
            .join("")}
        </div>`
            : ""
        }

        <!-- Insights -->
        ${
          _generateInsights(curr, prev, expenseChange, savingsRate).length > 0
            ? `
        <div style="margin-top:14px">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px">💡 Insight</div>
          ${_generateInsights(curr, prev, expenseChange, savingsRate)
            .map((ins) => `<div class="hs-tip">${ins}</div>`)
            .join("")}
        </div>`
            : ""
        }

        <!-- Total transaksi -->
        <div style="margin-top:12px;font-size:11px;color:var(--muted);text-align:center">
          ${curr.count} transaksi tercatat periode ini
        </div>`;
    };

    document.getElementById("insight-modal-content").innerHTML = `
      <!-- Tabs -->
      <div class="insight-tabs" id="insight-tabs">
        ${tabs
          .map(
            (t, i) => `
          <button class="insight-tab ${i === activeTab ? "active" : ""}"
            onclick="WeeklyInsight._switchTab(${i}, ${t.weeksAgo})">
            ${t.label}
          </button>`,
          )
          .join("")}
      </div>
      <div id="insight-body"></div>`;

    render(activeTab);

    // Expose switch tab
    WeeklyInsight._activeRender = render;
  }

  function _switchTab(tabIdx, weeksAgo) {
    document.querySelectorAll(".insight-tab").forEach((t, i) => {
      t.classList.toggle("active", i === tabIdx);
    });
    if (WeeklyInsight._activeRender) WeeklyInsight._activeRender(weeksAgo);
  }

  return {
    generate,
    showInChat,
    checkAutoShow,
    openModal,
    closeModal,
    _switchTab,
  };
})();
