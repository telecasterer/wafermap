import {
  createWafer,
  generateDies,
  clipDiesToWafer,
  applyOrientation,
  classifyDie,
  getRingLabel,
  buildScene,
  toPlotly,
} from 'wafermap';

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
  const rows = await loadCsv('../../data/dummy-advanced.csv');

  state.wafer = createWafer({
    diameter: 300,
    flat: { type: 'bottom', length: 40 },
    orientation: 0,
    metadata: {
      lot: 'LOT-XA2024',
      waferNumber: 3,
      testDate: '2026-04-21',
      testProgram: 'PROG-V300-1',
      temperature: 25,
    },
  });

  const generated = generateDies(state.wafer, { width: 10, height: 10 });
  const clipped = clipDiesToWafer(generated, state.wafer, { width: 10, height: 10 });

  state.dies = applyOrientation(enrichDiesFromRows(clipped, rows, state.wafer.metadata), state.wafer);

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

function enrichDiesFromRows(dies, rows, waferMeta) {
  const rowMap = new Map(rows.map((row) => [`${Number(row.i)},${Number(row.j)}`, row]));

  return dies.map((die) => {
    const row = rowMap.get(`${die.i},${die.j}`);
    const baseValue = row ? Number(row.value) : radialFallbackValue(die);
    const baseBin = row ? Number(row.bin) : valueToBin(baseValue);

    return {
      ...die,
      values: [
        clamp01(baseValue),
        clamp01(baseValue - 0.08 + Math.sin(die.i * 0.7) * 0.02),
        clamp01(baseValue - 0.13 + Math.cos(die.j * 0.8) * 0.02),
      ],
      bins: [
        baseBin,
        valueToBin(baseValue - 0.08),
        valueToBin(baseValue - 0.13),
      ],
      metadata: {
        lotId: waferMeta.lot,
        waferId: `${waferMeta.lot}-W${String(waferMeta.waferNumber).padStart(2, '0')}`,
        deviceType: 'PlotlyDemoDevice',
        testProgram: waferMeta.testProgram,
        temperature: waferMeta.temperature,
        customFields: {
          source: row ? 'dummy-advanced.csv' : 'fallback',
        },
      },
    };
  });
}

function radialFallbackValue(die) {
  const radialDistance = Math.sqrt(die.i ** 2 + die.j ** 2);
  return 0.96 - radialDistance * 0.055 + Math.sin(die.i * 0.8 + die.j * 0.4) * 0.02;
}

function clamp01(value) {
  return Math.max(0.01, Math.min(0.99, value));
}

function valueToBin(value) {
  if (value >= 0.75) return 1;
  if (value >= 0.5) return 2;
  return 3;
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

  document.getElementById('color-scheme').addEventListener('change', (event) => {
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
  const pass = fullDies.filter((die) => die.bins?.[0] === 1).length;
  const target = document.getElementById('summary-stats');
  const rows = [
    ['Total Dies', fullDies.length],
    ['Pass Dies', `${pass} (${fullDies.length ? (100 * pass / fullDies.length).toFixed(1) : '0.0'}%)`],
    ['Partial Dies', dies.filter((die) => die.partial).length],
    ['Mode', state.plotMode],
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
  target.innerHTML = rows.map((row) => {
    const rate = row.total ? (100 * row.pass / row.total).toFixed(1) : '0.0';
    return `
      <div class="stats-row">
        <span class="stats-key">${row.label}</span>
        <span class="stats-value">${row.total} / ${row.pass} (${rate}%)</span>
      </div>
    `;
  }).join('');
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
    if (die.bins?.[0] === 1) ringStats[ring - 1].pass += 1;
    quadrantMap.get(quadrant).total += 1;
    if (die.bins?.[0] === 1) quadrantMap.get(quadrant).pass += 1;
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
