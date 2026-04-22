import {
  createWafer,
  generateDies,
  clipDiesToWafer,
  applyOrientation,
  getUniqueBins,
  aggregateBinCounts,
  getColorScheme,
  listColorSchemes,
  buildScene,
  toPlotly,
} from 'wafermap';

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  rows: [],
  headers: [],
  cfg: {
    waferCol: '', xCol: '', yCol: '',
    hbinCol: '', sbinCol: '',
    valueCols: [],
    dieW: 10, dieH: 10,
    diameter: 200,
    passBin: null,
  },
  data: {
    waferIds: [],
    wafer: null,
    diesByWafer: {},
  },
  ui: {
    selectedWafers: new Set(),
    view: 'maps',         // 'maps' | 'bingallery'
    plotMode: 'hardbin',
    valueChannel: 0,
    colorScheme: 'color',
    showRings: false,
    showQuadrants: false,
    showXY: false,
    highlightBin: undefined,
  },
};

// ── CSV parsing ───────────────────────────────────────────────────────────────

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = lines.slice(1).filter(Boolean).map((line) => {
    const vals = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] ?? '').trim()]));
  });
  return { headers, rows };
}

// ── Column auto-detection ─────────────────────────────────────────────────────

function autoDetect(headers, rows) {
  const find = (...patterns) =>
    headers.find((h) => patterns.some((p) => h.toLowerCase().includes(p)));

  const waferCol  = find('wafer', 'wid', 'wafer_id') ?? headers[0];
  const xCol      = find('die_x', 'diex', ' x', '_x') ?? find('col') ?? headers[1];
  const yCol      = find('die_y', 'diey', ' y', '_y') ?? find('row') ?? headers[2];
  const hbinCol   = find('hbin', 'hard_bin', 'hardbin', 'bin') ?? '';
  const sbinCol   = find('sbin', 'soft_bin', 'softbin') ?? '';

  const reserved = new Set([waferCol, xCol, yCol, hbinCol, sbinCol].filter(Boolean));
  reserved.add(find('lot', 'lotid') ?? '');
  reserved.add(find('date', 'testdate') ?? '');
  reserved.add(find('temp') ?? '');

  const valueCols = headers.filter((h) => {
    if (reserved.has(h)) return false;
    return rows.slice(0, 20).some((r) => r[h] !== '' && !isNaN(Number(r[h])));
  });

  return { waferCol, xCol, yCol, hbinCol, sbinCol, valueCols };
}

function suggestDiameter(rows, xCol, yCol, dieW, dieH) {
  let maxR = 0;
  for (const row of rows) {
    const x = Number(row[xCol]) * dieW;
    const y = Number(row[yCol]) * dieH;
    const r = Math.sqrt(x * x + y * y) + Math.sqrt(dieW * dieW + dieH * dieH) / 2;
    if (r > maxR) maxR = r;
  }
  return Math.ceil((maxR * 2) / 25) * 25; // round up to nearest 25 mm
}

// ── Data processing ───────────────────────────────────────────────────────────

function processData() {
  const { rows, cfg } = state;
  const waferIds = [...new Set(rows.map((r) => r[cfg.waferCol]))].sort();

  const wafer = createWafer({
    diameter: cfg.diameter,
    flat: { type: 'bottom', length: cfg.diameter * 0.2 },
    orientation: 0,
  });

  const generated = generateDies(wafer, { width: cfg.dieW, height: cfg.dieH });
  const clipped = clipDiesToWafer(generated, wafer, { width: cfg.dieW, height: cfg.dieH });

  const diesByWafer = {};
  for (const waferId of waferIds) {
    const waferRows = rows.filter((r) => r[cfg.waferCol] === waferId);
    const rowMap = new Map(waferRows.map((r) => [`${Number(r[cfg.xCol])},${Number(r[cfg.yCol])}`, r]));

    const enriched = clipped.map((die) => {
      const row = rowMap.get(`${die.i},${die.j}`);
      if (!row) return { ...die, values: [], bins: [], metadata: {} };
      return {
        ...die,
        values: cfg.valueCols.map((col) => Number(row[col])),
        bins: [
          cfg.hbinCol ? Number(row[cfg.hbinCol]) : 0,
          cfg.sbinCol ? Number(row[cfg.sbinCol]) : 0,
        ].filter((_, i) => i === 0 || cfg.sbinCol),
        metadata: {
          waferId,
          customFields: Object.fromEntries(
            state.headers.map((h) => [h, row[h]])
          ),
        },
      };
    });

    diesByWafer[waferId] = applyOrientation(enriched, wafer);
  }

  state.data = { waferIds, wafer, diesByWafer };
  state.ui.selectedWafers = new Set(waferIds.slice(0, Math.min(4, waferIds.length)));
}

