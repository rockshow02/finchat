// ============================================================
//  FinChat — Advanced Analytics (Premium)
//  Grafik tren bulanan, perbandingan periode, breakdown detail
//  0 token — murni lokal, Chart.js
// ============================================================

const AdvancedAnalytics = (() => {
  const BULAN = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];
  const BULAN_FULL = [
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
    if (!str) return new Date();
    const BMAP = {
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
    if (m && BMAP[m[2]] !== undefined)
      return new Date(parseInt(m[3]), BMAP[m[2]], parseInt(m[1]));
    return new Date();
  }

  // ── Hitung data per bulan (12 bulan terakhir) ─────────────
  function _calcMonthlyData() {
    const { transactions } = App.getFinancial();
    const now = new Date();
    const result = [];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = d.getMonth();
      const year = d.getFullYear();

      const txs = transactions.filter((tx) => {
        const td = _parseDate(tx.date);
        return td.getFullYear() === year && td.getMonth() === month;
      });

      const income = txs
        .filter((t) => t.type === "income")
        .reduce((s, t) => s + (t.amount || 0), 0);
      const expense = txs
        .filter((t) => t.type === "expense")
        .reduce((s, t) => s + (t.amount || 0), 0);

      // Kategori bulan ini
      const cats = {};
      txs
        .filter((t) => t.type === "expense")
        .forEach((t) => {
          const c = t.category || "Lainnya";
          cats[c] = (cats[c] || 0) + (t.amount || 0);
        });

      result.push({
        month,
        year,
        label: BULAN[month],
        income,
        expense,
        balance: income - expense,
        txCount: txs.length,
        cats,
      });
    }
    return result;
  }

  // ── Hitung kategori semua waktu ───────────────────────────
  function _calcAllCategories() {
    const { transactions } = App.getFinancial();
    const cats = {};
    transactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        const c = t.category || "Lainnya";
        cats[c] = (cats[c] || 0) + (t.amount || 0);
      });
    return Object.entries(cats).sort((a, b) => b[1] - a[1]);
  }

  // ── Hitung statistik umum ─────────────────────────────────
  function _calcStats(monthly) {
    const withData = monthly.filter((m) => m.income > 0 || m.expense > 0);
    if (withData.length === 0) return null;

    const avgIncome =
      withData.reduce((s, m) => s + m.income, 0) / withData.length;
    const avgExpense =
      withData.reduce((s, m) => s + m.expense, 0) / withData.length;
    const maxExpense = Math.max(...withData.map((m) => m.expense));
    const minExpense =
      withData.filter((m) => m.expense > 0).length > 0
        ? Math.min(
            ...withData.filter((m) => m.expense > 0).map((m) => m.expense),
          )
        : 0;
    const maxExpMonth = withData.find((m) => m.expense === maxExpense);
    const savingsRates = withData
      .filter((m) => m.income > 0)
      .map((m) => ((m.income - m.expense) / m.income) * 100);
    const avgSavingsRate =
      savingsRates.length > 0
        ? savingsRates.reduce((s, r) => s + r, 0) / savingsRates.length
        : 0;

    return {
      avgIncome,
      avgExpense,
      maxExpense,
      minExpense,
      maxExpMonth,
      avgSavingsRate,
    };
  }

  // ── Render modal ──────────────────────────────────────────
  function openModal() {
    document.getElementById("analytics-modal").classList.add("open");
    setTimeout(() => _renderAll(), 100);
  }

  function closeModal() {
    document.getElementById("analytics-modal").classList.remove("open");
    // Destroy charts supaya tidak memory leak
    Object.values(_charts).forEach((c) => {
      try {
        c.destroy();
      } catch {}
    });
    _charts = {};
  }

  let _charts = {};
  let _activeTab = "trend";

  function switchTab(tab) {
    _activeTab = tab;
    document.querySelectorAll(".analytics-tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === tab);
    });
    document.querySelectorAll(".analytics-panel").forEach((p) => {
      p.style.display = p.dataset.panel === tab ? "block" : "none";
    });
    // Render chart untuk tab yang aktif
    setTimeout(() => {
      if (tab === "trend") _renderTrendChart();
      if (tab === "compare") _renderCompareChart();
      if (tab === "breakdown") _renderBreakdown();
    }, 50);
  }

  function _renderAll() {
    const monthly = _calcMonthlyData();
    const stats = _calcStats(monthly);
    const fmt = Chat.fmt;

    // Stats cards
    document.getElementById("analytics-stats").innerHTML = !stats
      ? `
      <div style="text-align:center;color:var(--muted2);padding:20px">
        Belum ada data yang cukup untuk analisis
      </div>`
      : `
      <div class="analytics-stats-grid">
        <div class="stat-card">
          <div class="stat-label">Rata-rata Pemasukan</div>
          <div class="stat-value green">${fmt(stats.avgIncome)}</div>
          <div class="stat-sub">per bulan</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Rata-rata Pengeluaran</div>
          <div class="stat-value red">${fmt(stats.avgExpense)}</div>
          <div class="stat-sub">per bulan</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Avg Savings Rate</div>
          <div class="stat-value ${stats.avgSavingsRate >= 20 ? "green" : "amber"}">${Math.round(stats.avgSavingsRate)}%</div>
          <div class="stat-sub">12 bulan terakhir</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Pengeluaran Tertinggi</div>
          <div class="stat-value red">${fmt(stats.maxExpense)}</div>
          <div class="stat-sub">${stats.maxExpMonth ? BULAN_FULL[stats.maxExpMonth.month] : "-"}</div>
        </div>
      </div>`;

    // Render tab pertama
    switchTab("trend");
  }

  // ── Chart 1: Tren bulanan (line chart) ───────────────────
  function _renderTrendChart() {
    const monthly = _calcMonthlyData();
    const ctx = document.getElementById("chart-trend");
    if (!ctx) return;
    if (_charts.trend) {
      _charts.trend.destroy();
    }

    const isDark = !document.body.classList.contains("light");
    const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    const textColor = isDark ? "#a0aec0" : "#666";

    _charts.trend = new Chart(ctx, {
      type: "line",
      data: {
        labels: monthly.map((m) => `${m.label} ${m.year}`),
        datasets: [
          {
            label: "Pemasukan",
            data: monthly.map((m) => m.income),
            borderColor: "#34d399",
            backgroundColor: "rgba(52,211,153,0.1)",
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            label: "Pengeluaran",
            data: monthly.map((m) => m.expense),
            borderColor: "#f87171",
            backgroundColor: "rgba(248,113,113,0.1)",
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            labels: {
              color: textColor,
              font: { family: "Sora" },
              boxWidth: 12,
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                ` ${ctx.dataset.label}: ${Chat.fmt(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: textColor, maxRotation: 45 },
            grid: { color: gridColor },
          },
          y: {
            ticks: {
              color: textColor,
              callback: (v) =>
                v >= 1e6 ? `${v / 1e6}jt` : v >= 1e3 ? `${v / 1e3}rb` : v,
            },
            grid: { color: gridColor },
          },
        },
      },
    });
  }

  // ── Chart 2: Perbandingan bulan ini vs lalu (bar chart) ──
  function _renderCompareChart() {
    const monthly = _calcMonthlyData();
    const ctx = document.getElementById("chart-compare");
    if (!ctx) return;
    if (_charts.compare) {
      _charts.compare.destroy();
    }

    // Ambil 6 bulan terakhir
    const last6 = monthly.slice(-6);
    const isDark = !document.body.classList.contains("light");
    const textColor = isDark ? "#a0aec0" : "#666";
    const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";

    _charts.compare = new Chart(ctx, {
      type: "bar",
      data: {
        labels: last6.map((m) => m.label),
        datasets: [
          {
            label: "Pemasukan",
            data: last6.map((m) => m.income),
            backgroundColor: "rgba(52,211,153,0.8)",
            borderRadius: 6,
          },
          {
            label: "Pengeluaran",
            data: last6.map((m) => m.expense),
            backgroundColor: "rgba(248,113,113,0.8)",
            borderRadius: 6,
          },
          {
            label: "Saldo",
            data: last6.map((m) => m.balance),
            backgroundColor: last6.map((m) =>
              m.balance >= 0 ? "rgba(124,106,255,0.8)" : "rgba(251,191,36,0.8)",
            ),
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: textColor,
              font: { family: "Sora" },
              boxWidth: 12,
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                ` ${ctx.dataset.label}: ${Chat.fmt(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: {
            ticks: {
              color: textColor,
              callback: (v) =>
                v >= 1e6 ? `${v / 1e6}jt` : v >= 1e3 ? `${v / 1e3}rb` : v,
            },
            grid: { color: gridColor },
          },
        },
      },
    });
  }

  // ── Panel 3: Breakdown detail per kategori ───────────────
  function _renderBreakdown() {
    const cats = _calcAllCategories();
    const total = cats.reduce((s, [, v]) => s + v, 0);
    const fmt = Chat.fmt;
    const monthly = _calcMonthlyData();

    const colors = [
      "#7c6aff",
      "#34d399",
      "#f87171",
      "#fbbf24",
      "#60a5fa",
      "#f97316",
      "#a78bfa",
      "#34d399",
      "#fb7185",
    ];

    const el = document.getElementById("breakdown-body");
    if (!el) return;

    if (cats.length === 0) {
      el.innerHTML =
        '<div style="text-align:center;color:var(--muted2);padding:20px">Belum ada data pengeluaran</div>';
      return;
    }

    // Tabel kategori
    const catRows = cats
      .map(([cat, amt], i) => {
        const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
        const color = colors[i % colors.length];
        // Trend: bandingkan 2 bulan terakhir
        const last = monthly[monthly.length - 1]?.cats[cat] || 0;
        const prev = monthly[monthly.length - 2]?.cats[cat] || 0;
        const trend =
          prev > 0 ? Math.round(((last - prev) / prev) * 100) : null;
        const trendHtml =
          trend !== null
            ? `<span style="font-size:10px;color:${trend > 0 ? "var(--red)" : "var(--green)"}">${trend > 0 ? "↑" : "↓"}${Math.abs(trend)}%</span>`
            : "";

        return `
        <div class="breakdown-row">
          <div class="breakdown-dot" style="background:${color}"></div>
          <div class="breakdown-info">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px">
              <span style="font-size:13px;color:var(--text);font-weight:500">${cat}</span>
              <span style="font-size:12px;font-family:JetBrains Mono,monospace;color:var(--text)">${fmt(amt)} ${trendHtml}</span>
            </div>
            <div style="height:4px;background:var(--border2);border-radius:2px">
              <div style="width:${pct}%;height:100%;background:${color};border-radius:2px"></div>
            </div>
            <div style="font-size:10px;color:var(--muted2);margin-top:2px">${pct}% dari total</div>
          </div>
        </div>`;
      })
      .join("");

    el.innerHTML = `
      <div style="margin-bottom:14px;font-size:12px;color:var(--muted2)">
        Total pengeluaran: <strong style="color:var(--text)">${fmt(total)}</strong>
        • ${cats.length} kategori
      </div>
      ${catRows}`;
  }

  return { openModal, closeModal, switchTab };
})();
