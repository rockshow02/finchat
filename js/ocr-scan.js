// ============================================================
//  FinChat — OCR Scan Struk (Premium)
//  Foto struk → ekstrak transaksi via Claude Vision
//  Token hemat: resize gambar + prompt singkat
// ============================================================

const OCRScan = (() => {
  // ── Resize gambar sebelum kirim ke API ───────────────────
  // Max 800px — cukup untuk baca teks struk
  function _resizeImage(file, maxSize = 800) {
    return new Promise((resolve) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        img.src = e.target.result;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let { width, height } = img;

          // Hitung ukuran baru
          if (width > height && width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }

          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);

          // Kompres ke JPEG 0.8
          const base64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
          resolve({ base64, width, height });
        };
      };
      reader.readAsDataURL(file);
    });
  }

  // ── Scan struk via Claude Vision ─────────────────────────
  async function scan(file) {
    if (!file) return;

    // Validasi file
    if (!file.type.startsWith("image/")) {
      Chat.showToast("⚠️ File harus berupa gambar (JPG, PNG, dll)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      Chat.showToast("⚠️ Ukuran gambar max 10MB");
      return;
    }

    // Tampilkan loading di chat
    Chat.appendMessage("user", `📷 Scan struk: ${file.name}`);
    App.pushMessage({ role: "user", content: `📷 Scan struk: ${file.name}` });
    Chat.showTyping();

    try {
      // Resize dulu
      const { base64 } = await _resizeImage(file);

      // Kirim ke Claude Vision
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CONFIG.MODEL,
          max_tokens: 400,
          system:
            "Kamu asisten keuangan FinChat. Ekstrak data transaksi dari struk dengan akurat.",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/jpeg",
                    data: base64,
                  },
                },
                {
                  type: "text",
                  text: `Baca struk ini dan ekstrak informasi berikut dalam JSON:
{
  "toko": "nama toko/merchant",
  "tanggal": "tanggal struk (format: DD Bulan YYYY)",
  "items": [{"nama": "nama item", "harga": angka}],
  "total": angka total belanja,
  "kategori": "kategori yang paling sesuai dari: Makan & Minum, Belanja, Transport, Tagihan, Kesehatan, Hiburan, Lainnya"
}

Kalau ada info yang tidak jelas, isi dengan null. Balas HANYA dengan JSON, tanpa penjelasan tambahan.`,
                },
              ],
            },
          ],
        }),
      });

      Chat.removeTyping();
      const data = await res.json();
      const reply = data?.content?.[0]?.text;
      if (data.usage)
        TokenCounter.track(data.usage.input_tokens, data.usage.output_tokens);

      if (!reply) throw new Error("Empty response");

      // Parse JSON dari response
      let parsed;
      try {
        const clean = reply.replace(/```json|```/g, "").trim();
        parsed = JSON.parse(clean);
      } catch {
        throw new Error("Gagal parse response");
      }

      // Tampilkan konfirmasi ke user
      _showConfirmation(parsed, file.name);
    } catch (e) {
      Chat.removeTyping();
      const reply = "⚠️ Gagal baca struk. Pastikan gambar jelas dan coba lagi.";
      Chat.appendMessage("bot", reply);
      App.pushMessage({ role: "assistant", content: reply });
      App.save();
      console.error("[OCR]", e);
    }
  }

  // ── Tampilkan konfirmasi hasil scan ──────────────────────
  function _showConfirmation(data, filename) {
    const fmt = Chat.fmt;
    const total = data.total || 0;
    const toko = data.toko || "Tidak diketahui";
    const tgl =
      data.tanggal ||
      new Date().toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    const items = data.items || [];
    const cat = data.kategori || "Belanja";

    // Build summary teks
    const itemsText =
      items.length > 0
        ? items
            .slice(0, 5)
            .map((i) => `  • ${i.nama}: ${fmt(i.harga || 0)}`)
            .join("\n")
        : "  (detail item tidak terbaca)";

    const reply =
      `📷 **Hasil Scan Struk**\n\n` +
      `🏪 Toko: **${toko}**\n` +
      `📅 Tanggal: ${tgl}\n` +
      `🏷️ Kategori: ${cat}\n\n` +
      `**Item:**\n${itemsText}\n\n` +
      `💰 **Total: ${fmt(total)}**`;

    Chat.appendMessage("bot", reply);
    App.pushMessage({ role: "assistant", content: reply });

    if (total > 0) {
      // Auto-show konfirmasi transaksi
      setTimeout(() => {
        Confirm.show({
          intent: "expense",
          data: {
            label:
              toko !== "Tidak diketahui" ? `Belanja di ${toko}` : "Scan Struk",
            amount: total,
            category: cat,
            date: tgl,
          },
        });
      }, 500);
    }

    App.save();
  }

  // ── Buka file picker ──────────────────────────────────────
  function openPicker() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    // Tidak pakai capture — biar user bisa pilih kamera atau galeri
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) scan(file);
    };
    input.click();
  }

  // ── Paste dari clipboard ──────────────────────────────────
  function handlePaste(event) {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          scan(file);
          event.preventDefault();
        }
        return;
      }
    }
  }

  return { scan, openPicker, handlePaste };
})();
