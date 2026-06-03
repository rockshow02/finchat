// ============================================================
//  FinChat — Cloud Backup via Google Drive
//  Simpan/restore backup ke Google Drive user
//  Tidak butuh backend — OAuth di client side
// ============================================================

const CloudBackup = (() => {
  const CLIENT_ID =
    "721719075269-mgs51uc4mcsv0qp9imn368lo06lblioc.apps.googleusercontent.com";
  const SCOPE = "https://www.googleapis.com/auth/drive.file";
  const FILE_NAME = "FinChat_CloudBackup.json";
  const LS_TOKEN = "finchat_gdrive_token";
  const LS_FILE_ID = "finchat_gdrive_file_id";

  let _tokenClient = null;
  let _accessToken = null;

  // ── Load Google Identity Services ────────────────────────
  function _loadGIS() {
    return new Promise((resolve) => {
      if (window.google?.accounts) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.onload = resolve;
      document.head.appendChild(script);
    });
  }

  // ── Init token client ─────────────────────────────────────
  async function _initTokenClient() {
    await _loadGIS();
    return new Promise((resolve) => {
      _tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (response) => {
          if (response.error) {
            resolve(null);
            return;
          }
          _accessToken = response.access_token;
          // Simpan token sementara
          localStorage.setItem(
            LS_TOKEN,
            JSON.stringify({
              token: response.access_token,
              expires: Date.now() + response.expires_in * 1000,
            }),
          );
          resolve(response.access_token);
        },
      });
      resolve(_tokenClient);
    });
  }

  // ── Dapatkan token (cek cache dulu) ──────────────────────
  async function _getToken() {
    // Cek cache
    try {
      const cached = JSON.parse(localStorage.getItem(LS_TOKEN) || "{}");
      if (cached.token && cached.expires > Date.now() + 60000) {
        _accessToken = cached.token;
        return cached.token;
      }
    } catch {}

    // Request token baru
    await _initTokenClient();
    return new Promise((resolve) => {
      _tokenClient.callback = (response) => {
        if (response.error) {
          resolve(null);
          return;
        }
        _accessToken = response.access_token;
        localStorage.setItem(
          LS_TOKEN,
          JSON.stringify({
            token: response.access_token,
            expires: Date.now() + response.expires_in * 1000,
          }),
        );
        resolve(response.access_token);
      };
      _tokenClient.requestAccessToken({ prompt: "" });
    });
  }

  // ── Cari file backup yang sudah ada ──────────────────────
  async function _findBackupFile(token) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${FILE_NAME}'+and+trashed=false&fields=files(id,name,modifiedTime)`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = await res.json();
    return data.files?.[0] || null;
  }

  // ── Upload backup ke Drive ────────────────────────────────
  async function backup() {
    _renderModal("loading", "Menghubungkan ke Google Drive...");
    document.getElementById("cloud-backup-modal").classList.add("open");

    try {
      const token = await _getToken();
      if (!token) {
        _renderModal("error", "Login Google dibatalkan.");
        return;
      }

      _renderModal("loading", "Menyiapkan data backup...");

      // Siapkan data backup
      const backupData = {
        version: "1.1",
        exported_at: new Date().toISOString(),
        device: navigator.userAgent.substring(0, 50),
        financial: App.getFinancial(),
        messages: App.getMessages(),
        budgets: JSON.parse(localStorage.getItem("finchat_budgets") || "{}"),
        goals: JSON.parse(localStorage.getItem("finchat_goals") || "[]"),
        categories: JSON.parse(
          localStorage.getItem("finchat_categories") || "[]",
        ),
        streak: JSON.parse(localStorage.getItem("finchat_streak") || "{}"),
      };

      const json = JSON.stringify(backupData, null, 2);
      const blob = new Blob([json], { type: "application/json" });

      _renderModal("loading", "Mengupload ke Google Drive...");

      // Cek apakah sudah ada file backup sebelumnya
      const existing = await _findBackupFile(token);
      const fileId = existing?.id || localStorage.getItem(LS_FILE_ID);

      let uploadRes;
      if (fileId) {
        // Update file yang ada
        uploadRes = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: json,
          },
        );
      } else {
        // Buat file baru dengan metadata
        const form = new FormData();
        form.append(
          "metadata",
          new Blob(
            [
              JSON.stringify({
                name: FILE_NAME,
                mimeType: "application/json",
                parents: ["root"],
              }),
            ],
            { type: "application/json" },
          ),
        );
        form.append("file", blob);

        uploadRes = await fetch(
          "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          },
        );
      }

      const uploaded = await uploadRes.json();
      if (uploaded.id) {
        localStorage.setItem(LS_FILE_ID, uploaded.id);
        const txCount = backupData.financial.transactions?.length || 0;
        _renderModal(
          "success",
          `✅ Backup berhasil!\n\n` +
            `📁 File: ${FILE_NAME}\n` +
            `🧾 ${txCount} transaksi tersimpan\n` +
            `📅 ${new Date().toLocaleString("id-ID")}`,
        );
      } else {
        throw new Error(JSON.stringify(uploaded));
      }
    } catch (e) {
      console.error("[CloudBackup]", e);
      _renderModal("error", "⚠️ Backup gagal. Coba lagi.");
    }
  }

  // ── Restore dari Drive ────────────────────────────────────
  async function restore() {
    _renderModal("loading", "Menghubungkan ke Google Drive...");

    try {
      const token = await _getToken();
      if (!token) {
        _renderModal("error", "Login dibatalkan.");
        return;
      }

      _renderModal("loading", "Mencari file backup...");
      const file = await _findBackupFile(token);

      if (!file) {
        _renderModal(
          "error",
          "❌ Tidak ada file backup di Google Drive.\n\nLakukan backup dulu dari perangkat utama.",
        );
        return;
      }

      _renderModal(
        "loading",
        `Mengunduh backup (${new Date(file.modifiedTime).toLocaleString("id-ID")})...`,
      );

      const dlRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await dlRes.json();

      if (!data.financial) throw new Error("Format tidak valid");

      // Restore semua data
      App.clear();
      App.applyFinData({
        ...data.financial,
        income_total: data.financial.income,
        expense_total: data.financial.expense,
      });
      if (data.messages) data.messages.forEach((m) => App.pushMessage(m));
      if (data.budgets)
        localStorage.setItem("finchat_budgets", JSON.stringify(data.budgets));
      if (data.goals)
        localStorage.setItem("finchat_goals", JSON.stringify(data.goals));
      if (data.categories)
        localStorage.setItem(
          "finchat_categories",
          JSON.stringify(data.categories),
        );
      if (data.streak)
        localStorage.setItem("finchat_streak", JSON.stringify(data.streak));
      App.save();

      Chat.resetUI();
      Chat.updateSummary(App.getFinancial().income, App.getFinancial().expense);
      Chat.restoreHistory();

      const txCount = data.financial.transactions?.length || 0;
      const backupDate = new Date(data.exported_at).toLocaleString("id-ID");
      _renderModal(
        "success",
        `✅ Restore berhasil!\n\n` +
          `🧾 ${txCount} transaksi dipulihkan\n` +
          `📅 Backup dari: ${backupDate}\n` +
          `💻 Device: ${data.device || "Tidak diketahui"}`,
      );

      localStorage.setItem(LS_FILE_ID, file.id);
    } catch (e) {
      console.error("[CloudBackup]", e);
      _renderModal("error", "⚠️ Restore gagal. File mungkin rusak.");
    }
  }

  // ── Logout Google ─────────────────────────────────────────
  function logout() {
    if (_accessToken) {
      google.accounts.oauth2.revoke(_accessToken, () => {});
      _accessToken = null;
    }
    localStorage.removeItem(LS_TOKEN);
    Chat.showToast("✅ Keluar dari Google Drive");
    closeModal();
  }

  // ── Modal ─────────────────────────────────────────────────
  function openModal() {
    _renderModal("home");
    document.getElementById("cloud-backup-modal").classList.add("open");
  }

  function closeModal() {
    document.getElementById("cloud-backup-modal").classList.remove("open");
  }

  function _renderModal(state, message = "") {
    const el = document.getElementById("cloud-backup-body");
    if (!el) return;

    const isLoggedIn = !!localStorage.getItem(LS_TOKEN);
    const fileId = localStorage.getItem(LS_FILE_ID);

    if (state === "loading") {
      el.innerHTML = `
        <div class="story-loading" style="padding:30px 0">
          <div class="story-loading-dots"><span></span><span></span><span></span></div>
          <div style="font-size:13px;color:var(--muted2);margin-top:10px">${message}</div>
        </div>`;
      return;
    }

    if (state === "success") {
      el.innerHTML = `
        <div style="text-align:center;padding:16px 0">
          <div style="font-size:40px;margin-bottom:12px">✅</div>
          <div style="font-size:13px;color:var(--text);white-space:pre-line;line-height:1.8">${message}</div>
          <button class="modal-btn excel" style="margin-top:16px;width:100%" onclick="CloudBackup.closeModal()">Tutup</button>
        </div>`;
      return;
    }

    if (state === "error") {
      el.innerHTML = `
        <div style="text-align:center;padding:16px 0">
          <div style="font-size:36px;margin-bottom:12px">⚠️</div>
          <div style="font-size:13px;color:var(--text);white-space:pre-line;line-height:1.8">${message}</div>
          <button class="modal-btn cancel" style="margin-top:16px;width:100%" onclick="CloudBackup._renderModal('home')">Kembali</button>
        </div>`;
      return;
    }

    // Home state
    el.innerHTML = `
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:40px;margin-bottom:8px">☁️</div>
        <div style="font-size:13px;color:var(--muted2);line-height:1.6">
          Simpan data ke Google Drive kamu.<br>
          Bisa di-restore di perangkat lain kapan saja.
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px">
        <button class="modal-btn excel" style="width:100%;padding:14px;font-size:14px"
          onclick="CloudBackup.backup()">
          ☁️ Backup ke Google Drive
        </button>
        <button class="modal-btn cancel" style="width:100%;padding:14px;font-size:14px"
          onclick="CloudBackup.restore()">
          📥 Restore dari Google Drive
        </button>
      </div>

      ${
        fileId
          ? `
      <div style="margin-top:14px;font-size:11px;color:var(--muted2);text-align:center">
        📁 File backup sudah ada di Drive
      </div>`
          : ""
      }

      ${
        isLoggedIn
          ? `
      <button onclick="CloudBackup.logout()"
        style="width:100%;margin-top:10px;background:transparent;border:none;color:var(--muted);font-size:12px;cursor:pointer;padding:6px">
        Keluar dari Google Drive
      </button>`
          : ""
      }`;
  }

  return { backup, restore, logout, openModal, closeModal, _renderModal };
})();
