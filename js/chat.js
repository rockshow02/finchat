// ============================================================
//  FinChat — Chat UI
//  Render pesan, typing indicator, toast, summary bar
// ============================================================

const Chat = (() => {
  // ── Helpers ────────────────────────────────────────────────
  function fmt(num) {
    return "Rp " + Math.abs(Math.round(num)).toLocaleString("id-ID");
  }

  function getTime() {
    return new Date().toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function cleanText(text) {
    return text
      .replace(/<FC_DATA>[\s\S]*?<\/FC_DATA>/g, "")
      .replace(/<FC_CHART>[\s\S]*?<\/FC_CHART>/g, "")
      .replace(/<FINCHAT_DATA>[\s\S]*?<\/FINCHAT_DATA>/g, "")
      .replace(/<FINCHAT_CHART>[\s\S]*?<\/FINCHAT_CHART>/g, "")
      .trim();
  }

  function formatBubble(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
  }

  function hideEmpty() {
    const el = document.getElementById("empty-state");
    if (el) el.remove();
  }

  // ── Summary Bar ────────────────────────────────────────────
  function updateSummary(income, expense) {
    document.getElementById("total-income").textContent = fmt(income);
    document.getElementById("total-expense").textContent = fmt(expense);
    const bal = income - expense;
    const el = document.getElementById("total-balance");
    el.textContent = (bal < 0 ? "-" : "") + fmt(bal);
    el.style.color = bal < 0 ? "var(--red)" : "var(--amber)";
  }

  // ── Toast ──────────────────────────────────────────────────
  function showToast(msg, duration = 2500) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), duration);
  }

  // ── Append Message ─────────────────────────────────────────
  function appendMessage(role, rawText, skipChart = false) {
    hideEmpty();
    const chatEl = document.getElementById("chat");

    const wrap = document.createElement("div");
    wrap.className = "msg-wrap" + (role === "user" ? " user" : "");

    const avatar = document.createElement("div");
    avatar.className = "avatar " + (role === "user" ? "user" : "bot");
    avatar.textContent = role === "user" ? "👤" : "💬";

    const msgCol = document.createElement("div");
    msgCol.style.cssText =
      "display:flex;flex-direction:column;gap:8px;min-width:0;max-width:min(75%,420px)";

    // Text bubble
    const text = cleanText(rawText);
    if (text) {
      const bubble = document.createElement("div");
      bubble.className = "bubble " + role;
      bubble.innerHTML = formatBubble(text);
      msgCol.appendChild(bubble);
    }

    // Chart bubble (bot only, unless skipped for history restore)
    if (role === "bot" && !skipChart) {
      const chartData =
        parseTag("FC_CHART", rawText) || parseTag("FINCHAT_CHART", rawText);
      if (chartData) {
        App.setLastChart(chartData);
        const cb = ChartRenderer.buildBubble(chartData);
        if (cb) msgCol.appendChild(cb);
      }
    }

    // Timestamp
    const ts = document.createElement("div");
    ts.className = "timestamp";
    ts.textContent = getTime();
    msgCol.appendChild(ts);

    if (role === "user") {
      wrap.appendChild(msgCol);
      wrap.appendChild(avatar);
    } else {
      wrap.appendChild(avatar);
      wrap.appendChild(msgCol);
    }

    chatEl.appendChild(wrap);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  // ── Restore History from Storage ──────────────────────────
  function restoreHistory() {
    const messages = App.getMessages();
    if (messages.length === 0) return;

    hideEmpty();
    const lastChart = App.getLastChart();

    messages.forEach((m, idx) => {
      const isLast = idx === messages.length - 1;
      // Only render chart for the last bot message that had one
      const skipChart = !(
        m.role === "bot" &&
        isLast &&
        m.content.includes("<FINCHAT_CHART>")
      );
      appendMessage(m.role, m.content, skipChart ? true : false);
    });

    // If last message had chart, render it
    if (lastChart) {
      const last = messages[messages.length - 1];
      if (
        last &&
        last.role === "bot" &&
        last.content.includes("<FINCHAT_CHART>")
      ) {
        // already rendered above via skipChart=false path
      }
    }

    const chatEl = document.getElementById("chat");
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  // ── Typing Indicator ───────────────────────────────────────
  function showTyping() {
    hideEmpty();
    const chatEl = document.getElementById("chat");
    const wrap = document.createElement("div");
    wrap.className = "msg-wrap";
    wrap.id = "typing-wrap";

    const avatar = document.createElement("div");
    avatar.className = "avatar bot";
    avatar.textContent = "💬";

    const ind = document.createElement("div");
    ind.className = "typing-indicator";
    ind.innerHTML = "<span></span><span></span><span></span>";

    wrap.appendChild(avatar);
    wrap.appendChild(ind);
    chatEl.appendChild(wrap);
    chatEl.scrollTop = chatEl.scrollHeight;

    // Loading state on send button
    const btn = document.getElementById("send-btn");
    if (btn) {
      btn.classList.add("loading");
      btn.textContent = "";
    }
  }

  function removeTyping() {
    const el = document.getElementById("typing-wrap");
    if (el) el.remove();

    // Restore send button
    const btn = document.getElementById("send-btn");
    if (btn) {
      btn.classList.remove("loading");
      btn.textContent = "➤";
    }
  }

  // ── Input Helpers ──────────────────────────────────────────
  function autoResize(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 110) + "px";
  }

  // ── Reset UI ───────────────────────────────────────────────
  function resetUI() {
    document.getElementById("chat").innerHTML = `
      <div class="empty-state" id="empty-state">
        <div class="empty-icon">💬</div>
        <div class="empty-title">Halo! Aku FinChat</div>
        <div class="empty-sub">Ceritain aja keuanganmu, aku yang catat 👇</div>
        <div class="empty-hints">
          <div class="empty-hint" onclick="handleSendText('makan siang 45rb')">
            <span class="hint-icon">🍜</span>
            <div><div class="hint-label">Catat pengeluaran</div><div class="hint-example">"makan siang 45rb"</div></div>
          </div>
          <div class="empty-hint" onclick="handleSendText('gaji masuk 8 juta')">
            <span class="hint-icon">💵</span>
            <div><div class="hint-label">Catat pemasukan</div><div class="hint-example">"gaji masuk 8 juta"</div></div>
          </div>
          <div class="empty-hint" onclick="handleSendText('laporan')">
            <span class="hint-icon">📊</span>
            <div><div class="hint-label">Lihat laporan</div><div class="hint-example">ketik "laporan" atau "grafik"</div></div>
          </div>
          <div class="empty-hint" onclick="handleSendText('kasih saran hemat pengeluaran saya')">
            <span class="hint-icon">🤖</span>
            <div><div class="hint-label">Minta saran AI</div><div class="hint-example">"kasih saran hemat pengeluaran"</div></div>
          </div>
        </div>
      </div>`;
    updateSummary(0, 0);
  }

  return {
    fmt,
    updateSummary,
    showToast,
    appendMessage,
    restoreHistory,
    showTyping,
    removeTyping,
    autoResize,
    resetUI,
  };
})();

// ── Utility: parse structured tag from text ─────────────────
function parseTag(tag, text) {
  // Support both FC_DATA and FINCHAT_DATA formats
  const aliases = {
    FC_DATA: "FINCHAT_DATA",
    FC_CHART: "FINCHAT_CHART",
    FINCHAT_DATA: "FC_DATA",
    FINCHAT_CHART: "FC_CHART",
  };
  const tags = [tag, aliases[tag]].filter(Boolean);
  for (const t of tags) {
    const re = new RegExp(`<${t}>[\\s\\S]*?<\\/${t}>`);
    const m = text.match(re);
    if (!m) continue;
    try {
      return JSON.parse(m[0].replace(/<[^>]+>/g, "").trim());
    } catch {}
  }
  return null;
}
