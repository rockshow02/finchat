// ============================================================
//  FinChat — Core Features
//  1. Konfirmasi sebelum catat
//  2. Edit & hapus transaksi bebas
//  3. Budget per kategori
//  4. Onboarding screen
// ============================================================

/* ════════════════════════════════════════════════════════════
   1. KONFIRMASI SEBELUM CATAT
   Intercept hasil parser sebelum disimpan
   ════════════════════════════════════════════════════════════ */
const Confirm = (() => {
  let _pending = null; // { intent, data }

  function show(parsed) {
    _pending = parsed;
    const { intent, data } = parsed;
    const fmt = Chat.fmt;

    const isIncome = intent === "income";
    const icon = isIncome ? "📥" : "📤";
    const typeText = isIncome ? "Pemasukan" : "Pengeluaran";
    const color = isIncome ? "var(--green)" : "var(--red)";

    document.getElementById("confirm-tx-icon").textContent = icon;
    document.getElementById("confirm-tx-type").textContent = typeText;
    document.getElementById("confirm-tx-type").style.color = color;
    document.getElementById("confirm-tx-label").textContent = data.label;
    document.getElementById("confirm-tx-amount").textContent = fmt(data.amount);
    document.getElementById("confirm-tx-cat").textContent = data.category;
    document.getElementById("confirm-tx-date").textContent = data.date;

    document.getElementById("confirm-tx-modal").classList.add("open");
  }

  function approve() {
    document.getElementById("confirm-tx-modal").classList.remove("open");
    if (!_pending) return;
    const pending = _pending;
    _pending = null;
    API.executeLocal(pending);
  }

  function reject() {
    document.getElementById("confirm-tx-modal").classList.remove("open");
    _pending = null;
    const reply =
      "↩️ Oke, transaksi dibatalkan. Ketik ulang kalau mau catat yang lain ya!";
    Chat.appendMessage("bot", reply);
    App.pushMessage({ role: "assistant", content: reply });
    App.save();
  }

  function edit() {
    document.getElementById("confirm-tx-modal").classList.remove("open");
    if (!_pending) return;
    const pending = _pending;
    _pending = null;
    EditTx.openNew(pending.data, pending.intent);
  }

  return { show, approve, reject, edit };
})();

/* ════════════════════════════════════════════════════════════
   2. EDIT & HAPUS TRANSAKSI BEBAS
   ════════════════════════════════════════════════════════════ */
