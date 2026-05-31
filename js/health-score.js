// ============================================================
//  FinChat — Financial Health Score
//  Skor 0-100, murni lokal — 0 token
//  4 komponen: Cashflow, Savings Rate, Budget, Consistency
// ============================================================

const HealthScore = (() => {
  const LS_STREAK = "finchat_streak";

  // ── Hitung skor ────────────────────────────────────────────
  function calculate() {
    const { income, expense, transactions } = App.getFinancial();
    const budgets = Budget.getAll();
    const streak = getStreak();

    const scores = {
      cashflow: _cashflowScore(income, expense),
      savings: _savingsScore(income, expense),
      budget: _budgetScore(budgets, transactions),
      consistency: _consistencyScore(streak, transactions),
    };

    const total = Math.round(
      scores.cashflow + scores.savings + scores.budget + scores.consistency,
    );

    return {
      total: Math.min(100, Math.max(0, total)),
      scores,
      grade: _grade(total),
      advice: _advice(scores),
    };
  }

  // ── Komponen 1: Cashflow (30 poin) ─────────────────────────
  // Income > expense = sehat. Makin besar selisih makin bagus.
  function _cashflowScore(income, expense) {
    if (income === 0) return 0;
    const ratio = (income - expense) / income; // -∞ to 1
    if (ratio >= 0.5) return 30; // hemat >50% income
    if (ratio >= 0.3) return 25;
    if (ratio >= 0.1) return 20;
    if (ratio >= 0) return 12;
    if (ratio >= -0.2) return 6;
    return 0; // defisit >20%
  }

  // ── Komponen 2: Savings Rate (25 poin) ─────────────────────
  // Berapa % dari income yang tersisa (tidak dipakai)
  function _savingsScore(income, expense) {
    if (income === 0) return 0;
    const savingsRate = ((income - expense) / income) * 100;
    if (savingsRate >= 30) return 25;
    if (savingsRate >= 20) return 20;
    if (savingsRate >= 10) return 15;
    if (savingsRate >= 0) return 8;
    return 0;
  }

  // ── Komponen 3: Budget Compliance (25 poin) ─────────────────
  // Berapa banyak kategori yang patuh budget
  function _budgetScore(budgets, transactions) {
    const budgetKeys = Object.keys(budgets);
    if (budgetKeys.length === 0) return 10; // belum set budget = netral

    const statuses = Budget.getStatus();
    if (statuses.length === 0) return 10;

    const compliant = statuses.filter((s) => s.status === "ok").length;
    const ratio = compliant / statuses.length;

    return Math.round(ratio * 25);
  }

  // ── Komponen 4: Consistency (20 poin) ──────────────────────
  // Seberapa rutin mencatat
  function _consistencyScore(streak, transactions) {
    if (transactions.length === 0) return 0;

    // Poin dari streak
    let streakPts = 0;
    if (streak >= 30) streakPts = 12;
    else if (streak >= 14) streakPts = 9;
    else if (streak >= 7) streakPts = 6;
    else if (streak >= 3) streakPts = 4;
    else if (streak >= 1) streakPts = 2;

    // Poin dari total transaksi
    let txPts = 0;
    if (transactions.length >= 50) txPts = 8;
    else if (transactions.length >= 20) txPts = 6;
    else if (transactions.length >= 10) txPts = 4;
    else if (transactions.length >= 3) txPts = 2;

    return Math.min(20, streakPts + txPts);
  }

  // ── Grade & Label ──────────────────────────────────────────
  function _grade(score) {
    if (score >= 85)
      return {
        label: "Excellent",
        emoji: "🏆",
        color: "#34d399",
        desc: "Keuanganmu sangat sehat!",
      };
    if (score >= 70)
      return {
        label: "Good",
        emoji: "😊",
        color: "#60a5fa",
        desc: "Keuanganmu cukup baik.",
      };
    if (score >= 55)
      return {
        label: "Fair",
        emoji: "😐",
        color: "#fbbf24",
        desc: "Ada ruang untuk diperbaiki.",
      };
    if (score >= 40)
      return {
        label: "Poor",
        emoji: "😟",
        color: "#f97316",
        desc: "Perlu perhatian lebih.",
      };
    return {
      label: "Critical",
      emoji: "🚨",
      color: "#f87171",
      desc: "Keuanganmu butuh perbaikan segera.",
    };
  }

  // ── Advice per komponen ────────────────────────────────────
  function _advice(scores) {
    const tips = [];
    if (scores.cashflow < 15)
      tips.push(
        "💡 Pengeluaranmu melebihi pemasukan — coba kurangi 1 kategori terbesar",
      );
    if (scores.savings < 10)
      tips.push("💡 Coba sisihkan minimal 10% dari income untuk tabungan");
    if (scores.budget < 10)
      tips.push(
        "💡 Set budget per kategori untuk kontrol pengeluaran lebih baik",
      );
    if (scores.consistency < 8)
      tips.push(
        "💡 Catat lebih rutin — minimal 1x sehari untuk skor konsistensi naik",
      );
    if (tips.length === 0) tips.push("✨ Pertahankan kebiasaan baikmu!");
    return tips;
  }

  // ── Streak System ──────────────────────────────────────────
  function getStreak() {
    try {
      const data = JSON.parse(localStorage.getItem(LS_STREAK) || "{}");
      return data.streak || 0;
    } catch {
      return 0;
    }
  }

  function updateStreak() {
    try {
      const today = new Date().toDateString();
      const data = JSON.parse(localStorage.getItem(LS_STREAK) || "{}");

      if (data.lastDate === today) return; // sudah catat hari ini

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const isConsecutive = data.lastDate === yesterday.toDateString();

      const newStreak = isConsecutive ? (data.streak || 0) + 1 : 1;

      localStorage.setItem(
        LS_STREAK,
        JSON.stringify({
          streak: newStreak,
          lastDate: today,
          best: Math.max(newStreak, data.best || 0),
        }),
      );

      // Toast kalau milestone
      if (newStreak === 3) Chat.showToast("🔥 3 hari berturut-turut mencatat!");
      if (newStreak === 7) Chat.showToast("🏆 7 hari streak! Luar biasa!");
      if (newStreak === 30)
        Chat.showToast("🎉 30 hari streak! Kamu luar biasa konsisten!");
    } catch (e) {
      console.warn("[Streak] update gagal", e);
    }
  }

  function getStreakData() {
    try {
      return JSON.parse(localStorage.getItem(LS_STREAK) || "{}");
    } catch {
      return {};
    }
  }

  // ── Render Modal ───────────────────────────────────────────
  function openModal() {
    _renderModal();
    document.getElementById("health-modal").classList.add("open");
  }

  function closeModal() {
    document.getElementById("health-modal").classList.remove("open");
  }

  function _renderModal() {
    const result = calculate();
    const streak = getStreakData();
    const { total, scores, grade, advice } = result;

    // Gauge color
    const gaugeColor = grade.color;

    document.getElementById("hs-modal-content").innerHTML = `
      <!-- Score Circle -->
      <div class="hs-circle-wrap">
        <svg class="hs-gauge" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border2)" stroke-width="10"/>
          <circle cx="60" cy="60" r="50" fill="none"
            stroke="${gaugeColor}" stroke-width="10"
            stroke-dasharray="${Math.round(total * 3.14)} 314"
            stroke-dashoffset="0"
            stroke-linecap="round"
            transform="rotate(-90 60 60)"
            style="transition: stroke-dasharray 1s ease"/>
          <text x="60" y="55" text-anchor="middle" font-size="26" font-weight="700"
            font-family="JetBrains Mono" fill="${gaugeColor}">${total}</text>
          <text x="60" y="72" text-anchor="middle" font-size="10"
            font-family="Sora" fill="var(--muted2)">${grade.label}</text>
        </svg>
        <div class="hs-grade-emoji">${grade.emoji}</div>
      </div>
      <div class="hs-grade-desc">${grade.desc}</div>

      <!-- Komponen skor -->
      <div class="hs-breakdown">
        ${_componentRow("💸 Cashflow", scores.cashflow, 30, "Selisih income vs pengeluaran")}
        ${_componentRow("🏦 Savings Rate", scores.savings, 25, "Persentase income yang tersimpan")}
        ${_componentRow("🎯 Budget", scores.budget, 25, "Kepatuhan terhadap budget")}
        ${_componentRow("📅 Konsistensi", scores.consistency, 20, `Streak ${streak.streak || 0} hari • Best ${streak.best || 0} hari`)}
      </div>

      <!-- Tips -->
      <div class="hs-tips">
        ${advice.map((t) => `<div class="hs-tip">${t}</div>`).join("")}
      </div>

      <!-- Streak info -->
      <div class="hs-streak-bar">
        <span>🔥 Streak sekarang: <strong>${streak.streak || 0} hari</strong></span>
        <span>🏆 Terbaik: <strong>${streak.best || 0} hari</strong></span>
      </div>
    `;
  }

  function _componentRow(label, score, max, sub) {
    const pct = Math.round((score / max) * 100);
    const color = pct >= 70 ? "#34d399" : pct >= 40 ? "#fbbf24" : "#f87171";
    return `
      <div class="hs-comp-row">
        <div class="hs-comp-header">
          <span class="hs-comp-label">${label}</span>
          <span class="hs-comp-score" style="color:${color}">${score}/${max}</span>
        </div>
        <div class="hs-comp-bar-wrap">
          <div class="hs-comp-bar" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="hs-comp-sub">${sub}</div>
      </div>`;
  }

  // ── Update nav icon ────────────────────────────────────────
  function updateHeaderChip() {
    const el = document.getElementById("nav-health");
    if (!el) return;
    const { total, grade } = calculate();
    el.textContent = grade.emoji;
    el.title = `Health Score: ${total}/100 — ${grade.label}`;
  }

  return {
    calculate,
    openModal,
    closeModal,
    updateStreak,
    getStreak,
    getStreakData,
    updateHeaderChip,
  };
})();
