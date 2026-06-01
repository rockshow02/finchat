// ============================================================
//  FinChat — Achievement System
//  Badge & milestone tracking — 0 token, murni lokal
// ============================================================

const Achievements = (() => {
  const LS = "finchat_achievements";

  // ── Definisi semua achievement ─────────────────────────────
  const ACHIEVEMENTS = [
    // Konsistensi
    {
      id: "streak_3",
      icon: "🔥",
      title: "3 Hari Berturut",
      desc: "Catat keuangan 3 hari berturut-turut",
      category: "Konsistensi",
      check: (data) => data.streak >= 3,
    },
    {
      id: "streak_7",
      icon: "⚡",
      title: "7 Hari Konsisten",
      desc: "Catat keuangan 7 hari berturut-turut",
      category: "Konsistensi",
      check: (data) => data.streak >= 7,
    },
    {
      id: "streak_30",
      icon: "🏆",
      title: "30 Hari Konsisten",
      desc: "Catat keuangan 30 hari berturut-turut — luar biasa!",
      category: "Konsistensi",
      check: (data) => data.streak >= 30,
    },
    {
      id: "streak_100",
      icon: "💎",
      title: "100 Hari Legenda",
      desc: "Catat keuangan 100 hari berturut-turut",
      category: "Konsistensi",
      check: (data) => data.streak >= 100,
    },

    // Pencatatan
    {
      id: "first_tx",
      icon: "🌱",
      title: "Langkah Pertama",
      desc: "Catat transaksi pertamamu",
      category: "Pencatatan",
      check: (data) => data.txCount >= 1,
    },
    {
      id: "tx_10",
      icon: "📝",
      title: "Rajin Mencatat",
      desc: "Catat 10 transaksi",
      category: "Pencatatan",
      check: (data) => data.txCount >= 10,
    },
    {
      id: "tx_50",
      icon: "📚",
      title: "Master Pencatat",
      desc: "Catat 50 transaksi",
      category: "Pencatatan",
      check: (data) => data.txCount >= 50,
    },
    {
      id: "tx_100",
      icon: "🎯",
      title: "Pencatat Sejati",
      desc: "Catat 100 transaksi",
      category: "Pencatatan",
      check: (data) => data.txCount >= 100,
    },

    // Keuangan
    {
      id: "save_1jt",
      icon: "💰",
      title: "Hemat 1 Juta Pertama",
      desc: "Saldo mencapai Rp 1.000.000 untuk pertama kali",
      category: "Keuangan",
      check: (data) => data.balance >= 1_000_000,
    },
    {
      id: "save_5jt",
      icon: "💵",
      title: "Jutawan Kecil",
      desc: "Saldo mencapai Rp 5.000.000",
      category: "Keuangan",
      check: (data) => data.balance >= 5_000_000,
    },
    {
      id: "save_10jt",
      icon: "🤑",
      title: "Double Digit!",
      desc: "Saldo mencapai Rp 10.000.000",
      category: "Keuangan",
      check: (data) => data.balance >= 10_000_000,
    },
    {
      id: "savings_rate_20",
      icon: "📈",
      title: "Penabung Cerdas",
      desc: "Savings rate 20% atau lebih dalam satu bulan",
      category: "Keuangan",
      check: (data) => data.savingsRate >= 20,
    },

    // Budget
    {
      id: "budget_set",
      icon: "🎯",
      title: "Perencana Keuangan",
      desc: "Set budget untuk pertama kali",
      category: "Budget",
      check: (data) => data.budgetCount >= 1,
    },
    {
      id: "budget_master",
      icon: "👑",
      title: "Budget Master",
      desc: "Semua kategori dalam budget selama seminggu penuh",
      category: "Budget",
      check: (data) => data.allBudgetOk && data.budgetCount >= 2,
    },
    {
      id: "no_overspend",
      icon: "🛡️",
      title: "Disiplin Besi",
      desc: "Tidak ada kategori yang over budget bulan ini",
      category: "Budget",
      check: (data) => data.allBudgetOk && data.budgetCount >= 1,
    },

    // Special
    {
      id: "first_export",
      icon: "📄",
      title: "Laporan Pertama",
      desc: "Export laporan untuk pertama kali",
      category: "Special",
      check: (data) => data.hasExported,
    },
    {
      id: "night_owl",
      icon: "🦉",
      title: "Night Owl",
      desc: "Catat transaksi setelah jam 11 malam",
      category: "Special",
      check: (data) => data.isLateNight,
    },
    {
      id: "early_bird",
      icon: "🐦",
      title: "Early Bird",
      desc: "Catat transaksi sebelum jam 7 pagi",
      category: "Special",
      check: (data) => data.isEarlyMorning,
    },
  ];

  // ── Load/save unlocked achievements ───────────────────────
  function _load() {
    try {
      return JSON.parse(localStorage.getItem(LS) || "{}");
    } catch {
      return {};
    }
  }

  function _save(data) {
    localStorage.setItem(LS, JSON.stringify(data));
  }

  // ── Build check data dari state ───────────────────────────
  function _buildData() {
    const { income, expense, transactions } = App.getFinancial();
    const streakData = HealthScore.getStreakData();
    const budgets = Budget.getAll();
    const budgetStatus = Budget.getStatus();
    const now = new Date();
    const hour = now.getHours();

    // Savings rate bulan ini
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthTx = transactions.filter((t) => new Date(t.date) >= monthStart);
    const mIncome = monthTx
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + t.amount, 0);
    const mExpense = monthTx
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + t.amount, 0);
    const savingsRate =
      mIncome > 0 ? Math.round(((mIncome - mExpense) / mIncome) * 100) : 0;

    return {
      streak: streakData.streak || 0,
      txCount: transactions.length,
      balance: income - expense,
      savingsRate,
      budgetCount: Object.keys(budgets).length,
      allBudgetOk:
        budgetStatus.length > 0 && budgetStatus.every((s) => s.status === "ok"),
      hasExported: !!localStorage.getItem("finchat_exported"),
      isLateNight: hour >= 23 || hour < 1,
      isEarlyMorning: hour >= 5 && hour < 7,
    };
  }

  // ── Check & unlock achievements ───────────────────────────
  function check() {
    const unlocked = _load();
    const data = _buildData();
    const newlyUnlocked = [];

    ACHIEVEMENTS.forEach((a) => {
      if (!unlocked[a.id] && a.check(data)) {
        unlocked[a.id] = {
          unlockedAt: new Date().toISOString(),
          shown: false,
        };
        newlyUnlocked.push(a);
      }
    });

    if (newlyUnlocked.length > 0) {
      _save(unlocked);
      // Tampilkan notif dengan delay
      newlyUnlocked.forEach((a, i) => {
        setTimeout(() => _showUnlock(a), 1200 + i * 1800);
      });
    }

    return newlyUnlocked;
  }

  // ── Notif unlock ───────────────────────────────────────────
  function _showUnlock(achievement) {
    // Custom toast khusus achievement
    const toast = document.createElement("div");
    toast.className = "achievement-toast";
    toast.innerHTML = `
      <div class="ach-toast-icon">${achievement.icon}</div>
      <div class="ach-toast-text">
        <div class="ach-toast-label">Achievement Unlocked!</div>
        <div class="ach-toast-title">${achievement.title}</div>
      </div>
    `;
    document.body.appendChild(toast);
    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add("show"));
    });
    // Remove after 3.5s
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  }

  // ── Get all dengan status unlocked ────────────────────────
  function getAll() {
    const unlocked = _load();
    return ACHIEVEMENTS.map((a) => ({
      ...a,
      unlocked: !!unlocked[a.id],
      unlockedAt: unlocked[a.id]?.unlockedAt || null,
    }));
  }

  function getUnlockedCount() {
    return Object.keys(_load()).length;
  }

  // ── Modal ─────────────────────────────────────────────────
  function openModal() {
    _renderModal();
    document.getElementById("achievement-modal").classList.add("open");
  }

  function closeModal() {
    document.getElementById("achievement-modal").classList.remove("open");
  }

  function _renderModal() {
    const all = getAll();
    const categories = [...new Set(ACHIEVEMENTS.map((a) => a.category))];
    const unlockedN = getUnlockedCount();
    const total = ACHIEVEMENTS.length;
    const pct = Math.round((unlockedN / total) * 100);

    document.getElementById("ach-body").innerHTML = `
      <!-- Progress -->
      <div class="ach-progress-wrap">
        <div class="ach-progress-text">
          <span>${unlockedN} / ${total} achievement</span>
          <span style="color:var(--accent)">${pct}%</span>
        </div>
        <div class="ach-progress-bar-wrap">
          <div class="ach-progress-bar" style="width:${pct}%"></div>
        </div>
      </div>

      <!-- Per kategori -->
      ${categories
        .map((cat) => {
          const catItems = all.filter((a) => a.category === cat);
          return `
          <div class="ach-category">
            <div class="ach-cat-label">${cat}</div>
            <div class="ach-grid">
              ${catItems
                .map(
                  (a) => `
                <div class="ach-card ${a.unlocked ? "unlocked" : "locked"}">
                  <div class="ach-card-icon">${a.unlocked ? a.icon : "🔒"}</div>
                  <div class="ach-card-title">${a.title}</div>
                  <div class="ach-card-desc">${a.unlocked ? a.desc : "???"}</div>
                  ${
                    a.unlocked && a.unlockedAt
                      ? `
                    <div class="ach-card-date">
                      ${new Date(a.unlockedAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}
                    </div>`
                      : ""
                  }
                </div>`,
                )
                .join("")}
            </div>
          </div>`;
        })
        .join("")}`;
  }

  // Mark export
  function markExported() {
    localStorage.setItem("finchat_exported", "1");
    check();
  }

  return {
    check,
    getAll,
    getUnlockedCount,
    openModal,
    closeModal,
    markExported,
  };
})();