const EditTx = (() => {
  let _editIdx = null; // index transaksi yang diedit, null = transaksi baru

  function open(idx) {
    const { transactions } = App.getFinancial();
    const tx = transactions[idx];
    if (!tx) return;
    _editIdx = idx;
    _populate(tx, tx.type);
    document.getElementById("edit-tx-modal").classList.add("open");
    document.getElementById("edit-tx-title").textContent = "✏️ Edit Transaksi";
    document.getElementById("edit-tx-delete").style.display = "block";
  }

  function openNew(data, intent) {
    _editIdx = null;
    _populate(data, intent);
    document.getElementById("edit-tx-modal").classList.add("open");
    document.getElementById("edit-tx-title").textContent =
      "✏️ Koreksi Transaksi";
    document.getElementById("edit-tx-delete").style.display = "none";
  }

  function _populate(data, type) {
    document.getElementById("edit-tx-label").value = data.label || "";
    document.getElementById("edit-tx-amount").value = data.amount || "";
    document.getElementById("edit-tx-date").value = _toInputDate(data.date);
    document.getElementById("edit-tx-type").value = type || "expense";
    _populateCategories();
    document.getElementById("edit-tx-cat").value = data.category || "Lainnya";
  }

  function _toInputDate(dateStr) {
    if (!dateStr) return new Date().toISOString().split("T")[0];
    // Coba parse dari format id-ID atau ISO
    const d = new Date(dateStr);
    if (!isNaN(d)) return d.toISOString().split("T")[0];
    return new Date().toISOString().split("T")[0];
  }

  function _populateCategories() {
    const cats = Features.getCategories();
    const sel = document.getElementById("edit-tx-cat");
    sel.innerHTML = cats
      .map((c) => `<option value="${c}">${c}</option>`)
      .join("");
  }

  function save() {
    const label = document.getElementById("edit-tx-label").value.trim();
    const amount = parseFloat(document.getElementById("edit-tx-amount").value);
    const type = document.getElementById("edit-tx-type").value;
    const cat = document.getElementById("edit-tx-cat").value;
    const date = document.getElementById("edit-tx-date").value;

    if (!label) {
      Chat.showToast("⚠️ Keterangan tidak boleh kosong");
      return;
    }
    if (!amount || amount <= 0) {
      Chat.showToast("⚠️ Jumlah tidak valid");
      return;
    }

    const fin = App.getFinancial();
    const dateStr = date
      ? new Date(date).toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : new Date().toLocaleDateString("id-ID");

    if (_editIdx !== null) {
      // Edit existing
      const old = fin.transactions[_editIdx];
      // Rollback old
      if (old.type === "income") fin.income -= old.amount;
      else fin.expense -= old.amount;
      // Apply new
      fin.transactions[_editIdx] = {
        label,
        amount,
        type,
        category: cat,
        date: dateStr,
      };
      if (type === "income") fin.income += amount;
      else fin.expense += amount;
    } else {
      // New transaction (dari konfirmasi edit)
      fin.transactions.push({
        label,
        amount,
        type,
        category: cat,
        date: dateStr,
      });
      if (type === "income") fin.income += amount;
      else fin.expense += amount;
    }

    App.applyFinData({
      income_total: fin.income,
      expense_total: fin.expense,
      transactions: fin.transactions,
    });
    Chat.updateSummary(fin.income, fin.expense);
    App.save();
    close();

    const action = _editIdx !== null ? "diperbarui" : "dicatat";
    Chat.appendMessage(
      "bot",
      `✅ Transaksi ${action}!\n**${label}** — ${Chat.fmt(amount)}\n` +
        `🏷️ ${cat} • ${type === "income" ? "📥" : "📤"} ${type === "income" ? "Pemasukan" : "Pengeluaran"} • 📅 ${dateStr}`,
    );
  }

  function remove() {
    if (_editIdx === null) return;
    const fin = App.getFinancial();
    const tx = fin.transactions[_editIdx];
    if (!tx) return;

    if (tx.type === "income") fin.income -= tx.amount;
    else fin.expense -= tx.amount;
    fin.transactions.splice(_editIdx, 1);

    App.applyFinData({
      income_total: fin.income,
      expense_total: fin.expense,
      transactions: fin.transactions,
    });
    Chat.updateSummary(fin.income, fin.expense);
    App.save();
    close();
    Chat.appendMessage(
      "bot",
      `🗑️ Transaksi **${tx.label}** (${Chat.fmt(tx.amount)}) berhasil dihapus.`,
    );
  }

  function close() {
    document.getElementById("edit-tx-modal").classList.remove("open");
    _editIdx = null;
  }

  return { open, openNew, save, remove, close };
})();

/* ════════════════════════════════════════════════════════════
   3. BUDGET PER KATEGORI
   ════════════════════════════════════════════════════════════ */