// ── Analytics charts ──────────────────────────────────────────────────────────

function renderPareto() {
  const { diesByWafer } = state.data;
  const counts = {};
  for (const dies of Object.values(diesByWafer)) {
    for (const die of dies) {
      if (die.partial) continue;
      const bin = die.bins?.[0];
      if (bin !== undefined) counts[bin] = (counts[bin] ?? 0) + 1;
    }
  }

  const sorted = Object.entries(counts)
    .map(([bin, count]) => ({ bin: Number(bin), count }))
    .sort((a, b) => b.count - a.count);

  const total = sorted.reduce((s, d) => s + d.count, 0);
  let cum = 0;
  const cumPct = sorted.map((d) => { cum += d.count; return +(100 * cum / total).toFixed(1); });

  Plotly.react('chart-pareto', [
    {
      type: 'bar',
      x: sorted.map((d) => `Bin ${d.bin}`),
      y: sorted.map((d) => d.count),
      marker: { color: sorted.map((d) => getColorScheme(state.ui.colorScheme).forBin(d.bin)) },
      name: 'Count',
    },
    {
      type: 'scatter', mode: 'lines+markers',
      x: sorted.map((d) => `Bin ${d.bin}`),
      y: cumPct,
      yaxis: 'y2',
      name: 'Cumulative %',
      line: { color: '#555', width: 1.5 },
      marker: { size: 5, color: '#555' },
    },
  ], {
    title: { text: 'Bin Pareto (all wafers)', x: 0.02, font: { size: 13 } },
    barmode: 'group',
    xaxis: { title: '' },
    yaxis: { title: 'Die count' },
    yaxis2: { title: 'Cumulative %', overlaying: 'y', side: 'right', range: [0, 105], ticksuffix: '%' },
    legend: { orientation: 'h', y: -0.15 },
    margin: { t: 36, l: 48, r: 48, b: 60 },
    plot_bgcolor: '#f9f9f9',
    showlegend: true,
  }, { responsive: true });
}

