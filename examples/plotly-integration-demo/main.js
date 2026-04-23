import {
  buildWaferMap,
  classifyDie,
  getRingLabel,
  listColorSchemes,
  buildScene,
  toPlotly,
} from 'wafermap';

const PITCH = 10;
const WAFER_DIAMETER = 150;

const state = {
  plotMode: 'value',
  showText: false,
  showRingBoundaries: false,
  showQuadrantBoundaries: false,
  showAxes: true,
  showUnits: false,
  ringCount: 4,
  colorScheme: 'color',
  wafer: null,
  dies: [],
};

async function main() {
  const rows = await loadCsv('../../data/dummy-fulldata.csv');
  const waferRows = rows.filter(row => row.wafer === 'W01');
  const firstRow  = waferRows[0] ?? {};

  // Primary pass — x,y are prober step positions (die grid indices, not mm).
  const data = waferRows.map(row => ({
    x:   Number(row.x),
    y:   Number(row.y),
    bin: Number(row.hbin),
    value: Number(row.testA),
  }));

  const result = buildWaferMap({
    data,
    wafer: {
      diameter: WAFER_DIAMETER,
      notch: { type: 'bottom' },
      orientation: 0,
      metadata: {
        lot:          firstRow.lot      ?? 'LOT456',
        waferNumber:  1,
        testDate:     firstRow.testdate ?? '—',
        testProgram:  'PROG-V300-1',
        temperature:  Number(firstRow.temp ?? 25),
      },
    },
    die: { width: PITCH, height: PITCH },
  });

  state.wafer = result.wafer;

  // Post-enrich with additional test channels and softbin.
  // For centred grids (offsetX=0), die.i === original prober x directly.
  const rowMap = new Map(waferRows.map(row => [`${row.x},${row.y}`, row]));
  state.dies = result.dies.map(die => {
    const row = rowMap.get(`${die.i},${die.j}`);
    if (!row) return die;
    return {
      ...die,
      values: [Number(row.testA), Number(row.testB), Number(row.testC)],
      bins:   [Number(row.hbin),  Number(row.sbin)],
      metadata: {
        lotId:    row.lot,
        waferId:  `${row.lot}-${row.wafer}`,
        testDate: row.testdate,
        temperature: row.temp,
        customFields: { hbin: row.hbin, sbin: row.sbin, testA: row.testA, testB: row.testB, testC: row.testC },
      },
    };
  });

  bindControls();
  render();
}

async function loadCsv(path) {
  const response = await fetch(path);
  const text     = await response.text();
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(',');
  return lines.filter(Boolean).map(line => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}

function bindControls() {
  const bindToggle = (id, key) =>
    document.getElementById(id).addEventListener('click', () => { state[key] = !state[key]; render(); });

  document.getElementById('mode').addEventListener('change', e => { state.plotMode = e.target.value; render(); });
  document.getElementById('ring-count').addEventListener('change', e => { state.ringCount = Number(e.target.value) || 4; render(); });

  bindToggle('toggle-text',       'showText');
  bindToggle('toggle-rings',      'showRingBoundaries');
  bindToggle('toggle-quadrants',  'showQuadrantBoundaries');
  bindToggle('toggle-axes',       'showAxes');
  bindToggle('toggle-units',      'showUnits');

  const colorSel = document.getElementById('color-scheme');
  colorSel.innerHTML = listColorSchemes()
    .filter(({ name }) => name !== 'color')
    .map(({ name, label }) => `<option value="${name}"${name === state.colorScheme ? ' selected' : ''}>${label}</option>`)
    .join('');
  colorSel.addEventListener('change', e => { state.colorScheme = e.target.value; render(); });
}

function render() {
  updateToggleStates();

  const scene = buildScene(state.wafer, state.dies, [], {
    plotMode:               state.plotMode,
    showText:               state.showText,
    ringCount:              state.ringCount,
    showRingBoundaries:     state.showRingBoundaries,
    showQuadrantBoundaries: state.showQuadrantBoundaries,
    colorScheme:            state.colorScheme,
  });

  const { data, layout } = toPlotly(scene, {
    showAxes:  state.showAxes,
    showUnits: state.showUnits,
    diePitch:  { x: PITCH, y: PITCH },
  });
  Plotly.react('chart', data, {
    ...layout,
    title:  { text: 'wmap Package → Scene → Plotly', x: 0.03 },
    margin: { t: 48, l: state.showAxes ? 48 : 10, r: 40, b: state.showAxes ? 40 : 10 },
  }, { responsive: true });

  renderMetadata(scene.metadata);
  renderSummaryStats(state.dies);
  renderSpatialStats(state.dies, state.wafer, state.ringCount);
}

function updateToggleStates() {
  for (const [id, active] of [
    ['toggle-text',      state.showText],
    ['toggle-rings',     state.showRingBoundaries],
    ['toggle-quadrants', state.showQuadrantBoundaries],
    ['toggle-axes',      state.showAxes],
    ['toggle-units',     state.showUnits],
  ]) {
    document.getElementById(id).classList.toggle('active', active);
  }
  document.getElementById('mode').value       = state.plotMode;
  document.getElementById('ring-count').value = String(state.ringCount);
  document.getElementById('color-scheme').value = state.colorScheme;
}

function renderMetadata(metadata) {
  document.getElementById('wafer-meta').innerHTML = Object.entries(metadata ?? {}).map(([key, val]) => `
    <div class="meta-row">
      <span class="meta-key">${formatKey(key)}</span>
      <span>${val}</span>
    </div>
  `).join('');
}

function renderSummaryStats(dies) {
  const fullDies  = dies.filter(d => !d.partial);
  const binCounts = {};
  for (const die of fullDies) {
    const bin = die.bins?.[0] ?? 0;
    binCounts[bin] = (binCounts[bin] ?? 0) + 1;
  }
  const rows = [
    ['Total Dies',   fullDies.length],
    ['Partial Dies', dies.filter(d => d.partial).length],
    ...Object.entries(binCounts).sort(([a], [b]) => Number(a) - Number(b))
      .map(([bin, count]) => [`Bin ${bin}`, `${count} (${(100 * count / fullDies.length).toFixed(1)}%)`]),
  ];
  document.getElementById('summary-stats').innerHTML = rows.map(([k, v]) => `
    <div class="stats-row">
      <span class="stats-key">${k}</span>
      <span class="stats-value">${v}</span>
    </div>
  `).join('');
}

function renderSpatialStats(dies, wafer, ringCount) {
  const fullDies     = dies.filter(d => !d.partial);
  const ringStats    = Array.from({ length: ringCount }, (_, i) => ({ label: getRingLabel(i + 1, ringCount), total: 0 }));
  const quadrantStats = ['NE', 'NW', 'SW', 'SE'].map(label => ({ label, total: 0 }));
  const quadMap      = new Map(quadrantStats.map(e => [e.label, e]));

  for (const die of fullDies) {
    const { ring, quadrant } = classifyDie(die, wafer, { ringCount });
    ringStats[ring - 1].total += 1;
    quadMap.get(quadrant).total += 1;
  }

  const toHtml = rows => rows.map(r => `
    <div class="stats-row">
      <span class="stats-key">${r.label}</span>
      <span class="stats-value">${r.total} dies</span>
    </div>
  `).join('');

  document.getElementById('ring-stats').innerHTML     = toHtml(ringStats);
  document.getElementById('quadrant-stats').innerHTML = toHtml(quadrantStats);
}

function formatKey(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}

main().catch(err => {
  console.error(err);
  document.getElementById('chart').textContent = `Failed to load demo: ${err.message}`;
});