const Budget = (() => {
  const LS = "finchat_budgets";

  function load() {
    try {
      return JSON.parse(localStorage.getItem(LS)) || {};
    } catch {
      return {};
    }
  }

  function save(budgets) {
    localStorage.setItem(LS, JSON.stringify(budgets));
  }

  function set(category, amount) {
    const b = load();
    b[category] = amount;
    save(b);
  }

  function remove(category) {
    const b = load();
    delete b[category];
    save(b);
  }

  function getAll() {
    return load();
  }

  // Parse tanggal dari berbagai format termasuk id-ID
  function _parseDate(str) {
    if (!str || str === "hari ini") return new Date();
    // Coba ISO dulu
    let d = new Date(str);
    if (!isNaN(d)) return d;
    // Format id-ID: "28 Mei 2025"
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
    const m = str.toLowerCase().match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (m) {
      const bulan = BULAN[m[2]];
      if (bulan !== undefined)
        return new Date(parseInt(m[3]), bulan, parseInt(m[1]));
    }
    return new Date(); // fallback hari ini
  }

  // Hitung pemakaian vs budget
  function getStatus() {
    const budgets = load();
    const { transactions } = App.getFinancial();
    const now = new Date();
    const usage = {};

    transactions
      .filter((t) => {
        if (t.type !== "expense") return false;
        const d = _parseDate(t.date);
        return (
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        );
      })
      .forEach((t) => {
        const c = t.category || "Lainnya";
        usage[c] = (usage[c] || 0) + (t.amount || 0);
      });

    return Object.entries(budgets).map(([cat, limit]) => {
      const spent = usage[cat] || 0;
      const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
      const status = pct >= 100 ? "over" : pct >= 80 ? "warning" : "ok";
      return { cat, limit, spent, pct, status };
    });
  }

  // Check & alert — hanya untuk kategori yang baru dicatat
  function checkAlert(newCategory) {
    const status = getStatus();
    // Filter: hanya alert kategori yang relevan dengan transaksi baru
    // Jika newCategory diberikan, hanya cek kategori itu
    // Jika tidak, cek semua (untuk backward compat)
    const toCheck = newCategory
      ? status.filter((s) => s.cat === newCategory)
      : status.filter((s) => s.status !== "ok");

    const alerts = toCheck.filter((s) => s.status !== "ok");
    if (alerts.length === 0) return;

    alerts.forEach((s) => {
      const isOver = s.status === "over";
      const icon = isOver ? "🚨" : "⚠️";

      Chat.showToast(
        `${icon} Budget ${s.cat}: ${s.pct}% terpakai`,
        isOver ? 4000 : 3000,
      );

      const msg = isOver
        ? `🚨 **Budget ${s.cat} habis!**\nTerpakai ${Chat.fmt(s.spent)} dari limit ${Chat.fmt(s.limit)} (${s.pct}%)\n\nPertimbangkan untuk review pengeluaran kamu.`
        : `⚠️ **Budget ${s.cat} hampir habis!**\nTerpakai ${Chat.fmt(s.spent)} dari limit ${Chat.fmt(s.limit)} (${s.pct}%)\n\nSisa: ${Chat.fmt(s.limit - s.spent)}`;

      setTimeout(() => Chat.appendMessage("bot", msg), 600);
    });
  }

  // Render budget modal
  function openModal() {
    _render();
    document.getElementById("budget-modal").classList.add("open");
  }

  function closeModal() {
    document.getElementById("budget-modal").classList.remove("open");
  }

  function _render() {
    const status = getStatus();
    const budgets = load();
    const cats = Features.getCategories().filter(
      (c) =>
        !["Gaji", "Freelance", "Investasi", "Pemasukan Lain", "Bonus"].includes(
          c,
        ),
    );
    const el = document.getElementById("budget-list");

    el.innerHTML = cats
      .map((cat) => {
        const b = budgets[cat] || 0;
        const s = status.find((x) => x.cat === cat);
        const spent = s ? s.spent : 0;
        const pct = b > 0 ? Math.min(Math.round((spent / b) * 100), 100) : 0;
        const color =
          s?.status === "over"
            ? "var(--red)"
            : s?.status === "warning"
              ? "var(--amber)"
              : "var(--green)";

        return `
      <div class="budget-item">
        <div class="budget-header">
          <span class="budget-cat">${cat}</span>
          <div class="budget-input-wrap">
            <input type="number" class="budget-input" placeholder="0"
              value="${b || ""}"
              onchange="Budget.set('${cat}', parseFloat(this.value)||0); Budget._rerender()"
              min="0" step="10000">
            ${b > 0 ? `<button class="budget-del" onclick="Budget.remove('${cat}');Budget._rerender()">✕</button>` : ""}
          </div>
        </div>
        ${
          b > 0
            ? `
        <div class="budget-bar-wrap">
          <div class="budget-bar" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="budget-meta">
          <span>${Chat.fmt(spent)} dipakai</span>
          <span style="color:${color}">${pct}%</span>
          <span>${Chat.fmt(b)} limit</span>
        </div>`
            : ""
        }
      </div>`;
      })
      .join("");
  }

  function _rerender() {
    _render();
  }

  return {
    set,
    remove,
    getAll,
    getStatus,
    checkAlert,
    openModal,
    closeModal,
    _rerender,
  };
})();

/* ════════════════════════════════════════════════════════════
   4. ONBOARDING SCREEN — Interaktif
   ════════════════════════════════════════════════════════════ */