function renderYieldChart() {
  const { waferIds, diesByWafer } = state.data;
  const { passBin } = state.cfg;

  // Collect all unique bins across all wafers
  const allBins = getUniqueBins(Object.values(diesByWafer).flat());

  // Compute per-wafer, per-bin counts
  const binsByWafer = {};
  const totalsByWafer = {};
  for (const waferId of waferIds) {
    binsByWafer[waferId] = {};
    let total = 0;
    for (const die of diesByWafer[waferId]) {
      if (die.partial) continue;
      total++;
      const bin = die.bins?.[0];
      if (bin !== undefined) binsByWafer[waferId][bin] = (binsByWafer[waferId][bin] ?? 0) + 1;
    }
    totalsByWafer[waferId] = total;
  }

  // Sort wafers by yield (pass bin %) desc, or alphabetically if no pass bin
  const sortedWafers = [...waferIds].sort((a, b) => {
    if (passBin === null) return a.localeCompare(b);
    const ya = totalsByWafer[a] ? (binsByWafer[a][passBin] ?? 0) / totalsByWafer[a] : 0;
    const yb = totalsByWafer[b] ? (binsByWafer[b][passBin] ?? 0) / totalsByWafer[b] : 0;
    return yb - ya;
  });

  const traces = allBins.map((bin) => ({
    type: 'bar',
    name: `Bin ${bin}`,
    x: sortedWafers,
    y: sortedWafers.map((w) => binsByWafer[w][bin] ?? 0),
    marker: { color: getColorScheme(state.ui.colorScheme).forBin(bin) },
  }));

  // Highlight selected wafers via opacity
  const selectedSet = state.ui.selectedWafers;
  traces.forEach((trace) => {
    trace.marker = {
      ...trace.marker,
      opacity: sortedWafers.map((w) => selectedSet.has(w) ? 1 : 0.35),
    };
  });

  Plotly.react('chart-yield', traces, {
    title: { text: passBin !== null ? `Bin Distribution (pass = Bin ${passBin})` : 'Bin Distribution per Wafer', x: 0.02, font: { size: 13 } },
    barmode: 'stack',
    xaxis: { title: 'Wafer' },
    yaxis: { title: 'Die count' },
    legend: { orientation: 'h', y: -0.2 },
    margin: { t: 36, l: 48, r: 20, b: 70 },
    plot_bgcolor: '#f9f9f9',
    clickmode: 'event',
  }, { responsive: true });

  document.getElementById('chart-yield').on('plotly_click', (event) => {
    const waferId = event.points[0].x;
    if (state.ui.selectedWafers.has(waferId)) {
      state.ui.selectedWafers.delete(waferId);
    } else {
      state.ui.selectedWafers.add(waferId);
    }
    refreshGallery();
    renderYieldChart(); // re-render to update opacity
  });
}

// ── Wafermap gallery ──────────────────────────────────────────────────────────

function refreshGallery() {
  const { view } = state.ui;
  document.getElementById('btn-view-maps').classList.toggle('active', view === 'maps');
  document.getElementById('btn-view-bingallery').classList.toggle('active', view === 'bingallery');

  updateWaferChips();

  if (view === 'maps') renderWafermapGallery();
  else renderBinGallery();
}

function renderWafermapGallery() {
  const gallery = document.getElementById('wafermap-gallery');
  const { selectedWafers, plotMode, valueChannel, colorScheme, showRings, showQuadrants, showXY, highlightBin } = state.ui;
  const { diesByWafer, wafer } = state.data;
  const selected = [...selectedWafers].sort();

  if (!selected.length) {
    gallery.innerHTML = '<p class="empty-msg">Click wafers in the distribution chart to display them, or use Select All.</p>';
    return;
  }

  // Sync grid cards to current selection
  const existing = new Set([...gallery.querySelectorAll('.map-card')].map((el) => el.dataset.wafer));
  const wanted = new Set(selected);

  // Remove cards no longer selected
  for (const el of gallery.querySelectorAll('.map-card')) {
    if (!wanted.has(el.dataset.wafer)) el.remove();
  }

  // Add cards for new selections (in order)
  gallery.innerHTML = selected.map((waferId) => `
    <div class="map-card" data-wafer="${waferId}">
      <div class="map-card-header">
        <span class="map-card-title">${waferId}</span>
        <button class="map-card-remove" data-wafer="${waferId}">×</button>
      </div>
      <div class="map-chart" id="map-${waferId}"></div>
      <div class="map-stats" id="mapstats-${waferId}"></div>
    </div>
  `).join('');

  for (const el of gallery.querySelectorAll('.map-card-remove')) {
    el.addEventListener('click', () => {
      state.ui.selectedWafers.delete(el.dataset.wafer);
      refreshGallery();
      renderYieldChart();
    });
  }

  // Build and render each wafermap
  const dies4map = plotMode === 'value' && valueChannel > 0
    ? (dies) => dies.map((die) => {
        const v = die.values ?? [];
        const reordered = [...v];
        reordered[0] = v[valueChannel] ?? v[0];
        return { ...die, values: reordered };
      })
    : (dies) => dies;

  for (const waferId of selected) {
    const dies = diesByWafer[waferId];
    if (!dies) continue;

    const scene = buildScene(wafer, dies4map(dies), [], {
      plotMode,
      colorScheme,
      showRingBoundaries: showRings,
      showQuadrantBoundaries: showQuadrants,
      showXYIndicator: showXY,
      highlightBin,
    });

    const { data, layout } = toPlotly(scene);
    Plotly.react(`map-${waferId}`, data, {
      ...layout, margin: { t: 6, l: 6, r: 44, b: 6 },
    }, { responsive: true });

    renderMapStats(`mapstats-${waferId}`, dies, wafer);
  }
}

