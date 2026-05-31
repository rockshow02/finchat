// ============================================================
//  FinChat — API + Hybrid Engine
//  Rule-based dulu → AI hanya untuk yang ambigu
// ============================================================

const API = (() => {
  const fmt = Chat.fmt;
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

  // ══════════════════════════════════════════════════════════
  //  LOCAL HANDLERS — 0 token
  // ══════════════════════════════════════════════════════════

  function _handleSaldo() {
    const { income, expense, transactions } = App.getFinancial();
    const balance = income - expense;
    const balColor = balance >= 0 ? "🟢" : "🔴";
    Chat.appendMessage(
      "bot",
      `💰 **Saldo: ${balance < 0 ? "-" : ""}${fmt(balance)}** ${balColor}\n\n` +
        `📥 Pemasukan: ${fmt(income)}\n` +
        `📤 Pengeluaran: ${fmt(expense)}\n` +
        `🧾 Total transaksi: ${transactions.length}`,
    );
    TokenCounter.track(0, 0);
  }

  function _handleGrafik() {
    const { transactions } = App.getFinancial();
    const cats = {};
    transactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        const c = t.category || "Lainnya";
        cats[c] = (cats[c] || 0) + (t.amount || 0);
      });
    if (Object.keys(cats).length === 0) {
      Chat.appendMessage("bot", "📊 Belum ada data pengeluaran untuk grafik.");
      return;
    }
    const chartData = {
      type: "doughnut",
      title: "Pengeluaran per Kategori",
      labels: Object.keys(cats),
      colors: COLORS,
      datasets: [{ label: "Pengeluaran", data: Object.values(cats) }],
    };
    App.setLastChart(chartData);
    Chat.appendMessage(
      "bot",
      `📊 Ini grafik pengeluaranmu!\n<FC_CHART>${JSON.stringify(chartData)}</FC_CHART>`,
    );
    TokenCounter.track(0, 0);
  }

  function _handleLaporan() {
    const { income, expense, transactions } = App.getFinancial();
    const balance = income - expense;
    if (transactions.length === 0) {
      Chat.appendMessage("bot", "📋 Belum ada transaksi yang dicatat.");
      return;
    }
    // Hitung per kategori
    const cats = {};
    transactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        const c = t.category || "Lainnya";
        cats[c] = (cats[c] || 0) + (t.amount || 0);
      });
    const catRows = Object.entries(cats)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `  • ${k}: ${fmt(v)}`)
      .join("\n");

    // 5 transaksi terakhir
    const recent = transactions
      .slice(-5)
      .reverse()
      .map(
        (t) =>
          `  ${t.type === "income" ? "📥" : "📤"} ${t.label} — ${fmt(t.amount)}`,
      )
      .join("\n");

    Chat.appendMessage(
      "bot",
      `📋 **Laporan Keuangan**\n\n` +
        `📥 Total Pemasukan: ${fmt(income)}\n` +
        `📤 Total Pengeluaran: ${fmt(expense)}\n` +
        `💰 Saldo: ${balance < 0 ? "-" : ""}${fmt(balance)}\n` +
        `🧾 Jumlah Transaksi: ${transactions.length}\n\n` +
        (catRows ? `**Pengeluaran per Kategori:**\n${catRows}\n\n` : "") +
        `**5 Transaksi Terakhir:**\n${recent}`,
    );
    TokenCounter.track(0, 0);
  }

  // ── Execute local (dipanggil setelah konfirmasi) ──────────
  function executeLocal(parsed) {
    switch (parsed.intent) {
      case "expense":
        _handleExpense(parsed.data);
        break;
      case "income":
        _handleIncome(parsed.data);
        break;
    }
  }

  function _handleExpense(data) {
    const fin = App.getFinancial();
    fin.transactions.push({ ...data, type: "expense" });
    fin.expense += data.amount;
    App.applyFinData({
      expense_total: fin.expense,
      income_total: fin.income,
      transactions: fin.transactions,
    });
    Chat.updateSummary(fin.income, fin.expense);
    App.save();
    Chat.appendMessage(
      "bot",
      `✅ Dicatat! **${data.label}** — ${fmt(data.amount)}\n` +
        `🏷️ Kategori: ${data.category} • 📅 ${data.date}\n\n` +
        `📤 Total pengeluaran: ${fmt(fin.expense)} | 💰 Saldo: ${fmt(fin.income - fin.expense)}`,
    );
    Budget.checkAlert(data.category);
    SpendingAlert.checkAfterTransaction(data.category);
    HealthScore.updateStreak();
    HealthScore.updateHeaderChip();
    TokenCounter.track(0, 0);
  }

  function _handleIncome(data) {
    const fin = App.getFinancial();
    fin.transactions.push({ ...data, type: "income" });
    fin.income += data.amount;
    App.applyFinData({
      income_total: fin.income,
      expense_total: fin.expense,
      transactions: fin.transactions,
    });
    Chat.updateSummary(fin.income, fin.expense);
    App.save();
    Chat.appendMessage(
      "bot",
      `✅ Dicatat! **${data.label}** — ${fmt(data.amount)}\n` +
        `🏷️ Kategori: ${data.category} • 📅 ${data.date}\n\n` +
        `📥 Total pemasukan: ${fmt(fin.income)} | 💰 Saldo: ${fmt(fin.income - fin.expense)}`,
    );
    HealthScore.updateStreak();
    HealthScore.updateHeaderChip();
    TokenCounter.track(0, 0);
  }

  function _handleHapusTerakhir() {
    const fin = App.getFinancial();
    if (fin.transactions.length === 0) {
      Chat.appendMessage("bot", "⚠️ Tidak ada transaksi yang bisa dihapus.");
      return;
    }
    const last = fin.transactions.pop();
    if (last.type === "income") fin.income -= last.amount;
    else fin.expense -= last.amount;
    App.applyFinData({
      income_total: fin.income,
      expense_total: fin.expense,
      transactions: fin.transactions,
    });
    Chat.updateSummary(fin.income, fin.expense);
    App.save();

    Chat.appendMessage(
      "bot",
      `🗑️ Transaksi terakhir dihapus:\n**${last.label}** — ${fmt(last.amount)}\n\n` +
        `💰 Saldo sekarang: ${fmt(fin.income - fin.expense)}`,
    );
    TokenCounter.track(0, 0);
  }

  // ── Deteksi input laporan kompleks (multi-baris) ──────────
  function _isComplexReport(text) {
    const lines = text
      .trim()
      .split("\n")
      .filter((l) => l.trim());
    // Minimal 3 baris DAN ada tanda-tanda laporan keuangan
    if (lines.length < 3) return false;
    const hasCalc = /[×x\*]\s*\d|\d\s*[×x\*]|\d\s*\+\s*\d|\d\s*-\s*\d/.test(
      text,
    );
    const hasCarryOver = /bulan\s*(kemaren|lalu|sebelum)|carry|sisa/.test(
      text.toLowerCase(),
    );
    const hasMultiAmt = (text.match(/\d+[\d.,]*/g) || []).length >= 3;
    return hasMultiAmt && (hasCalc || hasCarryOver);
  }

  async function _handleComplexReport(userText) {
    App.pushMessage({ role: "user", content: userText });
    App.setLoading(true);
    document.getElementById("send-btn").disabled = true;
    Chat.showTyping();

    const reportPrompt = `User mengirim catatan keuangan kompleks dalam format laporan.
Tugasmu:
1. Baca dan pahami seluruh catatan
2. Hitung semua matematika yang ada (perkalian, penjumlahan, dll)
3. Identifikasi semua transaksi pemasukan dan pengeluaran
4. Pisahkan carry over bulan lalu sebagai informasi saldo awal
5. Buat ringkasan yang jelas

Input:
${userText}

Balas dengan:
- Ringkasan hasil parsing (apa yang kamu temukan)
- Daftar transaksi yang berhasil diidentifikasi
- Total pemasukan, pengeluaran, dan saldo

Sertakan data di akhir:
<FC_DATA>
{
  "income_total": <total>,
  "expense_total": <total>,
  "transactions": [<semua transaksi>]
}
</FC_DATA>`;

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CONFIG.MODEL,
          max_tokens: 1500,
          system: App.buildSystemPrompt(),
          messages: [
            ...App.getMessagesForAPI(),
            { role: "user", content: reportPrompt },
          ],
        }),
      });

      const data = await res.json();
      Chat.removeTyping();

      if (!res.ok) {
        Chat.appendMessage("bot", "⚠️ Ada gangguan. Coba lagi ya!");
        App.getMessages().pop();
        return;
      }

      const reply = data?.content?.[0]?.text;
      if (!reply) {
        Chat.appendMessage("bot", "🙏 Coba kirim ulang ya.");
        return;
      }

      if (data.usage)
        TokenCounter.track(data.usage.input_tokens, data.usage.output_tokens);

      const finData =
        parseTag("FC_DATA", reply) || parseTag("FINCHAT_DATA", reply);
      if (finData) {
        App.applyFinData(finData);
        Chat.updateSummary(
          App.getFinancial().income,
          App.getFinancial().expense,
        );
      }

      Chat.appendMessage("bot", reply);
      App.pushMessage({ role: "assistant", content: reply });
      App.save();
    } catch (e) {
      Chat.removeTyping();
      Chat.appendMessage(
        "bot",
        !navigator.onLine
          ? "📡 Tidak ada koneksi internet."
          : "🔌 Gagal konek ke server.",
      );
      App.getMessages().pop();
    } finally {
      App.setLoading(false);
      document.getElementById("send-btn").disabled = false;
      document.getElementById("input").focus();
    }
  }
  //  Deteksi input yang mengandung 2+ transaksi sekaligus
  //  Contoh: "gaji 8juta, sudah dipake 2juta buat beli tv"
  // ══════════════════════════════════════════════════════════

  function _isMultiTransaction(text) {
    const lower = text.toLowerCase();
    // Signal kata penghubung antar transaksi
    const connectors = [
      ", ",
      " dan ",
      " tapi ",
      " terus ",
      " lalu ",
      " sama ",
      " sisanya ",
      " sudah dipake ",
      " dipakai ",
      " digunakan ",
      " buat ",
      " untuk beli ",
      " langsung beli ",
    ];
    // Harus ada minimal 2 angka yang berbeda
    const amounts = text.match(/\d+[\d.,]*\s*(rb|ribu|juta|jt|k|miliar|m)?/gi);
    if (!amounts || amounts.length < 2) return false;
    // Harus ada connector
    return connectors.some((c) => lower.includes(c));
  }

  async function _handleMultiTransaction(userText) {
    App.pushMessage({ role: "user", content: userText });
    App.setLoading(true);
    document.getElementById("send-btn").disabled = true;
    Chat.showTyping();

    const multiPrompt = `User mengirim input yang mengandung BEBERAPA transaksi sekaligus.
Tugasmu: ekstrak SEMUA transaksi dari input, lalu simpan semuanya.

Input user: "${userText}"

Balas dengan format:
1. Konfirmasi semua transaksi yang kamu temukan (ringkas)
2. Sertakan data di akhir

<FC_DATA>
{
  "income_total": <total_pemasukan_kumulatif>,
  "expense_total": <total_pengeluaran_kumulatif>,
  "transactions": [<semua_transaksi_yang_sudah_ada_plus_baru>]
}
</FC_DATA>`;

    try {
      const messages = [
        ...App.getMessagesForAPI(),
        { role: "user", content: multiPrompt },
      ];

      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CONFIG.MODEL,
          max_tokens: CONFIG.MAX_TOKENS,
          system: App.buildSystemPrompt(),
          messages,
        }),
      });

      const data = await res.json();
      Chat.removeTyping();

      if (!res.ok) {
        const errCode = data?.error?.type || "";
        const errMap = {
          authentication_error: "🔑 API key tidak valid.",
          rate_limit_error: "⏳ Terlalu banyak request. Tunggu sebentar.",
          overloaded_error: "🔄 Server AI sibuk. Coba lagi.",
        };
        Chat.appendMessage(
          "bot",
          errMap[errCode] || "⚠️ Ada gangguan. Coba lagi ya!",
        );
        App.getMessages().pop();
        return;
      }

      const reply = data?.content?.[0]?.text;
      if (!reply) {
        Chat.appendMessage("bot", "🙏 Coba kirim ulang ya.");
        return;
      }

      if (data.usage)
        TokenCounter.track(data.usage.input_tokens, data.usage.output_tokens);

      const finData =
        parseTag("FC_DATA", reply) || parseTag("FINCHAT_DATA", reply);
      if (finData) {
        App.applyFinData(finData);
        Chat.updateSummary(
          App.getFinancial().income,
          App.getFinancial().expense,
        );
      }

      Chat.appendMessage("bot", reply);
      App.pushMessage({ role: "assistant", content: reply });
      App.save();
    } catch (e) {
      Chat.removeTyping();
      Chat.appendMessage(
        "bot",
        !navigator.onLine
          ? "📡 Tidak ada koneksi internet."
          : "🔌 Gagal konek ke server.",
      );
      App.getMessages().pop();
      console.error("[FinChat] Multi-tx error:", e);
    } finally {
      App.setLoading(false);
      document.getElementById("send-btn").disabled = false;
      document.getElementById("input").focus();
    }
  }

  async function _handleAI(userText) {
    App.pushMessage({ role: "user", content: userText });
    App.setLoading(true);
    document.getElementById("send-btn").disabled = true;
    Chat.showTyping();

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CONFIG.MODEL,
          max_tokens: CONFIG.MAX_TOKENS,
          system: App.buildSystemPrompt(),
          messages: App.getMessagesForAPI(),
        }),
      });

      const data = await res.json();
      Chat.removeTyping();

      if (!res.ok) {
        const errCode = data?.error?.type || "";
        const errMap = {
          authentication_error:
            "🔑 API key tidak valid. Cek kembali key di server.js ya.",
          rate_limit_error:
            "⏳ Terlalu banyak request. Tunggu sebentar lalu coba lagi.",
          overloaded_error:
            "🔄 Server AI sedang sibuk. Coba lagi dalam beberapa detik.",
          invalid_request_error:
            "⚠️ Request tidak valid. Coba ketik ulang pertanyaanmu.",
        };
        const msg =
          errMap[errCode] ||
          `⚠️ Ups, ada gangguan (${data?.error?.message || `HTTP ${res.status}`}). Coba lagi ya!`;
        Chat.appendMessage("bot", msg);
        App.getMessages().pop();
        return;
      }

      const reply = data?.content?.[0]?.text;
      if (!reply) {
        Chat.appendMessage(
          "bot",
          "🙏 Maaf, responnya kosong. Coba kirim ulang pesan kamu.",
        );
        return;
      }

      if (data.usage)
        TokenCounter.track(data.usage.input_tokens, data.usage.output_tokens);

      // Parse financial data dari AI response
      const finData =
        parseTag("FC_DATA", reply) || parseTag("FINCHAT_DATA", reply);
      if (finData) {
        App.applyFinData(finData);
        Chat.updateSummary(
          App.getFinancial().income,
          App.getFinancial().expense,
        );
      }

      Chat.appendMessage("bot", reply);
      App.pushMessage({ role: "assistant", content: reply });
      App.save();
    } catch (e) {
      Chat.removeTyping();
      const isOffline = !navigator.onLine;
      Chat.appendMessage(
        "bot",
        isOffline
          ? "📡 Tidak ada koneksi internet. Cek koneksi kamu lalu coba lagi."
          : "🔌 Gagal konek ke server. Pastikan `node server.js` sudah jalan ya.",
      );
      App.getMessages().pop();
      console.error("[FinChat] API error:", e);
    } finally {
      App.setLoading(false);
      document.getElementById("send-btn").disabled = false;
      document.getElementById("input").focus();
    }
  }

  // ══════════════════════════════════════════════════════════
  //  MAIN SEND — hybrid routing
  // ══════════════════════════════════════════════════════════

  async function send(userText) {
    if (App.isLoading()) return;

    Chat.appendMessage("user", userText);

    // Cek multi-transaksi DULU — sebelum parser lokal
    // Supaya "gaji 8juta, beli tv 2juta" tidak salah parse
    if (_isMultiTransaction(userText)) {
      await _handleMultiTransaction(userText);
      return;
    }

    // Cek laporan kompleks multi-baris
    if (_isComplexReport(userText)) {
      await _handleComplexReport(userText);
      return;
    }

    // Parse intent — rule-based
    const parsed = Parser.parse(userText);

    if (parsed) {
      switch (parsed.intent) {
        case "saldo":
          return _handleSaldo();
        case "laporan":
          return _handleLaporan();
        case "grafik":
          return _handleGrafik();
        case "hapus_terakhir":
          return _handleHapusTerakhir();
        case "error":
          Chat.appendMessage("bot", parsed.message);
          return;
        case "expense":
        case "income":
          return Confirm.show(parsed);
      }
    }

    // Tidak dikenali → AI
    await _handleAI(userText);
  }

  return { send, executeLocal };
})();

