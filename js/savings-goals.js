// ============================================================
//  FinChat — Savings Goals
//  Target tabungan dengan progress & estimasi — 0 token
// ============================================================

const SavingsGoals = (() => {
  const LS = "finchat_goals";

  // ── CRUD ──────────────────────────────────────────────────
  function _load() {
    try {
      return JSON.parse(localStorage.getItem(LS) || "[]");
    } catch {
      return [];
    }
  }

  function _save(goals) {
    localStorage.setItem(LS, JSON.stringify(goals));
  }

  function add(name, target, deadline = null) {
    const goals = _load();
    goals.push({
      id: Date.now(),
      name,
      target: parseFloat(target),
      saved: 0,
      deadline,
      createdAt: new Date().toISOString(),
      deposits: [],
    });
    _save(goals);
  }

  function deposit(id, amount, note = "") {
    const goals = _load();
    const goal = goals.find((g) => g.id === id);
    if (!goal) return;
    goal.saved += parseFloat(amount);
    goal.deposits.push({
      amount: parseFloat(amount),
      note,
      date: new Date().toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
    });
    _save(goals);
    // Cek achievement
    if (goal.saved >= goal.target) _celebrateGoal(goal);
    _renderModal();
  }

  function remove(id) {
    const goals = _load().filter((g) => g.id !== id);
    _save(goals);
    _renderModal();
  }

  function getAll() {
    return _load();
  }

  // ── Estimasi tercapai ─────────────────────────────────────
  function _estimate(goal) {
    if (goal.deposits.length < 2) return null;
    const remaining = goal.target - goal.saved;
    if (remaining <= 0) return null;

    // Rata-rata setoran per bulan dari 3 setoran terakhir
    const recent = goal.deposits.slice(-3);
    const avgDepo = recent.reduce((s, d) => s + d.amount, 0) / recent.length;
    if (avgDepo <= 0) return null;

    const monthsNeeded = Math.ceil(remaining / avgDepo);
    const estDate = new Date();
    estDate.setMonth(estDate.getMonth() + monthsNeeded);

    return {
      months: monthsNeeded,
      date: estDate.toLocaleDateString("id-ID", {
        month: "long",
        year: "numeric",
      }),
      avgDepo,
    };
  }

  // ── Celebrate ─────────────────────────────────────────────
  function _celebrateGoal(goal) {
    Chat.showToast(`🎉 Target "${goal.name}" tercapai!`, 5000);
    Chat.appendMessage(
      "bot",
      `🎊 **Selamat! Target "${goal.name}" sudah tercapai!**\n` +
        `Kamu berhasil mengumpulkan ${Chat.fmt(goal.saved)} 🎉\n\n` +
        `Lanjutkan semangat menabungnya!`,
    );
  }

  // ── Parser chat — "nabung menikah 500rb" ──────────────────
  function parseFromChat(text) {
    const lower = text.toLowerCase();
    if (!/\b(nabung|tabung|simpan|setor)\b/.test(lower)) return null;

    const goals = _load();
    if (goals.length === 0) return null;

    // Cari goal yang namanya ada di teks
    const matched = goals.find((g) => lower.includes(g.name.toLowerCase()));
    if (!matched) return null;

    // Ekstrak amount — support "3juta", "3 juta", "500rb", "500.000"
    const s = lower
      .replace(/\./g, "") // hapus titik ribuan
      .replace(/,/g, "."); // koma jadi desimal

    const patterns = [
      /(\d+\.?\d*)\s*(miliar|b)/,
      /(\d+\.?\d*)\s*(juta|jt)/,
      /(\d+\.?\d*)\s*(ribu|rb|k)/,
      /(\d{4,})/,
      /(\d+)/,
    ];
    const mults = {
      miliar: 1e9,
      b: 1e9,
      juta: 1e6,
      jt: 1e6,
      ribu: 1e3,
      rb: 1e3,
      k: 1e3,
    };

    let amount = null;
    for (const p of patterns) {
      const m = s.match(p);
      if (!m) continue;
      const num = parseFloat(m[1]);
      const mul = mults[m[2]] || 1;
      const val = num * mul;
      if (val >= 1000) {
        amount = val;
        break;
      }
    }

    if (!amount) return null;
    return { goalId: matched.id, goalName: matched.name, amount };
  }

  // ── Modal ─────────────────────────────────────────────────
  function openModal() {
    document.getElementById("goals-modal").classList.add("open");
    _renderModal();
  }

  function closeModal() {
    document.getElementById("goals-modal").classList.remove("open");
  }

  function _renderModal() {
    const goals = _load();
    const fmt = Chat.fmt;
    const el = document.getElementById("goals-body");

    // Form tambah goal
    const formHtml = `
      <div class="goals-form" id="goals-add-form" style="display:none">
        <input type="text" id="goal-name-input" class="edit-input" placeholder="Nama tujuan (contoh: Menikah, Liburan)">
        <div style="display:flex;gap:8px;margin-top:6px">
          <input type="number" id="goal-target-input" class="edit-input" placeholder="Target (Rp)" style="flex:1">
          <input type="date" id="goal-deadline-input" class="edit-input date-input" style="flex:1;margin-top:0" title="Deadline (opsional)">
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="modal-btn cancel" onclick="SavingsGoals.hideForm()">Batal</button>
          <button class="modal-btn excel" onclick="SavingsGoals.submitAdd()">+ Tambah</button>
        </div>
      </div>
      <button class="goals-add-btn" id="goals-add-btn" onclick="SavingsGoals.showForm()">
        + Tambah Tujuan Tabungan
      </button>`;

    if (goals.length === 0) {
      el.innerHTML = `
        <div style="text-align:center;padding:24px 0;color:var(--muted2)">
          <div style="font-size:36px;margin-bottom:8px">🎯</div>
          <div style="font-size:14px;font-weight:500;color:var(--text);margin-bottom:4px">Belum ada tujuan tabungan</div>
          <div style="font-size:12px">Tambahkan target seperti "Menikah", "Liburan", atau "Beli Motor"</div>
        </div>
        ${formHtml}`;
      return;
    }

    const goalsHtml = goals
      .map((g) => {
        const pct = Math.min(100, Math.round((g.saved / g.target) * 100));
        const remain = g.target - g.saved;
        const isDone = pct >= 100;
        const est = _estimate(g);
        const barColor = isDone
          ? "var(--green)"
          : pct >= 70
            ? "var(--amber)"
            : "var(--accent)";

        // Deadline warning
        let deadlineHtml = "";
        if (g.deadline && !isDone) {
          const daysLeft = Math.ceil(
            (new Date(g.deadline) - new Date()) / 86400000,
          );
          const dlColor =
            daysLeft < 30
              ? "var(--red)"
              : daysLeft < 90
                ? "var(--amber)"
                : "var(--muted2)";
          deadlineHtml = `<span style="font-size:10px;color:${dlColor}">⏰ ${daysLeft > 0 ? daysLeft + " hari lagi" : "Deadline terlewat!"}</span>`;
        }

        return `
        <div class="goal-card ${isDone ? "goal-done" : ""}">
          <div class="goal-header">
            <div>
              <div class="goal-name">${isDone ? "✅" : "🎯"} ${g.name}</div>
              <div class="goal-target-text">${fmt(g.saved)} / ${fmt(g.target)}</div>
            </div>
            <div style="text-align:right">
              <div class="goal-pct" style="color:${barColor}">${pct}%</div>
              ${deadlineHtml}
            </div>
          </div>

          <!-- Progress bar -->
          <div class="goal-bar-wrap">
            <div class="goal-bar" style="width:${pct}%;background:${barColor}"></div>
          </div>

          ${
            !isDone
              ? `
          <!-- Sisa & estimasi -->
          <div class="goal-meta">
            <span>Sisa: <strong>${fmt(remain)}</strong></span>
            ${est ? `<span>Est: <strong>${est.date}</strong> (~${est.months} bln)</span>` : ""}
          </div>

          <!-- Setor -->
          <div class="goal-deposit-row">
            <input type="number" class="edit-input goal-deposit-input"
              id="deposit-${g.id}" placeholder="Jumlah setoran" min="1000">
            <button class="modal-btn excel" style="padding:6px 12px;white-space:nowrap"
              onclick="SavingsGoals.depositFromInput(${g.id})">💰 Setor</button>
          </div>`
              : `
          <div style="text-align:center;font-size:12px;color:var(--green);padding:6px 0">
            🎉 Target tercapai pada ${new Date(g.deposits[g.deposits.length - 1]?.date || g.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
          </div>`
          }

          <!-- History setoran -->
          ${
            g.deposits.length > 0
              ? `
          <details class="goal-history">
            <summary style="font-size:11px;color:var(--muted2);cursor:pointer;padding:4px 0">
              📋 ${g.deposits.length} setoran
            </summary>
            <div style="margin-top:6px;display:flex;flex-direction:column;gap:4px">
              ${g.deposits
                .slice(-5)
                .reverse()
                .map(
                  (d) => `
                <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted2)">
                  <span>${d.date}</span>
                  <span style="color:var(--green);font-family:JetBrains Mono,monospace">+${fmt(d.amount)}</span>
                </div>`,
                )
                .join("")}
            </div>
          </details>`
              : ""
          }

          <button class="goal-delete-btn" onclick="SavingsGoals.confirmDelete(${g.id}, '${g.name}')">🗑 Hapus tujuan</button>
        </div>`;
      })
      .join("");

    el.innerHTML = goalsHtml + formHtml;
  }

  function showForm() {
    document.getElementById("goals-add-form").style.display = "block";
    document.getElementById("goals-add-btn").style.display = "none";
    document.getElementById("goal-name-input").focus();
  }

  function hideForm() {
    document.getElementById("goals-add-form").style.display = "none";
    document.getElementById("goals-add-btn").style.display = "block";
  }

  function submitAdd() {
    const name = document.getElementById("goal-name-input").value.trim();
    const target = document.getElementById("goal-target-input").value;
    const ddl = document.getElementById("goal-deadline-input").value;
    if (!name) {
      Chat.showToast("⚠️ Nama tujuan tidak boleh kosong");
      return;
    }
    if (!target || parseFloat(target) < 1000) {
      Chat.showToast("⚠️ Target minimal Rp 1.000");
      return;
    }
    add(name, target, ddl || null);
    Chat.showToast(`✅ Tujuan "${name}" ditambahkan!`);
    _renderModal();
  }

  function depositFromInput(id) {
    const input = document.getElementById(`deposit-${id}`);
    const amount = parseFloat(input?.value);
    if (!amount || amount < 1000) {
      Chat.showToast("⚠️ Minimal setoran Rp 1.000");
      return;
    }
    deposit(id, amount);
    Chat.showToast(`💰 Setoran berhasil dicatat!`);
  }

  function confirmDelete(id, name) {
    if (!confirm(`Hapus tujuan "${name}"?`)) return;
    remove(id);
    Chat.showToast(`🗑 Tujuan "${name}" dihapus`);
  }

  return {
    add,
    deposit,
    remove,
    getAll,
    parseFromChat,
    depositFromInput,
    openModal,
    closeModal,
    showForm,
    hideForm,
    submitAdd,
    confirmDelete,
  };
})();
