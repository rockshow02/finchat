// ============================================================
//  FinChat — Push Notification (PWA)
//  Pengingat catat harian via Service Worker
//  0 token — murni lokal
// ============================================================

const PushNotif = (() => {
  const LS_ENABLED = "finchat_notif_enabled";
  const LS_NOTIF_TIME = "finchat_notif_time";
  const DEFAULT_HOUR = 21; // jam 9 malam default

  // ── Cek support ───────────────────────────────────────────
  function isSupported() {
    return "Notification" in window && "serviceWorker" in navigator;
  }

  function isEnabled() {
    return localStorage.getItem(LS_ENABLED) === "1";
  }

  function getNotifTime() {
    return parseInt(localStorage.getItem(LS_NOTIF_TIME) || DEFAULT_HOUR);
  }

  // ── Request permission ────────────────────────────────────
  async function requestPermission() {
    if (!isSupported()) {
      Chat.showToast("⚠️ Browser ini tidak support notifikasi");
      return false;
    }
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") {
      Chat.showToast("🔕 Notifikasi diblokir. Aktifkan di pengaturan browser.");
      return false;
    }
    const result = await Notification.requestPermission();
    return result === "granted";
  }

  // ── Enable notifikasi ─────────────────────────────────────
  async function enable(hour = DEFAULT_HOUR) {
    const granted = await requestPermission();
    if (!granted) return false;

    localStorage.setItem(LS_ENABLED, "1");
    localStorage.setItem(LS_NOTIF_TIME, hour);
    _scheduleDaily();
    Chat.showToast(`🔔 Notifikasi aktif — reminder jam ${hour}:00`);
    return true;
  }

  function disable() {
    localStorage.setItem(LS_ENABLED, "0");
    Chat.showToast("🔕 Notifikasi dimatikan");
    _updateSettingsUI();
  }

  // ── Cek apakah sudah catat hari ini ──────────────────────
  function _hasCatatToday() {
    const { transactions } = App.getFinancial();
    if (transactions.length === 0) return false;
    const today = new Date().toDateString();
    return transactions.some((tx) => {
      const txDate = tx.date ? new Date(tx.date).toDateString() : null;
      return txDate === today;
    });
  }

  // ── Kirim notifikasi ──────────────────────────────────────
  function _sendNotif() {
    if (!isEnabled()) return;
    if (Notification.permission !== "granted") return;
    if (_hasCatatToday()) return; // sudah catat, tidak perlu reminder

    const messages = [
      {
        title: "💰 Jangan lupa catat keuanganmu!",
        body: "Kamu belum catat transaksi hari ini. Yuk luangkan 1 menit!",
      },
      {
        title: "📝 FinChat menunggu catatanmu",
        body: "Pengeluaran hari ini sudah dicatat belum? Biar tidak lupa!",
      },
      {
        title: "🎯 Konsistensi adalah kunci!",
        body: "Catat transaksi hari ini untuk menjaga streak keuanganmu.",
      },
      {
        title: "💡 1 menit untuk keuangan lebih baik",
        body: "Yuk catat transaksi hari ini sebelum lupa!",
      },
    ];

    const msg = messages[Math.floor(Math.random() * messages.length)];

    // Kirim via Service Worker (supaya muncul meski tab tertutup)
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "SHOW_NOTIFICATION",
        title: msg.title,
        body: msg.body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-72.png",
        tag: "finchat-daily-reminder",
        data: { url: "/" },
      });
    } else {
      // Fallback: notif langsung dari halaman
      new Notification(msg.title, {
        body: msg.body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-72.png",
        tag: "finchat-daily-reminder",
      });
    }
  }

  // ── Schedule daily reminder ───────────────────────────────
  function _scheduleDaily() {
    if (!isEnabled()) return;

    const now = new Date();
    const hour = getNotifTime();
    const target = new Date();
    target.setHours(hour, 0, 0, 0);

    // Kalau jam target sudah lewat hari ini → schedule besok
    if (now > target) target.setDate(target.getDate() + 1);

    const delay = target - now;

    setTimeout(() => {
      _sendNotif();
      // Schedule lagi untuk hari berikutnya (24 jam)
      setInterval(_sendNotif, 24 * 60 * 60 * 1000);
    }, delay);

    console.log(`[PushNotif] Scheduled for ${target.toLocaleString("id-ID")}`);
  }

  // ── Init saat app load ────────────────────────────────────
  function init() {
    if (!isSupported()) return;
    if (isEnabled() && Notification.permission === "granted") {
      _scheduleDaily();
    }
    _updateSettingsUI();
  }

  // ── Update UI toggle di settings ─────────────────────────
  function _updateSettingsUI() {
    const toggle = document.getElementById("notif-toggle");
    const status = document.getElementById("notif-status");
    if (!toggle) return;

    const enabled = isEnabled() && Notification.permission === "granted";
    toggle.checked = enabled;
    if (status) {
      status.textContent = enabled
        ? `Aktif — reminder jam ${getNotifTime()}:00`
        : Notification.permission === "denied"
          ? "Diblokir browser"
          : "Nonaktif";
      status.style.color = enabled ? "var(--green)" : "var(--muted2)";
    }
  }

  // ── Modal settings notifikasi ─────────────────────────────
  function openSettings() {
    _renderSettings();
    document.getElementById("notif-modal").classList.add("open");
  }

  function closeSettings() {
    document.getElementById("notif-modal").classList.remove("open");
  }

  function _renderSettings() {
    const supported = isSupported();
    const permission = supported ? Notification.permission : "unsupported";
    const enabled = isEnabled() && permission === "granted";
    const hour = getNotifTime();

    document.getElementById("notif-settings-body").innerHTML = `
      ${
        !supported
          ? `
        <div class="notif-unsupported">
          <div style="font-size:32px;margin-bottom:8px">😔</div>
          <div style="font-size:13px;color:var(--text);font-weight:500">Browser tidak support</div>
          <div style="font-size:12px;color:var(--muted2);margin-top:4px">
            Gunakan Chrome atau Edge di desktop/Android untuk notifikasi push.
          </div>
        </div>`
          : `

        <!-- Status -->
        <div class="notif-status-card ${enabled ? "active" : ""}">
          <div style="font-size:24px">${enabled ? "🔔" : "🔕"}</div>
          <div>
            <div style="font-size:13px;font-weight:500;color:var(--text)">
              ${enabled ? "Notifikasi Aktif" : permission === "denied" ? "Notifikasi Diblokir" : "Notifikasi Nonaktif"}
            </div>
            <div style="font-size:11px;color:var(--muted2);margin-top:2px">
              ${
                enabled
                  ? `Reminder setiap hari jam ${hour}:00`
                  : permission === "denied"
                    ? "Aktifkan di pengaturan browser → izin notifikasi"
                    : "Aktifkan untuk reminder harian"
              }
            </div>
          </div>
        </div>

        ${
          permission !== "denied"
            ? `
        <!-- Toggle & Waktu -->
        <div style="margin:16px 0">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <span style="font-size:13px;color:var(--text)">Aktifkan pengingat harian</span>
            <label class="notif-switch">
              <input type="checkbox" id="notif-toggle-input" ${enabled ? "checked" : ""}
                onchange="PushNotif.handleToggle(this.checked)">
              <span class="notif-slider"></span>
            </label>
          </div>

          ${
            enabled
              ? `
          <div style="margin-top:10px">
            <div style="font-size:12px;color:var(--muted2);margin-bottom:6px">Waktu pengingat:</div>
            <select id="notif-hour-select" class="edit-input" onchange="PushNotif.updateTime(this.value)"
              style="width:100%">
              ${[7, 8, 9, 10, 18, 19, 20, 21, 22]
                .map(
                  (h) =>
                    `<option value="${h}" ${h === hour ? "selected" : ""}>
                  ${h < 12 ? `${h}:00 pagi` : h === 12 ? "12:00 siang" : `${h - 12 > 0 ? h - 12 : h}:00 ${h >= 12 ? "malam/sore" : ""}`}
                </option>`,
                )
                .join("")}
            </select>
          </div>

          <!-- Test notifikasi -->
          <button class="story-regen-btn" style="margin-top:12px"
            onclick="PushNotif.sendTest()">
            🔔 Test notifikasi sekarang
          </button>`
              : ""
          }
        </div>`
            : `
        <div style="margin-top:12px;font-size:12px;color:var(--muted2);text-align:center;line-height:1.6">
          Untuk mengaktifkan kembali, buka pengaturan browser →<br>
          Privacy & Security → Site Settings → Notifications
        </div>`
        }
      `
      }`;
  }

  async function handleToggle(checked) {
    if (checked) {
      const granted = await enable(getNotifTime());
      if (!granted) {
        document.getElementById("notif-toggle-input").checked = false;
      }
    } else {
      disable();
    }
    _renderSettings();
  }

  function updateTime(hour) {
    localStorage.setItem(LS_NOTIF_TIME, parseInt(hour));
    _scheduleDaily();
    Chat.showToast(`⏰ Waktu reminder diubah ke jam ${hour}:00`);
  }

  function sendTest() {
    if (Notification.permission !== "granted") {
      Chat.showToast("⚠️ Notifikasi belum diizinkan");
      return;
    }
    new Notification("🔔 Test FinChat Notification", {
      body: "Notifikasi berfungsi dengan baik! Kamu akan diingatkan setiap hari.",
      icon: "/icons/icon-192.png",
      tag: "finchat-test",
    });
    Chat.showToast("✅ Test notifikasi terkirim!");
  }

  return {
    isSupported,
    isEnabled,
    init,
    enable,
    disable,
    requestPermission,
    openSettings,
    closeSettings,
    handleToggle,
    updateTime,
    sendTest,
  };
})();
