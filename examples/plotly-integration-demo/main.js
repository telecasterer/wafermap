import {
  createWafer,
  generateDies,
  clipDiesToWafer,
  applyOrientation,
  classifyDie,
  getRingLabel,
  listColorSchemes,
  buildScene,
  toPlotly,
} from 'wafermap';

const DIE_SIZE = { width: 10, height: 10 };
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
  const waferRows = rows.filter((row) => row.wafer === 'W01');
  const firstRow = waferRows[0] ?? {};

  state.wafer = createWafer({
    diameter: WAFER_DIAMETER,
    flat: { type: 'bottom', length: 30 },
    orientation: 0,
    metadata: {
      lot: firstRow.lot ?? 'LOT456',
      waferNumber: 1,
      testDate: firstRow.testdate ?? '—',
      testProgram: 'PROG-V300-1',
      temperature: Number(firstRow.temp ?? 25),
    },
  });

  const generated = generateDies(state.wafer, DIE_SIZE);
  const clipped = clipDiesToWafer(generated, state.wafer, DIE_SIZE);
  state.dies = applyOrientation(enrichDiesFromRows(clipped, waferRows), state.wafer);

  bindControls();
  render();
}

async function loadCsv(path) {
  const response = await fetch(path);
  const text = await response.text();
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(',');
  return lines.filter(Boolean).map((line) => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function enrichDiesFromRows(dies, rows) {
  const rowMap = new Map(rows.map((row) => [`${Number(row.x)},${Number(row.y)}`, row]));

  return dies.map((die) => {
    const row = rowMap.get(`${die.i},${die.j}`);
    if (!row) {
      return { ...die, values: [0], bins: [0], metadata: {} };
    }

    return {
      ...die,
      values: [Number(row.testA), Number(row.testB), Number(row.testC)],
      bins: [Number(row.hbin), Number(row.sbin)],
      metadata: {
        lotId: row.lot,
        waferId: `${row.lot}-${row.wafer}`,
        testDate: row.testdate,
        temperature: row.temp,
        customFields: {
          hbin: row.hbin,
          sbin: row.sbin,
          testA: row.testA,
          testB: row.testB,
          testC: row.testC,
        },
      },
    };
  });
}

function bindControls() {
  const bindToggle = (id, key) => {
    const button = document.getElementById(id);
    button.addEventListener('click', () => {
      state[key] = !state[key];
      render();
    });
  };

  document.getElementById('mode').addEventListener('change', (event) => {
    state.plotMode = event.target.value;
    render();
  });

  document.getElementById('ring-count').addEventListener('change', (event) => {
    state.ringCount = Number(event.target.value) || 4;
    render();
  });

  bindToggle('toggle-text', 'showText');
  bindToggle('toggle-rings', 'showRingBoundaries');
  bindToggle('toggle-quadrants', 'showQuadrantBoundaries');
  bindToggle('toggle-axes', 'showAxes');
  bindToggle('toggle-units', 'showUnits');

  const colorSel = document.getElementById('color-scheme');
  colorSel.innerHTML = listColorSchemes()
    .filter(({ name }) => name !== 'color')
    .map(({ name, label }) => `<option value="${name}"${name === state.colorScheme ? ' selected' : ''}>${label}</option>`)
    .join('');
  colorSel.addEventListener('change', (event) => {
    state.colorScheme = event.target.value;
    render();
  });
}

function render() {
  updateToggleStates();

  const scene = buildScene(state.wafer, state.dies, [], {
    plotMode: state.plotMode,
    showText: state.showText,
    ringCount: state.ringCount,
    showRingBoundaries: state.showRingBoundaries,
    showQuadrantBoundaries: state.showQuadrantBoundaries,
    colorScheme: state.colorScheme,
  });

  const { data, layout } = toPlotly(scene, {
    showAxes: state.showAxes,
    showUnits: state.showUnits,
    diePitch: { x: 10, y: 10 },
  });
  Plotly.react('chart', data, {
    ...layout,
    title: { text: 'wmap Package → Scene → Plotly', x: 0.03 },
    margin: { t: 48, l: state.showAxes ? 48 : 10, r: 40, b: state.showAxes ? 40 : 10 },
  }, { responsive: true });

  renderMetadata(scene.metadata);
  renderSummaryStats(state.dies);
  renderSpatialStats(state.dies, state.wafer, state.ringCount);
}

function updateToggleStates() {
  for (const [id, active] of [
    ['toggle-text', state.showText],
    ['toggle-rings', state.showRingBoundaries],
    ['toggle-quadrants', state.showQuadrantBoundaries],
    ['toggle-axes', state.showAxes],
    ['toggle-units', state.showUnits],
  ]) {
    document.getElementById(id).classList.toggle('active', active);
  }

  document.getElementById('mode').value = state.plotMode;
  document.getElementById('ring-count').value = String(state.ringCount);
  document.getElementById('color-scheme').value = state.colorScheme;
}

function renderMetadata(metadata) {
  const target = document.getElementById('wafer-meta');
  target.innerHTML = Object.entries(metadata ?? {}).map(([key, value]) => `
    <div class="meta-row">
      <span class="meta-key">${formatKey(key)}</span>
      <span>${value}</span>
    </div>
  `).join('');
}

function renderSummaryStats(dies) {
  const fullDies = dies.filter((die) => !die.partial);
  const binCounts = {};
  for (const die of fullDies) {
    const bin = die.bins?.[0] ?? 0;
    binCounts[bin] = (binCounts[bin] ?? 0) + 1;
  }
  const target = document.getElementById('summary-stats');
  const rows = [
    ['Total Dies', fullDies.length],
    ['Partial Dies', dies.filter((die) => die.partial).length],
    ...Object.entries(binCounts).sort(([a], [b]) => Number(a) - Number(b)).map(([bin, count]) => [
      `Bin ${bin}`,
      `${count} (${(100 * count / fullDies.length).toFixed(1)}%)`,
    ]),
  ];

  target.innerHTML = rows.map(([key, value]) => `
    <div class="stats-row">
      <span class="stats-key">${key}</span>
      <span class="stats-value">${value}</span>
    </div>
  `).join('');
}

function renderSpatialStats(dies, wafer, ringCount) {
  const { ringStats, quadrantStats } = summarizeSpatialStats(dies, wafer, ringCount);
  renderStatsBlock('ring-stats', ringStats);
  renderStatsBlock('quadrant-stats', quadrantStats);
}

function renderStatsBlock(id, rows) {
  const target = document.getElementById(id);
  target.innerHTML = rows.map((row) => `
    <div class="stats-row">
      <span class="stats-key">${row.label}</span>
      <span class="stats-value">${row.total} dies</span>
    </div>
  `).join('');
}

function summarizeSpatialStats(dies, wafer, ringCount) {
  const fullDies = dies.filter((die) => !die.partial);
  const ringStats = Array.from({ length: ringCount }, (_, index) => ({
    label: getRingLabel(index + 1, ringCount),
    total: 0,
    pass: 0,
  }));
  const quadrantStats = ['NE', 'NW', 'SW', 'SE'].map((label) => ({
    label,
    total: 0,
    pass: 0,
  }));
  const quadrantMap = new Map(quadrantStats.map((entry) => [entry.label, entry]));

  for (const die of fullDies) {
    const { ring, quadrant } = classifyDie(die, wafer, { ringCount });
    ringStats[ring - 1].total += 1;
    quadrantMap.get(quadrant).total += 1;
  }

  return { ringStats, quadrantStats };
}

function formatKey(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}

main().catch((error) => {
  console.error(error);
  document.getElementById('chart').textContent = `Failed to load demo: ${error.message}`;
});
