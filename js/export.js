// ============================================================
//  FinChat — Export
//  Export laporan ke Excel (.xlsx) dan PDF
// ============================================================

const Exporter = (() => {
  // ── Modal ──────────────────────────────────────────────────
  function openModal() {
    document.getElementById("export-modal").classList.add("open");
    // Tampilkan info kuota PDF
    const quotaEl = document.getElementById("pdf-quota-info");
    if (quotaEl) {
      if (Features.isPremium()) {
        quotaEl.innerHTML = "✨ Premium — Export PDF unlimited";
        quotaEl.style.color = "var(--green)";
      } else {
        const { count } = _getPDFUsage();
        const sisa = PDF_LIMIT - count;
        if (sisa <= 0) {
          quotaEl.innerHTML = `🔒 Limit PDF bulan ini tercapai (${PDF_LIMIT}/${PDF_LIMIT}). Upgrade untuk unlimited.`;
          quotaEl.style.color = "var(--red)";
        } else {
          quotaEl.innerHTML = `📄 Sisa export PDF bulan ini: <strong>${sisa}x</strong> dari ${PDF_LIMIT}x`;
          quotaEl.style.color = "var(--muted2)";
        }
      }
    }
  }
  function closeModal() {
    document.getElementById("export-modal").classList.remove("open");
  }

  // ── Shared Helpers ─────────────────────────────────────────
  function _getCategories(transactions) {
    const cats = {};
    transactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        const cat = t.category || "Lainnya";
        cats[cat] = (cats[cat] || 0) + (t.amount || 0);
      });
    return cats;
  }

  function _now() {
    const d = new Date();
    return {
      date: d.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
      filestamp: `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`,
    };
  }

  // ── Excel Export ───────────────────────────────────────────
  function toExcel() {
    closeModal();
    const { transactions, income, expense } = App.getFinancial();

    if (transactions.length === 0) {
      Chat.showToast("⚠️ Belum ada transaksi yang dicatat!");
      return;
    }

    const { date, filestamp } = _now();
    const wb = XLSX.utils.book_new();

    // Sheet 1 — Transaksi
    const rows = [
      ["No", "Keterangan", "Kategori", "Tipe", "Jumlah (Rp)", "Tanggal"],
    ];
    transactions.forEach((tx, i) =>
      rows.push([
        i + 1,
        tx.label || "-",
        tx.category || "-",
        tx.type === "income" ? "Pemasukan" : "Pengeluaran",
        tx.amount || 0,
        tx.date && tx.date !== "hari ini" ? tx.date : date,
      ]),
    );

    // Hitung total langsung (tanpa formula agar tidak jadi teks)
    const totalIncome = transactions
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + (t.amount || 0), 0);
    const totalExpense = transactions
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + (t.amount || 0), 0);
    const totalBalance = totalIncome - totalExpense;

    rows.push(["", "", "", "", "", ""]);
    rows.push(["", "", "", "Total Pemasukan", totalIncome, ""]);
    rows.push(["", "", "", "Total Pengeluaran", totalExpense, ""]);
    rows.push(["", "", "", "Saldo", totalBalance, ""]);

    const ws1 = XLSX.utils.aoa_to_sheet(rows);
    ws1["!cols"] = [
      { wch: 5 },
      { wch: 28 },
      { wch: 16 },
      { wch: 16 },
      { wch: 18 },
      { wch: 16 },
    ];

    // Style total rows — bold
    const totalStartRow = transactions.length + 2; // 0-indexed
    ["D", "E"].forEach((col) => {
      [
        totalStartRow,
        totalStartRow + 1,
        totalStartRow + 2,
        totalStartRow + 3,
      ].forEach((r) => {
        const cellRef = col + (r + 1);
        if (ws1[cellRef]) ws1[cellRef].s = { font: { bold: true } };
      });
    });

    XLSX.utils.book_append_sheet(wb, ws1, "Transaksi");

    // Sheet 2 — Ringkasan
    const cats = _getCategories(transactions);
    const balance = income - expense;
    const summary = [
      ["LAPORAN KEUANGAN FINCHAT"],
      ["Dibuat pada", date],
      [""],
      ["Ringkasan", ""],
      ["Total Pemasukan", income],
      ["Total Pengeluaran", expense],
      ["Saldo Akhir", balance],
      [""],
      ["Pengeluaran per Kategori", ""],
      ...Object.entries(cats)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => [k, v]),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(summary);
    ws2["!cols"] = [{ wch: 26 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Ringkasan");

    XLSX.writeFile(wb, `FinChat_Laporan_${filestamp}.xlsx`);
    Chat.showToast("✅ Excel berhasil didownload!");
  }

  // ── PDF Export ─────────────────────────────────────────────
  const PDF_LIMIT = 3;
  const LS_PDF_COUNT = "finchat_pdf_count";

  function _getPDFUsage() {
    try {
      const data = JSON.parse(localStorage.getItem(LS_PDF_COUNT) || "{}");
      const now = new Date();
      const key = `${now.getFullYear()}-${now.getMonth()}`;
      return { count: data[key] || 0, key };
    } catch {
      return { count: 0, key: "" };
    }
  }

  function _incrementPDFCount() {
    try {
      const { count, key } = _getPDFUsage();
      const data = JSON.parse(localStorage.getItem(LS_PDF_COUNT) || "{}");
      data[key] = count + 1;
      localStorage.setItem(LS_PDF_COUNT, JSON.stringify(data));
    } catch {}
  }

  async function toPDF() {
    closeModal();

    // Cek limit PDF untuk free user
    if (!Features.isPremium()) {
      const { count } = _getPDFUsage();
      if (count >= PDF_LIMIT) {
        Chat.showToast(
          `🔒 Limit ${PDF_LIMIT}x export PDF/bulan tercapai. Upgrade ke Premium!`,
        );
        return;
      }
    }

    const { transactions, income, expense } = App.getFinancial();

    if (transactions.length === 0) {
      Chat.showToast("⚠️ Belum ada transaksi yang dicatat!");
      return;
    }

    Chat.showToast("📄 Membuat PDF...", 4000);

    const { date, filestamp } = _now();
    const balance = income - expense;
    const cats = _getCategories(transactions);
    const lastChart = App.getLastChart();
    const fmt = Chat.fmt;

    // Build chart image if available
    let chartImgSrc = null;
    if (lastChart) {
      const chartCanvas = await ChartRenderer.buildStaticCanvas(lastChart);
      chartImgSrc = chartCanvas.toDataURL("image/png");
    }

    // Build hidden render area
    const render = document.getElementById("pdf-render");
    render.innerHTML = _buildPDFHtml({
      date,
      balance,
      income,
      expense,
      cats,
      transactions,
      fmt,
      chartImgSrc,
      lastChart,
    });

    await new Promise((r) => setTimeout(r, 200));

    try {
      const { jsPDF } = window.jspdf;
      const canvas = await html2canvas(render, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;

      let remaining = imgH;
      let page = 0;

      while (remaining > 0) {
        if (page > 0) pdf.addPage();
        const sliceH = Math.min(remaining, pageH);
        const sy = page * pageH * (canvas.height / imgH);
        const sHeight = sliceH * (canvas.height / imgH);

        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = sHeight;
        slice
          .getContext("2d")
          .drawImage(
            canvas,
            0,
            sy,
            canvas.width,
            sHeight,
            0,
            0,
            canvas.width,
            sHeight,
          );

        pdf.addImage(
          slice.toDataURL("image/jpeg", 0.95),
          "JPEG",
          0,
          0,
          pageW,
          sliceH,
        );
        remaining -= sliceH;
        page++;
      }

      pdf.save(`FinChat_Laporan_${filestamp}.pdf`);
      _incrementPDFCount();
      if (!Features.isPremium()) {
        const { count } = _getPDFUsage();
        const sisa = PDF_LIMIT - count;
        Chat.showToast(`✅ PDF berhasil! (sisa ${sisa}x bulan ini)`);
      } else {
        Chat.showToast("✅ PDF berhasil didownload!");
      }
    } catch (e) {
      console.error("[FinChat] PDF error:", e);
      Chat.showToast("❌ Gagal membuat PDF, coba lagi.");
    } finally {
      render.innerHTML = "";
    }
  }

  // ── PDF HTML Template ──────────────────────────────────────
  function _buildPDFHtml({
    date,
    balance,
    income,
    expense,
    cats,
    transactions,
    fmt,
    chartImgSrc,
    lastChart,
  }) {
    const catRows = Object.entries(cats)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([k, v], i) => `
      <tr style="background:${i % 2 === 0 ? "#fff" : "#fafafa"}">
        <td style="padding:8px 10px;color:#333">${k}</td>
        <td style="padding:8px 10px;text-align:right;color:#333;font-weight:500">${fmt(v)}</td>
        <td style="padding:8px 10px;text-align:right;color:#7c6aff">
          ${expense > 0 ? ((v / expense) * 100).toFixed(1) : "0"}%
        </td>
      </tr>`,
      )
      .join("");

    const txRows = transactions
      .map(
        (tx, i) => `
      <tr style="background:${i % 2 === 0 ? "#fff" : "#fafafa"}">
        <td style="padding:7px 8px;color:#666">${i + 1}</td>
        <td style="padding:7px 8px;color:#333">${tx.label || "-"}</td>
        <td style="padding:7px 8px;color:#666">${tx.category || "-"}</td>
        <td style="padding:7px 8px;text-align:center">
          <span style="padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600;
            background:${tx.type === "income" ? "#dcfce7" : "#fee2e2"};
            color:${tx.type === "income" ? "#16a34a" : "#dc2626"}">
            ${tx.type === "income" ? "Pemasukan" : "Pengeluaran"}
          </span>
        </td>
        <td style="padding:7px 8px;text-align:right;font-weight:500;color:${tx.type === "income" ? "#16a34a" : "#dc2626"}">
          ${tx.type === "income" ? "+" : "-"}${fmt(tx.amount || 0)}
        </td>
      </tr>`,
      )
      .join("");

    return `
    <div style="padding:40px 44px;font-family:Arial,sans-serif;color:#111;background:#fff">
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #7c6aff;padding-bottom:14px;margin-bottom:24px">
        <div>
          <div style="font-size:22px;font-weight:700;color:#7c6aff">💬 FinChat</div>
          <div style="font-size:12px;color:#888;margin-top:2px">Laporan Keuangan Pribadi</div>
        </div>
        <div style="text-align:right;font-size:12px;color:#666">Dicetak: ${date}</div>
      </div>

      <!-- Summary Cards -->
      <div style="display:flex;gap:12px;margin-bottom:28px">
        <div style="flex:1;background:#f0fdf4;border-radius:10px;padding:14px 16px;border:1px solid #bbf7d0">
          <div style="font-size:10px;color:#16a34a;text-transform:uppercase;letter-spacing:.7px;margin-bottom:4px">PEMASUKAN</div>
          <div style="font-size:18px;font-weight:700;color:#15803d">${fmt(income)}</div>
        </div>
        <div style="flex:1;background:#fff1f2;border-radius:10px;padding:14px 16px;border:1px solid #fecdd3">
          <div style="font-size:10px;color:#e11d48;text-transform:uppercase;letter-spacing:.7px;margin-bottom:4px">PENGELUARAN</div>
          <div style="font-size:18px;font-weight:700;color:#be123c">${fmt(expense)}</div>
        </div>
        <div style="flex:1;background:${balance >= 0 ? "#eff6ff" : "#fff1f2"};border-radius:10px;padding:14px 16px;border:1px solid ${balance >= 0 ? "#bfdbfe" : "#fecdd3"}">
          <div style="font-size:10px;color:${balance >= 0 ? "#1d4ed8" : "#e11d48"};text-transform:uppercase;letter-spacing:.7px;margin-bottom:4px">SALDO</div>
          <div style="font-size:18px;font-weight:700;color:${balance >= 0 ? "#1e40af" : "#be123c"}">${balance < 0 ? "-" : ""}${fmt(balance)}</div>
        </div>
      </div>

      ${
        Object.keys(cats).length > 0
          ? `
      <!-- Categories -->
      <div style="margin-bottom:28px">
        <div style="font-size:13px;font-weight:700;color:#333;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #eee">📂 Pengeluaran per Kategori</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#f8f8ff">
              <th style="text-align:left;padding:8px 10px;color:#555;font-weight:600;border-bottom:1px solid #e5e7eb">Kategori</th>
              <th style="text-align:right;padding:8px 10px;color:#555;font-weight:600;border-bottom:1px solid #e5e7eb">Jumlah</th>
              <th style="text-align:right;padding:8px 10px;color:#555;font-weight:600;border-bottom:1px solid #e5e7eb">% Pengeluaran</th>
            </tr>
          </thead>
          <tbody>${catRows}</tbody>
        </table>
      </div>`
          : ""
      }

      ${
        chartImgSrc
          ? `
      <!-- Chart -->
      <div style="margin-bottom:28px">
        <div style="font-size:13px;font-weight:700;color:#333;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #eee">📊 ${lastChart?.title || "Grafik Keuangan"}</div>
        <div style="background:#f9f9ff;border-radius:10px;border:1px solid #ede9fe;padding:12px;text-align:center">
          <img src="${chartImgSrc}" style="max-width:100%;height:auto">
        </div>
      </div>`
          : ""
      }

      <!-- Transactions -->
      <div>
        <div style="font-size:13px;font-weight:700;color:#333;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #eee">📋 Detail Transaksi</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead>
            <tr style="background:#f8f8ff">
              <th style="text-align:left;padding:7px 8px;color:#555;font-weight:600;border-bottom:1px solid #e5e7eb">No</th>
              <th style="text-align:left;padding:7px 8px;color:#555;font-weight:600;border-bottom:1px solid #e5e7eb">Keterangan</th>
              <th style="text-align:left;padding:7px 8px;color:#555;font-weight:600;border-bottom:1px solid #e5e7eb">Kategori</th>
              <th style="text-align:center;padding:7px 8px;color:#555;font-weight:600;border-bottom:1px solid #e5e7eb">Tipe</th>
              <th style="text-align:right;padding:7px 8px;color:#555;font-weight:600;border-bottom:1px solid #e5e7eb">Jumlah</th>
            </tr>
          </thead>
          <tbody>${txRows}</tbody>
          <tfoot>
            <tr style="background:#f8f8ff;border-top:2px solid #e5e7eb">
              <td colspan="4" style="padding:8px;font-weight:700;color:#333">Saldo Akhir</td>
              <td style="padding:8px;text-align:right;font-weight:700;font-size:13px;color:${balance >= 0 ? "#16a34a" : "#dc2626"}">${balance < 0 ? "-" : ""}${fmt(balance)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Footer -->
      <div style="margin-top:32px;padding-top:14px;border-top:1px solid #eee;font-size:10px;color:#aaa;text-align:center">
        Dibuat oleh FinChat • ${date}
      </div>
    </div>`;
  }

  return { openModal, closeModal, toExcel, toPDF };
})();
