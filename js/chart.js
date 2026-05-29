// ============================================================
//  FinChat — Chart Renderer
//  Build chart bubble menggunakan Chart.js
// ============================================================

const ChartRenderer = (() => {
  const instances = {};
  const COLORS    = ['#7c6aff','#34d399','#f87171','#fbbf24','#60a5fa','#f472b6','#a78bfa','#86efac'];

  function buildBubble(chartData) {
    const wrap = document.createElement('div');
    wrap.className = 'chart-bubble';

    const title = document.createElement('div');
    title.className = 'chart-title';
    title.textContent = '📊 ' + (chartData.title || 'Grafik Keuangan');
    wrap.appendChild(title);

    const isPie = chartData.type === 'pie' || chartData.type === 'doughnut';
    const container = document.createElement('div');
    container.className = 'chart-container';
    container.style.height = (isPie ? 220 : 200) + 'px';

    const canvas = document.createElement('canvas');
    const id = 'chart-' + Date.now();
    canvas.id = id;
    container.appendChild(canvas);
    wrap.appendChild(container);

    // Defer render so canvas is in DOM
    setTimeout(() => _render(id, canvas, chartData, isPie), 50);

    return wrap;
  }

  function _render(id, canvas, chartData, isPie) {
    const ctx      = canvas.getContext('2d');
    const datasets = (chartData.datasets || []).map(ds => {
      if (isPie) {
        return {
          data:            ds.data,
          backgroundColor: chartData.colors || COLORS,
          borderWidth:     0,
        };
      }
      return {
        label:            ds.label,
        data:             ds.data,
        backgroundColor:  ds.color || '#7c6aff',
        borderColor:      ds.color || '#7c6aff',
        borderRadius:     6,
        borderWidth:      chartData.type === 'line' ? 2 : 0,
        fill:             chartData.type === 'line',
        tension:          0.4,
        pointBackgroundColor: ds.color || '#7c6aff',
      };
    });

    instances[id] = new Chart(ctx, {
      type: chartData.type || 'bar',
      data: { labels: chartData.labels || [], datasets },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: isPie || (chartData.datasets && chartData.datasets.length > 1),
            labels:  { color: '#9294a3', font: { size: 11, family: 'Sora' }, boxWidth: 12 },
          },
          tooltip: {
            callbacks: {
              label: (c) => {
                const v = c.parsed.y ?? c.parsed;
                return typeof v === 'number' && v > 999
                  ? ' ' + Chat.fmt(v)
                  : ' ' + v;
              },
            },
          },
        },
        scales: isPie ? {} : {
          x: {
            ticks: { color: '#6b6e7e', font: { size: 11 } },
            grid:  { color: 'rgba(255,255,255,0.04)' },
          },
          y: {
            ticks: {
              color: '#6b6e7e',
              font:  { size: 11 },
              callback: v =>
                v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + 'jt'
                : v >= 1_000   ? (v / 1_000).toFixed(0) + 'rb'
                : v,
            },
            grid: { color: 'rgba(255,255,255,0.04)' },
          },
        },
      },
    });
  }

  // Build a static (white-bg) chart canvas for PDF export
  function buildStaticCanvas(chartData, width = 580, height = 240) {
    return new Promise(resolve => {
      const canvas  = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;

      const isPie    = chartData.type === 'pie' || chartData.type === 'doughnut';
      const datasets = (chartData.datasets || []).map(ds => {
        if (isPie) return { data: ds.data, backgroundColor: chartData.colors || COLORS, borderWidth: 0 };
        return {
          label:           ds.label,
          data:            ds.data,
          backgroundColor: ds.color || '#7c6aff',
          borderColor:     ds.color || '#7c6aff',
          borderRadius:    5,
          borderWidth:     chartData.type === 'line' ? 2 : 0,
          fill:            false,
          tension:         0.4,
        };
      });

      new Chart(canvas.getContext('2d'), {
        type: chartData.type || 'bar',
        data: { labels: chartData.labels || [], datasets },
        options: {
          responsive: false, animation: false,
          plugins: {
            legend: { display: isPie, labels: { font: { size: 11 }, boxWidth: 12 } },
          },
          scales: isPie ? {} : {
            x: { ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
            y: {
              ticks: {
                font: { size: 10 },
                callback: v =>
                  v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + 'jt'
                  : v >= 1_000   ? (v / 1_000).toFixed(0) + 'rb'
                  : v,
              },
              grid: { color: 'rgba(0,0,0,0.05)' },
            },
          },
        },
      });

      setTimeout(() => resolve(canvas), 300);
    });
  }

  function destroyAll() {
    Object.values(instances).forEach(c => c.destroy());
    Object.keys(instances).forEach(k => delete instances[k]);
  }

  return { buildBubble, buildStaticCanvas, destroyAll };
})();
