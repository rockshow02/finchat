// ============================================================
//  FinChat — Dashboard Modal
//  Tampilkan transaksi dengan filter periode & search
// ============================================================

const Dashboard = (() => {
  let currentFilter = "all"; // 'all' | 'income' | 'expense'
  let currentPeriod = "all"; // 'all' | 'today' | 'week' | 'month'

  // ── Open ───────────────────────────────────────────────────
  function open(filter = "all") {
    currentFilter = filter;
    currentPeriod = "all";

    // Reset UI state
    document.getElementById("db-search").value = "";
    document.getElementById("db-type").value = filter;
    document.querySelectorAll(".period-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.period === "all");
    });

    // Set title
    const titles = {
      all: "Semua Transaksi",
      income: "Pemasukan",
      expense: "Pengeluaran",
    };
    document.getElementById("db-title").textContent =
      titles[filter] || "Semua Transaksi";

    document.getElementById("dashboard-modal").classList.add("open");
    render();
  }

  // ── Close ──────────────────────────────────────────────────
  function close() {
    document.getElementById("dashboard-modal").classList.remove("open");
  }

  // ── Set Period ─────────────────────────────────────────────
  function setPeriod(period, btn) {
    currentPeriod = period;
    document
      .querySelectorAll(".period-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    render();
  }

  // ── Filter Transactions ────────────────────────────────────
  function _filterTransactions() {
    const { transactions } = App.getFinancial();
    const search = (
      document.getElementById("db-search")?.value || ""
    ).toLowerCase();
    const typeFilter = document.getElementById("db-type")?.value || "all";
    const now = new Date();

    return transactions.filter((tx) => {
      // Type filter
      if (typeFilter !== "all" && tx.type !== typeFilter) return false;

      // Search filter
      if (search) {
        const hay = `${tx.label} ${tx.category} ${tx.date}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }

      // Period filter — best-effort since date is free text from Claude
      if (currentPeriod !== "all") {
        const txDate = _parseDate(tx.date);
        if (txDate) {
          if (currentPeriod === "today") {
            const isToday = txDate.toDateString() === now.toDateString();
            if (!isToday) return false;
          }
          if (currentPeriod === "week") {
            const weekAgo = new Date(now);
            weekAgo.setDate(now.getDate() - 7);
            if (txDate < weekAgo) return false;
          }
          if (currentPeriod === "month") {
            if (
              txDate.getMonth() !== now.getMonth() ||
              txDate.getFullYear() !== now.getFullYear()
            )
              return false;
          }
        }
      }

      return true;
    });
  }

  function _parseDate(str) {
    if (!str || str === "hari ini") return new Date();
    const d = new Date(str);
    return isNaN(d) ? null : d;
  }

  // ── Render ─────────────────────────────────────────────────
  function render() {
    const filtered = _filterTransactions();
    const { income: totalIncome, expense: totalExpense } = App.getFinancial();
    const fmt = Chat.fmt;

    // Subtitle
    const periodLabels = {
      all: "Semua waktu",
      today: "Hari ini",
      week: "7 hari terakhir",
      month: "Bulan ini",
    };
    document.getElementById("db-sub").textContent =
      `${filtered.length} transaksi • ${periodLabels[currentPeriod]}`;

    // Cards — based on filtered
    const filteredIncome = filtered
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + (t.amount || 0), 0);
    const filteredExpense = filtered
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + (t.amount || 0), 0);
    const filteredBalance = filteredIncome - filteredExpense;

    document.getElementById("db-cards").innerHTML = `
      <div class="db-card">
        <div class="db-card-label">Pemasukan</div>
        <div class="db-card-value green">${fmt(filteredIncome)}</div>
      </div>
      <div class="db-card">
        <div class="db-card-label">Pengeluaran</div>
        <div class="db-card-value red">${fmt(filteredExpense)}</div>
      </div>
      <div class="db-card">
        <div class="db-card-label">Saldo</div>
        <div class="db-card-value ${filteredBalance >= 0 ? "amber" : "red"}">${filteredBalance < 0 ? "-" : ""}${fmt(filteredBalance)}</div>
      </div>`;

    // ── Chart Panel (left side) ─────────────────────────────
    const COLORS = [
      "#7c6aff",
      "#34d399",
      "#f87171",
      "#fbbf24",
      "#60a5fa",
      "#f472b6",
      "#a78bfa",
      "#86efac",
    ];
    const expenseCats = {};
    filtered
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        const c = t.category || "Lainnya";
        expenseCats[c] = (expenseCats[c] || 0) + (t.amount || 0);
      });

    const chartPanel = document.getElementById("db-chart-panel");
    const legendEl = document.getElementById("db-legend");

    if (Object.keys(expenseCats).length > 0) {
      chartPanel.style.display = "flex";

      // Destroy previous chart
      if (window._dbPieChart) {
        window._dbPieChart.destroy();
        window._dbPieChart = null;
      }

      const sortedCats = Object.entries(expenseCats).sort(
        (a, b) => b[1] - a[1],
      );
      const labels = sortedCats.map(([k]) => k);
      const values = sortedCats.map(([, v]) => v);

      setTimeout(() => {
        const canvas = document.getElementById("db-pie-chart");
        if (!canvas) return;
        window._dbPieChart = new Chart(canvas.getContext("2d"), {
          type: "doughnut",
          data: {
            labels,
            datasets: [
              {
                data: values,
                backgroundColor: COLORS,
                borderWidth: 2,
                borderColor: "transparent",
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: "65%",
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: { label: (c) => ` ${Chat.fmt(c.parsed)}` },
              },
            },
          },
        });
      }, 50);

      // Custom legend
      legendEl.innerHTML = sortedCats
        .map(
          ([name, val], i) => `
        <div class="db-legend-item">
          <div class="db-legend-dot" style="background:${COLORS[i % COLORS.length]}"></div>
          <div class="db-legend-name" title="${name}">${name}</div>
          <div class="db-legend-val">${filteredExpense > 0 ? Math.round((val / filteredExpense) * 100) : 0}%</div>
        </div>`,
        )
        .join("");
    } else {
      chartPanel.style.display = "none";
      legendEl.innerHTML = "";
    }
    const tbody = document.getElementById("db-tbody");
    const empty = document.getElementById("db-empty");

    if (filtered.length === 0) {
      tbody.innerHTML = "";
      empty.style.display = "flex";
    } else {
      empty.style.display = "none";
      tbody.innerHTML = filtered
        .map((tx, i) => {
          // Cari index asli di transactions
          const realIdx = App.getFinancial().transactions.indexOf(tx);
          return `
        <tr>
          <td style="color:var(--muted);width:40px">${i + 1}</td>
          <td>${tx.label || "-"}</td>
          <td style="color:var(--muted2)">${tx.category || "-"}</td>
          <td>
            <span class="type-badge ${tx.type}">
              ${tx.type === "income" ? "Pemasukan" : "Pengeluaran"}
            </span>
          </td>
          <td class="amount-cell ${tx.type}">
            ${tx.type === "income" ? "+" : "-"}${fmt(tx.amount || 0)}
          </td>
          <td style="color:var(--muted2);font-size:12px">${tx.date || "-"}</td>
          <td>
            <button onclick="EditTx.open(${realIdx})" style="background:transparent;border:1px solid var(--border2);border-radius:6px;color:var(--muted2);cursor:pointer;padding:3px 8px;font-size:11px" title="Edit">✏️</button>
          </td>
        </tr>`;
        })
        .join("");
    }

    // Footer
    document.getElementById("db-footer").innerHTML = `
      <span>Total ditampilkan: <strong style="color:var(--text)">${filtered.length} transaksi</strong></span>
      <span>Pemasukan: <strong class="db-card-value green" style="font-size:12px">${fmt(filteredIncome)}</strong></span>
      <span>Pengeluaran: <strong class="db-card-value red" style="font-size:12px">${fmt(filteredExpense)}</strong></span>
      <span>Saldo: <strong class="db-card-value ${filteredBalance >= 0 ? "amber" : "red"}" style="font-size:12px">${filteredBalance < 0 ? "-" : ""}${fmt(filteredBalance)}</strong></span>`;
  }

  // Close modal on overlay click
  document.addEventListener("click", (e) => {
    const modal = document.getElementById("dashboard-modal");
    if (e.target === modal) close();
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  return { open, close, setPeriod, render };
})();