function renderMapStats(targetId, dies, wafer) {
  const fullDies = dies.filter((d) => !d.partial);
  const binCounts = {};
  for (const die of fullDies) {
    const bin = die.bins?.[0] ?? 0;
    binCounts[bin] = (binCounts[bin] ?? 0) + 1;
  }
  const rows = Object.entries(binCounts)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([bin, count]) => {
      const pct = (100 * count / fullDies.length).toFixed(1);
      return `<span class="stat-chip" style="border-color:${getColorScheme(state.ui.colorScheme).forBin(Number(bin))}">B${bin}: ${count} (${pct}%)</span>`;
    }).join('');
  document.getElementById(targetId).innerHTML = rows;
}

function renderBinGallery() {
  const gallery = document.getElementById('wafermap-gallery');
  const { diesByWafer, wafer } = state.data;
  const { colorScheme, showRings } = state.ui;

  const allDies = Object.values(diesByWafer).flat();
  const uniqueBins = getUniqueBins(allDies);
  const allWaferDies = Object.values(diesByWafer);
  const numWafers = allWaferDies.length;

  gallery.innerHTML = uniqueBins.map((bin) => `
    <div class="map-card" data-bin="${bin}">
      <div class="map-card-header">
        <span class="map-card-title">Bin ${bin}</span>
        <span class="map-card-sub" id="binsub-${bin}"></span>
      </div>
      <div class="map-chart" id="map-bin-${bin}"></div>
      <div class="map-stats" id="mapstats-bin-${bin}"></div>
    </div>
  `).join('');

  for (const bin of uniqueBins) {
    const aggregated = aggregateBinCounts(allWaferDies, bin);
    const totalHits = aggregated.reduce((s, d) => s + (d.values?.[0] ?? 0), 0);
    const affected = aggregated.filter((d) => (d.values?.[0] ?? 0) > 0).length;

    const scene = buildScene(wafer, aggregated, [], {
      plotMode: 'value',
      valueRange: [0, numWafers],
      colorScheme,
      showRingBoundaries: showRings,
    });

    const { data, layout } = toPlotly(scene);
    Plotly.react(`map-bin-${bin}`, data, {
      ...layout, margin: { t: 6, l: 6, r: 44, b: 6 },
    }, { responsive: true });

    const el = document.getElementById(`binsub-${bin}`);
    if (el) el.textContent = `${affected} positions`;
    const statsEl = document.getElementById(`mapstats-bin-${bin}`);
    if (statsEl) statsEl.innerHTML =
      `<span class="stat-chip">Total: ${totalHits} occurrences across ${numWafers} wafers</span>` +
      `<span class="stat-chip">Scale: 0 – ${numWafers}</span>`;
  }
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function updateWaferChips() {
  const bar = document.getElementById('wafer-chips');
  if (!bar) return;
  if (state.ui.view === 'bingallery') { bar.innerHTML = ''; return; }

  const sorted = [...state.ui.selectedWafers].sort();
  bar.innerHTML = sorted.map((w) =>
    `<span class="chip">${w} <button class="chip-remove" data-wafer="${w}">×</button></span>`
  ).join('');

  for (const btn of bar.querySelectorAll('.chip-remove')) {
    btn.addEventListener('click', () => {
      state.ui.selectedWafers.delete(btn.dataset.wafer);
      refreshGallery();
      renderYieldChart();
    });
  }
}

function populateConfigForm() {
  const { headers, cfg } = state;

  const colSelect = (id, value) => {
    const el = document.getElementById(id);
    el.innerHTML = ['', ...headers].map((h) => `<option${h === value ? ' selected' : ''}>${h}</option>`).join('');
  };

  colSelect('cfg-wafer', cfg.waferCol);
  colSelect('cfg-x', cfg.xCol);
  colSelect('cfg-y', cfg.yCol);
  colSelect('cfg-hbin', cfg.hbinCol);
  colSelect('cfg-sbin', cfg.sbinCol);

  document.getElementById('cfg-die-w').value = cfg.dieW;
  document.getElementById('cfg-die-h').value = cfg.dieH;
  document.getElementById('cfg-diameter').value = cfg.diameter;

  // Value columns checkboxes
  const vcBox = document.getElementById('cfg-valuecols');
  vcBox.innerHTML = headers.map((h) => `
    <label class="check-label">
      <input type="checkbox" value="${h}"${cfg.valueCols.includes(h) ? ' checked' : ''}> ${h}
    </label>
  `).join('');

  // Pass bin — populated after data is processed
  document.getElementById('config-section').hidden = false;
}

function readConfig() {
  state.cfg.waferCol  = document.getElementById('cfg-wafer').value;
  state.cfg.xCol      = document.getElementById('cfg-x').value;
  state.cfg.yCol      = document.getElementById('cfg-y').value;
  state.cfg.hbinCol   = document.getElementById('cfg-hbin').value;
  state.cfg.sbinCol   = document.getElementById('cfg-sbin').value;
  state.cfg.dieW      = Number(document.getElementById('cfg-die-w').value) || 10;
  state.cfg.dieH      = Number(document.getElementById('cfg-die-h').value) || 10;
  state.cfg.diameter  = Number(document.getElementById('cfg-diameter').value) || 200;
  state.cfg.valueCols = [...document.querySelectorAll('#cfg-valuecols input:checked')].map((el) => el.value);
}

function populatePassBinSelector() {
  const allDies = Object.values(state.data.diesByWafer).flat();
  const bins = getUniqueBins(allDies);
  const sel = document.getElementById('cfg-passbin');
  sel.innerHTML = `<option value="">None</option>` +
    bins.map((b) => `<option value="${b}">Bin ${b}</option>`).join('');
  // Default to the numerically lowest bin as a guess at "pass"
  if (bins.length) sel.value = String(bins[0]);
  state.cfg.passBin = bins.length ? bins[0] : null;
}

function populateMapControls() {
  // Mode
  const modeEl = document.getElementById('map-mode');
  modeEl.innerHTML = `
    <option value="hardbin">Hard Bin</option>
    <option value="softbin">Soft Bin</option>
    <option value="value">Test Value</option>
    <option value="stacked_values">Stacked Values</option>
    <option value="stacked_bins">Stacked Bins</option>
  `;

  // Channel
  const chanEl = document.getElementById('map-channel');
  chanEl.innerHTML = state.cfg.valueCols.map((col, i) =>
    `<option value="${i}">${col}</option>`
  ).join('');
  chanEl.parentElement.hidden = !state.cfg.valueCols.length;

  // Colour scheme
  const colorEl = document.getElementById('map-color');
  colorEl.innerHTML = listColorSchemes()
    .filter(({ name }) => name !== 'color')
    .map(({ name, label }) => `<option value="${name}"${name === state.ui.colorScheme ? ' selected' : ''}>${label}</option>`)
    .join('');

  // Highlight bin
  const allDies = Object.values(state.data.diesByWafer).flat();
  const bins = getUniqueBins(allDies);
  const hlEl = document.getElementById('map-highlight');
  hlEl.innerHTML = `<option value="">None</option>` +
    bins.map((b) => `<option value="${b}">Bin ${b}</option>`).join('');
}

// ── Event wiring ──────────────────────────────────────────────────────────────

function wireEvents() {
  // File drop / pick
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

  // Config form
  document.getElementById('btn-suggest-diameter').addEventListener('click', () => {
    const dieW = Number(document.getElementById('cfg-die-w').value) || 10;
    const dieH = Number(document.getElementById('cfg-die-h').value) || 10;
    const xCol = document.getElementById('cfg-x').value;
    const yCol = document.getElementById('cfg-y').value;
    if (xCol && yCol) {
      document.getElementById('cfg-diameter').value = suggestDiameter(state.rows, xCol, yCol, dieW, dieH);
    }
  });

  document.getElementById('btn-process').addEventListener('click', () => {
    readConfig();
    processData();
    populatePassBinSelector();
    populateMapControls();
    document.getElementById('analytics-section').hidden = false;
    document.getElementById('map-section').hidden = false;
    renderPareto();
    renderYieldChart();
    refreshGallery();
  });

  document.getElementById('cfg-passbin').addEventListener('change', (e) => {
    const v = e.target.value;
    state.cfg.passBin = v === '' ? null : Number(v);
    renderYieldChart();
  });

  // View tabs
  document.getElementById('btn-view-maps').addEventListener('click', () => {
    state.ui.view = 'maps';
    document.getElementById('wafer-selection-bar').hidden = false;
    refreshGallery();
  });
  document.getElementById('btn-view-bingallery').addEventListener('click', () => {
    state.ui.view = 'bingallery';
    document.getElementById('wafer-selection-bar').hidden = true;
    refreshGallery();
  });

  // Wafer select/clear
  document.getElementById('btn-select-all').addEventListener('click', () => {
    state.data.waferIds.forEach((w) => state.ui.selectedWafers.add(w));
    refreshGallery();
    renderYieldChart();
  });
  document.getElementById('btn-clear-selection').addEventListener('click', () => {
    state.ui.selectedWafers.clear();
    refreshGallery();
    renderYieldChart();
  });

  // Map controls
  document.getElementById('map-mode').addEventListener('change', (e) => {
    state.ui.plotMode = e.target.value;
    const isValue = e.target.value === 'value';
    document.getElementById('map-channel-group').hidden = !isValue || !state.cfg.valueCols.length;
    refreshGallery();
  });
  document.getElementById('map-channel').addEventListener('change', (e) => {
    state.ui.valueChannel = Number(e.target.value);
    refreshGallery();
  });
  document.getElementById('map-color').addEventListener('change', (e) => {
    state.ui.colorScheme = e.target.value;
    renderPareto();
    renderYieldChart();
    refreshGallery();
  });
  document.getElementById('map-highlight').addEventListener('change', (e) => {
    state.ui.highlightBin = e.target.value === '' ? undefined : Number(e.target.value);
    refreshGallery();
  });

  for (const [id, key] of [
    ['btn-rings', 'showRings'],
    ['btn-quadrants', 'showQuadrants'],
    ['btn-xy', 'showXY'],
  ]) {
    document.getElementById(id).addEventListener('click', () => {
      state.ui[key] = !state.ui[key];
      document.getElementById(id).classList.toggle('active', state.ui[key]);
      refreshGallery();
    });
  }
}

function handleFile(file) {
  if (!file) return;
  document.getElementById('file-name').textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  const reader = new FileReader();
  reader.onload = (e) => {
    const { headers, rows } = parseCsv(e.target.result);
    state.headers = headers;
    state.rows = rows;
    const detected = autoDetect(headers, rows);
    Object.assign(state.cfg, detected);
    state.cfg.diameter = suggestDiameter(rows, detected.xCol, detected.yCol, state.cfg.dieW, state.cfg.dieH);
    document.getElementById('analytics-section').hidden = true;
    document.getElementById('map-section').hidden = true;
    populateConfigForm();
  };
  reader.readAsText(file);
}

// ── Init ──────────────────────────────────────────────────────────────────────

wireEvents();
