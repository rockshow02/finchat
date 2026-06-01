// ============================================================
//  FinChat — State & Storage
// ============================================================

const App = (() => {
  let state = {
    messages: [],
    financialState: { income: 0, expense: 0, transactions: [] },
    lastChartData: null,
    isLoading: false,
  };

  // ── Storage ────────────────────────────────────────────────
  function save() {
    try {
      localStorage.setItem(
        CONFIG.LS_FINANCIAL,
        JSON.stringify(state.financialState),
      );
      // Simpan hanya MAX_HISTORY pesan terakhir ke storage juga
      const trimmed = state.messages.slice(-CONFIG.MAX_HISTORY);
      localStorage.setItem(CONFIG.LS_MESSAGES, JSON.stringify(trimmed));
      if (state.lastChartData)
        localStorage.setItem(
          CONFIG.LS_CHART,
          JSON.stringify(state.lastChartData),
        );
    } catch (e) {
      console.warn("[FinChat] save gagal:", e);
    }
  }

  function load() {
    try {
      const fin = localStorage.getItem(CONFIG.LS_FINANCIAL);
      const msg = localStorage.getItem(CONFIG.LS_MESSAGES);
      const cht = localStorage.getItem(CONFIG.LS_CHART);
      if (fin) state.financialState = JSON.parse(fin);
      if (msg) state.messages = JSON.parse(msg);
      if (cht) state.lastChartData = JSON.parse(cht);
    } catch (e) {
      console.warn("[FinChat] load gagal:", e);
    }
  }

  function clear() {
    localStorage.removeItem(CONFIG.LS_FINANCIAL);
    localStorage.removeItem(CONFIG.LS_MESSAGES);
    localStorage.removeItem(CONFIG.LS_CHART);
    localStorage.removeItem("finchat_story_cache");
    localStorage.removeItem("finchat_ai_insight_cache");
    localStorage.removeItem("finchat_achievements");
    localStorage.removeItem("finchat_tokens");
    localStorage.removeItem("finchat_streak");
    localStorage.removeItem("finchat_alerts_dismissed");
    localStorage.removeItem("finchat_budgets");
    localStorage.removeItem("finchat_exported");
    localStorage.removeItem("finchat_goals");
    localStorage.removeItem("finchat_last_monthly_report");
    localStorage.removeItem("finchat_last_insight");
    state.messages = [];
    state.financialState = { income: 0, expense: 0, transactions: [] };
    state.lastChartData = null;
  }

  // ── System Prompt Builder ──────────────────────────────────
  // Inject state keuangan ke system prompt — bukan di history
  // Ini kunci optimasi: transaksi tidak perlu ada di conversation history
  function buildSystemPrompt() {
    const { income, expense, transactions } = state.financialState;
    const balance = income - expense;

    // Ringkasan state — jauh lebih hemat daripada kirim full history
    const stateStr = JSON.stringify({
      income_total: income,
      expense_total: expense,
      balance,
      transaction_count: transactions.length,
      // Kirim hanya 20 transaksi terakhir ke prompt, bukan semua
      recent_transactions: transactions.slice(-20),
    });

    return SYSTEM_PROMPT.replace("{{STATE}}", stateStr);
  }

  // ── Trimmed Messages for API ───────────────────────────────
  // Hapus FINCHAT_DATA dari history sebelum kirim ke API
  // Karena state sudah di-inject via system prompt — tidak perlu duplikasi
  function getMessagesForAPI() {
    const history = state.messages.slice(-CONFIG.MAX_HISTORY);
    return history
      .map((m) => ({
        role: m.role,
        // Strip data blocks dari content — hemat token output lama
        content: m.content
          .replace(/<FC_DATA>[\s\S]*?<\/FC_DATA>/g, "")
          .replace(/<FC_CHART>[\s\S]*?<\/FC_CHART>/g, "")
          .replace(/<FINCHAT_DATA>[\s\S]*?<\/FINCHAT_DATA>/g, "")
          .replace(/<FINCHAT_CHART>[\s\S]*?<\/FINCHAT_CHART>/g, "")
          .trim(),
      }))
      .filter((m) => m.content.length > 0); // skip pesan yang isinya cuma data block
  }

  // ── Financial State ────────────────────────────────────────
  function applyFinData(finData) {
    if (!finData) return;
    if (finData.income_total != null)
      state.financialState.income = finData.income_total;
    if (finData.expense_total != null)
      state.financialState.expense = finData.expense_total;
    if (finData.transactions && finData.transactions.length > 0)
      state.financialState.transactions = finData.transactions;
  }

  // ── Getters / Setters ──────────────────────────────────────
  function getMessages() {
    return state.messages;
  }
  function getFinancial() {
    return state.financialState;
  }
  function getLastChart() {
    return state.lastChartData;
  }
  function isLoading() {
    return state.isLoading;
  }
  function setLoading(val) {
    state.isLoading = val;
  }
  function setLastChart(data) {
    state.lastChartData = data;
  }
  function pushMessage(msg) {
    state.messages.push(msg);
  }

  return {
    load,
    save,
    clear,
    buildSystemPrompt,
    getMessagesForAPI,
    applyFinData,
    getMessages,
    getFinancial,
    getLastChart,
    isLoading,
    setLoading,
    setLastChart,
    pushMessage,
  };
})();
