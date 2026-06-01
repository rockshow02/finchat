// ============================================================
//  FinChat — Features
//  PIN lock, date picker, custom categories, backup/restore
// ============================================================

/* ════════════════════════════════════════════════════════════
   PIN LOCK
   ════════════════════════════════════════════════════════════ */
const PIN = (() => {
  const LS_PIN = "finchat_pin";
  const LS_NO_PIN = "finchat_nopin";
  let _input = "";
  let _setupInput = "";
  let _setupStep = 1; // 1=enter new, 2=confirm
  let _setupTemp = "";

  function _hash(str) {
    // simple djb2 hash — tidak butuh crypto untuk PIN sederhana
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = (h << 5) + h + str.charCodeAt(i);
    return (h >>> 0).toString(16);
  }

  function init() {
    const hasPin = !!localStorage.getItem(LS_PIN);
    const noPin = !!localStorage.getItem(LS_NO_PIN);

    if (noPin || !hasPin) {
      // No PIN set — show app directly, show setup option
      _showApp();
      return;
    }
    // PIN exists — show lock screen
    _showLock(false);
  }

  function _showLock(isSetup) {
    document.getElementById("pin-screen").style.display = "flex";
    document.getElementById("app").style.display = "none";
    document.getElementById("pin-skip").style.display = localStorage.getItem(
      LS_PIN,
    )
      ? "none"
      : "block";
    _input = "";
    _updateDots("pin-dots", 0);
    document.getElementById("pin-sub").textContent =
      "Masukkan PIN untuk melanjutkan";
  }

  function _showApp() {
    document.getElementById("pin-screen").style.display = "none";
    const app = document.getElementById("app");
    app.style.display = "flex";
    Chat.updateSummary(App.getFinancial().income, App.getFinancial().expense);
    Chat.restoreHistory();
    if (App.getMessages().length > 0)
      Chat.showToast("💾 Data sebelumnya dipulihkan");
    document.getElementById("input").focus();
    setTimeout(() => Onboarding.show(), 400);
    HealthScore.updateHeaderChip();
    WeeklyInsight.checkAutoShow();
    SpendingAlert.init();
    PushNotif.init();
    MonthlyReport.checkAutoShow();
  }

  function _updateDots(id, count) {
    const dots = document.querySelectorAll(`#${id} span`);
    dots.forEach((d, i) => {
      d.style.background = i < count ? "var(--accent)" : "var(--border2)";
      d.style.transform = i < count ? "scale(1.2)" : "scale(1)";
    });
  }

  function press(digit) {
    if (_input.length >= 4) return;
    _input += digit;
    _updateDots("pin-dots", _input.length);
    if (_input.length === 4) setTimeout(_verify, 150);
  }

  function del() {
    _input = _input.slice(0, -1);
    _updateDots("pin-dots", _input.length);
  }

  function _verify() {
    const stored = localStorage.getItem(LS_PIN);
    if (_hash(_input) === stored) {
      _showApp();
    } else {
      document.getElementById("pin-sub").textContent =
        "❌ PIN salah, coba lagi";
      document.getElementById("pin-dots").style.animation = "shake 0.3s ease";
      setTimeout(() => {
        document.getElementById("pin-dots").style.animation = "";
      }, 300);
      _input = "";
      _updateDots("pin-dots", 0);
    }
  }

  function skip() {
    localStorage.setItem(LS_NO_PIN, "1");
    _showApp();
  }

  // ── Setup / Change PIN ──────────────────────────────────
  function openSetup() {
    _setupInput = "";
    _setupStep = 1;
    _setupTemp = "";
    document.getElementById("pin-setup-sub").textContent =
      "Masukkan 4 digit PIN baru";
    _updateDots("pin-setup-dots", 0);
    document.getElementById("pin-setup-modal").classList.add("open");
  }

  function closeSetup() {
    document.getElementById("pin-setup-modal").classList.remove("open");
  }

  function setupPress(digit) {
    if (_setupInput.length >= 4) return;
    _setupInput += digit;
    _updateDots("pin-setup-dots", _setupInput.length);
    if (_setupInput.length === 4) setTimeout(_setupNext, 150);
  }

  function setupDel() {
    _setupInput = _setupInput.slice(0, -1);
    _updateDots("pin-setup-dots", _setupInput.length);
  }

  function _setupNext() {
    if (_setupStep === 1) {
      _setupTemp = _setupInput;
      _setupInput = "";
      _setupStep = 2;
      document.getElementById("pin-setup-sub").textContent =
        "Konfirmasi PIN kamu";
      _updateDots("pin-setup-dots", 0);
    } else {
      if (_setupInput === _setupTemp) {
        localStorage.setItem(LS_PIN, _hash(_setupInput));
        localStorage.removeItem(LS_NO_PIN);
        closeSetup();
        Chat.showToast("🔐 PIN berhasil diatur!");
      } else {
        document.getElementById("pin-setup-sub").textContent =
          "❌ PIN tidak cocok, ulangi";
        _setupInput = "";
        _setupStep = 1;
        _setupTemp = "";
        _updateDots("pin-setup-dots", 0);
      }
    }
  }

  function removePin() {
    localStorage.removeItem(LS_PIN);
    localStorage.setItem(LS_NO_PIN, "1");
    closeSetup();
    Chat.showToast("🔓 PIN dihapus");
  }

  return {
    init,
    press,
    del,
    skip,
    openSetup,
    closeSetup,
    setupPress,
    setupDel,
    removePin,
  };
})();

/* ════════════════════════════════════════════════════════════
   FEATURES: Date picker, Categories, Backup/Restore
   ════════════════════════════════════════════════════════════ */