const Onboarding = (() => {
  const LS = "finchat_onboarded";
  let _step = 0;

  const STEPS = [
    {
      icon: "👋",
      title: "Halo! Aku FinChat",
      desc: "Asisten keuangan pribadimu. Catat pemasukan & pengeluaran cukup dengan ngobrol natural — tidak perlu form yang ribet.",
      prompts: null,
      tip: null,
    },
    {
      icon: "💸",
      title: "Catat Pengeluaran",
      desc: "Ketik seperti biasa ngobrol. FinChat langsung ngerti dan catat otomatis.",
      prompts: [
        { label: "🍜 Makan siang 45rb", text: "Makan siang 45rb" },
        { label: "⛽ Isi bensin 100rb", text: "Isi bensin 100rb" },
        { label: "☕ Kopi 35rb", text: "Kopi 35rb" },
        { label: "🛒 Belanja 250rb", text: "Belanja supermarket 250rb" },
      ],
      tip: "Klik salah satu untuk langsung mencoba!",
    },
    {
      icon: "💰",
      title: "Catat Pemasukan",
      desc: "Sama mudahnya. FinChat otomatis kenali ini sebagai pemasukan.",
      prompts: [
        { label: "💵 Gaji masuk 8 juta", text: "Gaji masuk 8 juta" },
        { label: "🎁 Dapat bonus 500rb", text: "Dapat bonus 500rb" },
        { label: "💼 Freelance project 2jt", text: "Freelance project 2jt" },
        { label: "📦 Fee desain 750rb", text: "Fee desain 750rb" },
      ],
      tip: "Klik salah satu untuk langsung mencoba!",
    },
    {
      icon: "📊",
      title: "Laporan & Grafik",
      desc: "Minta laporan atau grafik kapan saja — langsung tampil tanpa loading.",
      prompts: [
        { label: "📋 Laporan keuangan", text: "laporan" },
        { label: "📊 Grafik pengeluaran", text: "grafik" },
        { label: "💰 Cek saldo", text: "saldo" },
      ],
      tip: null,
    },
    {
      icon: "🤖",
      title: "Tanya AI untuk Analisis",
      desc: "Untuk pertanyaan kompleks, AI siap membantu. Transaksi biasa dicatat instan tanpa AI.",
      prompts: [
        { label: "💡 Saran hemat", text: "Kasih saran hemat pengeluaran saya" },
        {
          label: "📈 Analisis keuangan",
          text: "Analisis kondisi keuangan saya",
        },
        { label: "❓ Aman bulan ini?", text: "Apakah saya aman bulan ini?" },
      ],
      tip: "⚡ Butuh koneksi internet & API key",
    },
  ];

  function shouldShow() {
    return !localStorage.getItem(LS);
  }

  function show() {
    if (!shouldShow()) return;
    _step = 0;
    _render();
    document.getElementById("onboarding-modal").classList.add("open");
  }

  function _render() {
    const s = STEPS[_step];
    const isLast = _step === STEPS.length - 1;

    document.getElementById("ob-icon").textContent = s.icon;
    document.getElementById("ob-title").textContent = s.title;
    document.getElementById("ob-desc").textContent = s.desc;
    document.getElementById("ob-step").textContent =
      `${_step + 1} / ${STEPS.length}`;
    document.getElementById("ob-next").textContent = isLast
      ? "Mulai! 🚀"
      : "Lanjut →";

    // Dots
    document.getElementById("ob-dots").innerHTML = STEPS.map(
      (_, i) => `<span class="ob-dot ${i === _step ? "active" : ""}"></span>`,
    ).join("");

    // Prompt chips
    const promptWrap = document.getElementById("ob-prompts");
    const tipEl = document.getElementById("ob-tip");

    if (s.prompts) {
      promptWrap.style.display = "flex";
      promptWrap.innerHTML = s.prompts
        .map(
          (p) =>
            `<button class="ob-prompt-btn" onclick="Onboarding.tryPrompt('${p.text.replace(/'/g, "\\'")}')">${p.label}</button>`,
        )
        .join("");
    } else {
      promptWrap.style.display = "none";
      promptWrap.innerHTML = "";
    }

    if (s.tip) {
      tipEl.style.display = "block";
      tipEl.textContent = s.tip;
    } else {
      tipEl.style.display = "none";
    }
  }

  function tryPrompt(text) {
    // Tutup onboarding, isi input, langsung kirim
    finish();
    setTimeout(() => {
      const input = document.getElementById("input");
      if (input) {
        input.value = text;
        Chat.autoResize(input);
        // Trigger send
        if (typeof handleSend === "function") handleSend();
      }
    }, 300);
  }

  function next() {
    if (_step < STEPS.length - 1) {
      _step++;
      _render();
    } else {
      finish();
    }
  }

  function finish() {
    localStorage.setItem(LS, "1");
    document.getElementById("onboarding-modal").classList.remove("open");
    Chat.showToast("🚀 Selamat menggunakan FinChat!");
  }

  function reset() {
    localStorage.removeItem(LS);
  }

  return { show, next, finish, tryPrompt, shouldShow, reset };
})();
