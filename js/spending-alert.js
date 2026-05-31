// ============================================================
//  FinChat — Spending Alert
//  Notifikasi otomatis saat pengeluaran naik drastis
//  0 token — murni lokal
//
//  Triggers:
//  1. Kenaikan kategori >50% vs minggu lalu
//  2. Kenaikan kategori >30% vs rata-rata 4 minggu
//  3. Pengeluaran harian melebihi rata-rata harian
//  4. Saldo mendekati 0 (< 10% dari income)
// ============================================================

const SpendingAlert = (() => {
  const LS_DISMISSED = "finchat_alerts_dismissed";
  const LS_LAST_CHECK = "finchat_alert_lastcheck";

  // ── Helpers tanggal ───────────────────────────────────────
  function _startOfWeek(date, weeksAgo = 0) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff - weeksAgo * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function _endOfWeek(start) {
    const d = new Date(start);
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

  function _txInRange(transactions, from, to) {
    return transactions.filter((t) => {
      const d = _parseDate(t.date);
      return d >= from && d <= to && t.type === "expense";
    });
  }

  // ── Hitung pengeluaran per kategori ───────────────────────
  function _catTotals(txs) {
    const cats = {};
    txs.forEach((t) => {
      const c = t.category || "Lainnya";
      cats[c] = (cats[c] || 0) + (t.amount || 0);
    });
    return cats;
  }

  // ── Generate semua alert ───────────────────────────────────
  function checkAll() {
    const { transactions, income, expense } = App.getFinancial();
    if (transactions.length === 0) return [];

    const now = new Date();
    const alerts = [];
    const dismissed = _getDismissed();

    // ── Alert 1: Kenaikan kategori vs minggu lalu ─────────────
    const thisWeekStart = _startOfWeek(now, 0);
    const thisWeekEnd = _endOfWeek(thisWeekStart);
    const prevWeekStart = _startOfWeek(now, 1);
    const prevWeekEnd = _endOfWeek(prevWeekStart);

    const thisWeekTx = _txInRange(transactions, thisWeekStart, thisWeekEnd);
    const prevWeekTx = _txInRange(transactions, prevWeekStart, prevWeekEnd);

    const thisCats = _catTotals(thisWeekTx);
    const prevCats = _catTotals(prevWeekTx);

    Object.entries(thisCats).forEach(([cat, thisAmt]) => {
      const prevAmt = prevCats[cat] || 0;
      if (prevAmt === 0) return; // tidak ada data sebelumnya
      const pct = Math.round(((thisAmt - prevAmt) / prevAmt) * 100);
      if (pct >= 50) {
        const id = `cat_spike_${cat}_${thisWeekStart.toDateString()}`;
        if (!dismissed.includes(id)) {
          alerts.push({
            id,
            type: "spike",
            priority: pct >= 100 ? "high" : "medium",
            icon: pct >= 100 ? "🚨" : "⚠️",
            title: `${cat} naik ${pct}%`,
            message: `Pengeluaran ${cat} minggu ini ${Chat.fmt(thisAmt)} — naik ${pct}% vs minggu lalu (${Chat.fmt(prevAmt)})`,
            category: cat,
            pct,
          });
        }
      }
    });

    // ── Alert 2: Kenaikan vs rata-rata 4 minggu ───────────────
    const avg4 = {};
    for (let w = 1; w <= 4; w++) {
      const wStart = _startOfWeek(now, w);
      const wEnd = _endOfWeek(wStart);
      const wTx = _txInRange(transactions, wStart, wEnd);
      const wCats = _catTotals(wTx);
      Object.entries(wCats).forEach(([cat, amt]) => {
        avg4[cat] = (avg4[cat] || 0) + amt;
      });
    }
    Object.keys(avg4).forEach((cat) => {
      avg4[cat] = avg4[cat] / 4;
    });

    Object.entries(thisCats).forEach(([cat, thisAmt]) => {
      const avgAmt = avg4[cat] || 0;
      if (avgAmt === 0) return;
      const pct = Math.round(((thisAmt - avgAmt) / avgAmt) * 100);
      // Hanya alert kalau belum ada alert spike untuk kategori ini
      const alreadyAlerting = alerts.some((a) => a.category === cat);
      if (pct >= 30 && !alreadyAlerting) {
        const id = `cat_avg_${cat}_${thisWeekStart.toDateString()}`;
        if (!dismissed.includes(id)) {
          alerts.push({
            id,
            type: "above_avg",
            priority: "low",
            icon: "📊",
            title: `${cat} di atas rata-rata`,
            message: `Pengeluaran ${cat} minggu ini ${Chat.fmt(thisAmt)} — ${pct}% di atas rata-rata 4 minggu (${Chat.fmt(Math.round(avgAmt))})`,
            category: cat,
            pct,
          });
        }
      }
    });

    // ── Alert 3: Saldo mendekati 0 ────────────────────────────
    if (income > 0) {
      const balance = income - expense;
      const balancePct = Math.round((balance / income) * 100);
      if (balancePct <= 10 && balancePct >= 0) {
        const id = `low_balance_${new Date().toDateString()}`;
        if (!dismissed.includes(id)) {
          alerts.push({
            id,
            type: "low_balance",
            priority: "high",
            icon: "🔴",
            title: "Saldo hampir habis",
            message: `Saldo kamu tinggal ${Chat.fmt(balance)} (${balancePct}% dari income) — pertimbangkan kurangi pengeluaran`,
            category: null,
            pct: balancePct,
          });
        }
      }
    }

    // ── Alert 4: Defisit (pengeluaran > income) ───────────────
    if (income > 0 && expense > income) {
      const id = `deficit_${new Date().toDateString()}`;
      if (!dismissed.includes(id)) {
        alerts.push({
          id,
          type: "deficit",
          priority: "high",
          icon: "🚨",
          title: "Pengeluaran melebihi income!",
          message: `Pengeluaran ${Chat.fmt(expense)} melebihi income ${Chat.fmt(income)} — defisit ${Chat.fmt(expense - income)}`,
          category: null,
          pct: null,
        });
      }
    }

    // Sort by priority: high → medium → low
    const order = { high: 0, medium: 1, low: 2 };
    return alerts.sort((a, b) => order[a.priority] - order[b.priority]);
  }

  // ── Dismissed alerts ──────────────────────────────────────
  function _getDismissed() {
    try {
      return JSON.parse(localStorage.getItem(LS_DISMISSED) || "[]");
    } catch {
      return [];
    }
  }

  function dismiss(id) {
    const list = _getDismissed();
    if (!list.includes(id)) list.push(id);
    // Simpan max 50 dismissed alerts
    const trimmed = list.slice(-50);
    localStorage.setItem(LS_DISMISSED, JSON.stringify(trimmed));
    _renderBadge();
  }

  function dismissAll() {
    const alerts = checkAll();
    const list = _getDismissed();
    alerts.forEach((a) => {
      if (!list.includes(a.id)) list.push(a.id);
    });
    localStorage.setItem(LS_DISMISSED, JSON.stringify(list.slice(-50)));
    _renderBadge();
  }

  // ── Auto check setelah transaksi dicatat ──────────────────
  function checkAfterTransaction(category) {
    const alerts = checkAll();
    // Hanya tampilkan alert yang relevan dengan kategori baru dicatat
    const relevant = alerts.filter(
      (a) =>
        a.category === category ||
        a.type === "low_balance" ||
        a.type === "deficit",
    );
    if (relevant.length === 0) return;

    // Tampilkan hanya yang priority high/medium
    const urgent = relevant.filter((a) => a.priority !== "low");
    urgent.slice(0, 2).forEach((alert) => {
      setTimeout(() => {
        Chat.showToast(`${alert.icon} ${alert.title}`, 4000);
      }, 800);
    });

    _renderBadge();
  }

  // ── Badge counter di header ───────────────────────────────
  function _renderBadge() {
    const badge = document.getElementById("alert-badge");
    if (!badge) return;
    const count = checkAll().length;
    if (count > 0) {
      badge.textContent = count > 9 ? "9+" : count;
      badge.style.display = "flex";
    } else {
      badge.style.display = "none";
    }
  }

  // ── Modal ─────────────────────────────────────────────────
  function openModal() {
    _renderModal();
    document.getElementById("alert-modal").classList.add("open");
  }

  function closeModal() {
    document.getElementById("alert-modal").classList.remove("open");
  }

  function _renderModal() {
    const alerts = checkAll();
    const el = document.getElementById("alert-body");

    if (alerts.length === 0) {
      el.innerHTML = `
        <div style="text-align:center;padding:30px;color:var(--muted2)">
          <div style="font-size:40px;margin-bottom:8px">✅</div>
          <div style="font-size:14px;font-weight:500;color:var(--text)">Semua aman!</div>
          <div style="font-size:12px;margin-top:4px">Tidak ada spending alert saat ini</div>
        </div>`;
      return;
    }

    const PRIORITY_BG = {
      high: "rgba(248,113,113,0.08)",
      medium: "rgba(251,191,36,0.08)",
      low: "rgba(96,165,250,0.08)",
    };
    const PRIORITY_BORDER = {
      high: "rgba(248,113,113,0.4)",
      medium: "rgba(251,191,36,0.4)",
      low: "rgba(96,165,250,0.4)",
    };

    el.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
        <button onclick="SpendingAlert.dismissAll();SpendingAlert.closeModal()"
          style="font-size:12px;color:var(--muted2);background:transparent;border:none;cursor:pointer;padding:4px 8px;border-radius:6px;border:1px solid var(--border2)">
          Hapus semua
        </button>
      </div>
      ${alerts
        .map(
          (a) => `
        <div class="alert-card" style="background:${PRIORITY_BG[a.priority]};border-color:${PRIORITY_BORDER[a.priority]}">
          <div class="alert-card-header">
            <span class="alert-icon">${a.icon}</span>
            <div class="alert-content">
              <div class="alert-title">${a.title}</div>
              <div class="alert-message">${a.message}</div>
            </div>
            <button class="alert-dismiss" onclick="SpendingAlert.dismiss('${a.id}');SpendingAlert.openModal()" title="Hapus">✕</button>
          </div>
        </div>`,
        )
        .join("")}`;
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    _renderBadge();
  }

  return {
    checkAll,
    checkAfterTransaction,
    dismiss,
    dismissAll,
    openModal,
    closeModal,
    init,
    _renderBadge,
  };
})();
