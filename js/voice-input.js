// ============================================================
//  FinChat — Voice Transaction (Premium)
//  Web Speech API — 0 token untuk capture suara
// ============================================================

const VoiceInput = (() => {
  let _recognition = null;
  let _isListening = false;

  // ── Cek support ───────────────────────────────────────────
  function isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  // ── Init recognition ──────────────────────────────────────
  function _init() {
    if (_recognition) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    _recognition = new SR();
    _recognition.lang = "id-ID"; // Bahasa Indonesia
    _recognition.continuous = false; // Stop setelah selesai bicara
    _recognition.interimResults = true; // Tampilkan hasil sementara
    _recognition.maxAlternatives = 1;

    // Saat ada hasil interim (sementara)
    _recognition.onresult = (event) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += transcript;
        else interim += transcript;
      }

      const input = document.getElementById("input");
      if (input) {
        input.value = final || interim;
        Chat.autoResize(input);
        _updateBtn(final ? "done" : "listening");
      }

      if (final) {
        _normalizeNumbers(input);
        stop();
      }
    };

    _recognition.onerror = (event) => {
      console.warn("[Voice] Error:", event.error);
      stop();
      const msgs = {
        "not-allowed":
          "🎤 Izin mikrofon ditolak. Aktifkan di pengaturan browser.",
        "no-speech": "🎤 Tidak terdengar suara. Coba lagi!",
        network: "🎤 Gagal konek. Cek koneksi internet.",
        "audio-capture": "🎤 Mikrofon tidak ditemukan.",
        aborted: null, // user cancel, tidak perlu toast
      };
      const msg = msgs[event.error];
      if (msg) Chat.showToast(msg);
    };

    _recognition.onend = () => {
      if (_isListening) stop();
    };
  }

  // ── Normalisasi angka dari speech ke teks ─────────────────
  // "empat puluh lima ribu" → "45rb"
  // Web Speech API di id-ID kadang return angka langsung, kadang teks
  function _normalizeNumbers(input) {
    if (!input) return;
    let text = input.value;

    // Kalau sudah angka, tidak perlu proses
    if (/\d/.test(text)) return;

    const NUMBERS = {
      nol: 0,
      satu: 1,
      dua: 2,
      tiga: 3,
      empat: 4,
      lima: 5,
      enam: 6,
      tujuh: 7,
      delapan: 8,
      sembilan: 9,
      sepuluh: 10,
      sebelas: 11,
      "dua belas": 12,
      "tiga belas": 13,
      "empat belas": 14,
      "lima belas": 15,
      "enam belas": 16,
      "tujuh belas": 17,
      "delapan belas": 18,
      "sembilan belas": 19,
      "dua puluh": 20,
      "tiga puluh": 30,
      "empat puluh": 40,
      "lima puluh": 50,
      "enam puluh": 60,
      "tujuh puluh": 70,
      "delapan puluh": 80,
      "sembilan puluh": 90,
      seratus: 100,
      "dua ratus": 200,
      "lima ratus": 500,
      seribu: 1000,
      "dua ribu": 2000,
      "lima ribu": 5000,
      "sepuluh ribu": 10000,
      "lima puluh ribu": 50000,
      "seratus ribu": 100000,
      "satu juta": 1000000,
    };

    // Ganti kata angka dengan nilai
    let lower = text.toLowerCase();
    Object.entries(NUMBERS)
      .sort((a, b) => b[0].length - a[0].length) // longer first
      .forEach(([word, val]) => {
        lower = lower.replace(new RegExp(`\\b${word}\\b`, "gi"), ` ${val} `);
      });

    // Handle "ribu" dan "juta"
    lower = lower
      .replace(/(\d+)\s*ribu/gi, (_, n) => parseInt(n) * 1000)
      .replace(/(\d+)\s*ratus/gi, (_, n) => parseInt(n) * 100)
      .replace(/(\d+)\s*juta/gi, (_, n) => parseInt(n) * 1000000)
      .replace(/\s+/g, " ")
      .trim();

    input.value = lower;
    Chat.autoResize(input);
  }

  // ── Start listening ───────────────────────────────────────
  function start() {
    if (!isSupported()) {
      Chat.showToast("⚠️ Browser tidak support voice input. Gunakan Chrome.");
      return;
    }

    if (_isListening) {
      stop();
      return;
    }

    _init();
    if (!_recognition) return;

    try {
      _recognition.start();
      _isListening = true;
      _updateBtn("listening");
      Chat.showToast("🎤 Mulai bicara...", 2000);

      // Auto stop setelah 10 detik kalau tidak ada hasil
      setTimeout(() => {
        if (_isListening) stop();
      }, 10000);
    } catch (e) {
      console.warn("[Voice] Start error:", e);
      Chat.showToast("🎤 Gagal mulai. Coba lagi!");
      _isListening = false;
    }
  }

  function stop() {
    _isListening = false;
    if (_recognition) {
      try {
        _recognition.stop();
      } catch {}
    }
    _updateBtn("idle");
  }

  // ── Update tampilan tombol ─────────────────────────────────
  function _updateBtn(state) {
    const btn = document.getElementById("voice-btn");
    if (!btn) return;

    const states = {
      idle: { text: "🎤", title: "Voice input", cls: "" },
      listening: { text: "⏹", title: "Stop recording", cls: "voice-listening" },
      done: { text: "✅", title: "Done", cls: "" },
    };

    const s = states[state] || states.idle;
    btn.textContent = s.text;
    btn.title = s.title;
    btn.className = `voice-btn ${s.cls}`.trim();
  }

  return { isSupported, start, stop };
})();