const Features = (() => {
  const LS_CATS = "finchat_categories";
  let _selectedDate = null;

  // ── Default categories ────────────────────────────────────
  const DEFAULT_CATS = [
    "Makan & Minum",
    "Transport",
    "Belanja",
    "Tagihan",
    "Hiburan",
    "Kesehatan",
    "Pendidikan",
    "Investasi",
    "Gaji",
    "Freelance",
    "Lainnya",
  ];

  function _loadCats() {
    try {
      const saved = localStorage.getItem(LS_CATS);
      return saved ? JSON.parse(saved) : [...DEFAULT_CATS];
    } catch {
      return [...DEFAULT_CATS];
    }
  }

  function _saveCats(cats) {
    localStorage.setItem(LS_CATS, JSON.stringify(cats));
  }

  // ── Date Picker ───────────────────────────────────────────
  function openDatePicker() {
    const input = document.getElementById("date-input");
    const today = new Date().toISOString().split("T")[0];
    input.value = _selectedDate || today;
    document.getElementById("date-modal").classList.add("open");
  }

  function setDate() {
    const val = document.getElementById("date-input").value;
    if (!val) return;
    _selectedDate = val;
    document.getElementById("date-modal").classList.remove("open");
    // Show indicator on send button
    const btn = document.getElementById("send-btn");
    btn.title = `Tanggal: ${val}`;
    btn.style.background = "var(--green)";
    Chat.showToast(`📅 Tanggal dipilih: ${_formatDate(val)}`);
  }

  function clearDate(silent = false) {
    _selectedDate = null;
    document.getElementById("date-modal").classList.remove("open");
    const btn = document.getElementById("send-btn");
    btn.title = "";
    btn.style.background = "";
    if (!silent) Chat.showToast("📅 Tanggal dihapus");
  }

  function getSelectedDate() {
    return _selectedDate;
  }

  function _formatDate(str) {
    const d = new Date(str);
    return d.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }

  // ── Categories ────────────────────────────────────────────
  function openCategories() {
    _renderCatList();
    document.getElementById("cat-modal").classList.add("open");
  }

  function closeCategories() {
    document.getElementById("cat-modal").classList.remove("open");
  }

  function _renderCatList() {
    const cats = _loadCats();
    const el = document.getElementById("cat-list");
    if (cats.length === 0) {
      el.innerHTML =
        '<div style="color:var(--muted);font-size:13px;text-align:center;padding:16px">Belum ada kategori</div>';
      return;
    }
    el.innerHTML = cats
      .map(
        (c, i) => `
      <div class="cat-item">
        <span class="cat-chip">🏷️ ${c}</span>
        <button class="cat-del" onclick="Features.deleteCategory(${i})">✕</button>
      </div>`,
      )
      .join("");
  }

  function addCategory() {
    const input = document.getElementById("cat-input");
    const name = input.value.trim();
    if (!name) return;
    const cats = _loadCats();
    if (cats.includes(name)) {
      Chat.showToast("⚠️ Kategori sudah ada");
      return;
    }
    cats.push(name);
    _saveCats(cats);
    input.value = "";
    _renderCatList();
    Chat.showToast(`✅ Kategori "${name}" ditambahkan`);
  }

  function deleteCategory(idx) {
    const cats = _loadCats();
    cats.splice(idx, 1);
    _saveCats(cats);
    _renderCatList();
  }

  function getCategories() {
    return _loadCats();
  }

  // ── Backup & Restore ──────────────────────────────────────
  function openBackup() {
    document.getElementById("backup-modal").classList.add("open");
  }

  function closeBackup() {
    document.getElementById("backup-modal").classList.remove("open");
  }

  function backupJSON() {
    const data = {
      version: "1.1",
      exported_at: new Date().toISOString(),
      financial: App.getFinancial(),
      messages: App.getMessages(),
      categories: _loadCats(),
      budgets: JSON.parse(localStorage.getItem("finchat_budgets") || "{}"),
      last_chart: App.getLastChart(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const now = new Date();
    a.href = url;
    a.download = `FinChat_Backup_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    closeBackup();
    Chat.showToast("✅ Backup berhasil didownload!");
  }

  function restoreJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.financial) throw new Error("Format tidak valid");

        // Restore semua data
        App.clear();
        App.applyFinData({
          ...data.financial,
          income_total: data.financial.income,
          expense_total: data.financial.expense,
        });
        if (data.messages) data.messages.forEach((m) => App.pushMessage(m));
        if (data.last_chart) App.setLastChart(data.last_chart);
        if (data.categories) _saveCats(data.categories);
        if (data.budgets)
          localStorage.setItem("finchat_budgets", JSON.stringify(data.budgets));
        App.save();

        // Re-render UI
        Chat.resetUI();
        Chat.updateSummary(
          App.getFinancial().income,
          App.getFinancial().expense,
        );
        Chat.restoreHistory();
        closeBackup();

        // Info apa saja yang direstore
        const items = ["transaksi & saldo"];
        if (data.categories) items.push("kategori");
        if (data.budgets && Object.keys(data.budgets).length)
          items.push("budget");
        Chat.showToast(`✅ Restore berhasil: ${items.join(", ")}`);
      } catch (err) {
        Chat.showToast("❌ File tidak valid atau rusak");
        console.error(err);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  // Close modals on overlay click
  ["date-modal", "cat-modal", "backup-modal"].forEach((id) => {
    document.addEventListener("click", (e) => {
      const modal = document.getElementById(id);
      if (modal && e.target === modal) modal.classList.remove("open");
    });
  });

  return {
    openDatePicker,
    setDate,
    clearDate,
    getSelectedDate,
    openCategories,
    closeCategories,
    addCategory,
    deleteCategory,
    getCategories,
    openBackup,
    closeBackup,
    backupJSON,
    restoreJSON,
  };
})();