// ── Token Counter ──────────────────────────────────────────
const TokenCounter = (() => {
  const LS = "finchat_tokens";
  let session = { input: 0, output: 0, calls: 0 };

  function load() {
    try {
      const s = localStorage.getItem(LS);
      if (s) session = JSON.parse(s);
    } catch {}
  }

  function track(input, output) {
    session.input += input;
    session.output += output;
    if (input > 0 || output > 0) session.calls++;
    try {
      localStorage.setItem(LS, JSON.stringify(session));
    } catch {}
    _updateUI();
  }

  function _updateUI() {
    const el = document.getElementById("token-counter");
    if (!el) return;
    const total = session.input + session.output;
    const cost = (
      session.input * 0.00000025 +
      session.output * 0.00000125
    ).toFixed(4);
    const label =
      total === 0
        ? "🔢 0 token"
        : `🔢 ${total.toLocaleString()} token • ~$${cost}`;
    el.textContent = label;
    el.title = `Input: ${session.input.toLocaleString()} | Output: ${session.output.toLocaleString()} | API calls: ${session.calls} | Klik untuk reset`;
  }

  function reset() {
    session = { input: 0, output: 0, calls: 0 };
    localStorage.removeItem(LS);
    _updateUI();
    Chat.showToast("🔢 Token counter direset");
  }

  load();
  setTimeout(_updateUI, 100);
  return { track, reset };
})();
