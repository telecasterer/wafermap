import {
  createWafer,
  generateDies,
  clipDiesToWafer,
  applyOrientation,
  getUniqueBins,
  aggregateBinCounts,
  listColorSchemes,
  buildScene,
  toPlotly,
} from 'wafermap';

const DIE_SIZE = { width: 10, height: 10 };
const WAFER_DIAMETER = 150;
const WAFER_IDS = ['W01', 'W02', 'W03', 'W04', 'W05', 'W06'];

const state = {
  colorScheme: 'color',
  showRingBoundaries: false,
  wafer: null,
  diesByWafer: [],
  uniqueBins: [],
};

async function main() {
  const rows = await loadCsv('../../data/dummy-fulldata.csv');

  // All wafers share the same spatial layout — create one template wafer.
  const firstRow = rows.find((r) => r.wafer === WAFER_IDS[0]) ?? {};
  state.wafer = createWafer({
    diameter: WAFER_DIAMETER,
    flat: { type: 'bottom', length: 30 },
    orientation: 0,
    metadata: {
      lot: firstRow.lot ?? 'LOT456',
      waferNumber: 0,
      testDate: firstRow.testdate ?? '—',
      testProgram: 'PROG-V300-1',
      temperature: Number(firstRow.temp ?? 25),
    },
  });

  const generated = generateDies(state.wafer, DIE_SIZE);
  const clipped = clipDiesToWafer(generated, state.wafer, DIE_SIZE);

  for (const waferId of WAFER_IDS) {
    const waferRows = rows.filter((r) => r.wafer === waferId);
    const dies = applyOrientation(enrichDiesFromRows(clipped, waferRows), state.wafer);
    state.diesByWafer.push(dies);
  }

  state.uniqueBins = getUniqueBins(state.diesByWafer.flat());

  buildGalleryGrid();
  bindControls();
  renderAll();
}

async function loadCsv(path) {
  const response = await fetch(path);
  const text = await response.text();
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(',');
  return lines.filter(Boolean).map((line) => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}

function enrichDiesFromRows(dies, rows) {
  const rowMap = new Map(rows.map((r) => [`${Number(r.x)},${Number(r.y)}`, r]));
  return dies.map((die) => {
    const row = rowMap.get(`${die.i},${die.j}`);
    return row
      ? { ...die, values: [Number(row.testA)], bins: [Number(row.hbin)], metadata: {} }
      : { ...die, values: [0], bins: [0], metadata: {} };
  });
}

function buildGalleryGrid() {
  const grid = document.getElementById('gallery');
  grid.innerHTML = state.uniqueBins.map((bin) => `
    <div class="bin-card">
      <div class="bin-header">
        <span class="bin-title">Bin ${bin}</span>
        <span class="bin-subtitle" id="subtitle-${bin}"></span>
      </div>
      <div class="bin-chart" id="chart-bin-${bin}"></div>
      <div class="bin-footer" id="footer-${bin}"></div>
    </div>
  `).join('');
}

function renderAll() {
  updateToggleStates();
  const numWafers = state.diesByWafer.length;

  for (const bin of state.uniqueBins) {
    const aggregated = aggregateBinCounts(state.diesByWafer, bin);
    const totalOccurrences = aggregated.reduce((sum, d) => sum + (d.values?.[0] ?? 0), 0);
    const affectedPositions = aggregated.filter((d) => (d.values?.[0] ?? 0) > 0).length;

    const scene = buildScene(state.wafer, aggregated, [], {
      plotMode: 'value',
      valueRange: [0, numWafers],
      colorScheme: state.colorScheme,
      showRingBoundaries: state.showRingBoundaries,
    });

    const { data, layout } = toPlotly(scene);
    Plotly.react(`chart-bin-${bin}`, data, {
      ...layout,
      margin: { t: 8, l: 8, r: 50, b: 8 },
    }, { responsive: true });

    document.getElementById(`subtitle-${bin}`).textContent =
      `${affectedPositions} positions · ${totalOccurrences} total`;
    document.getElementById(`footer-${bin}`).textContent =
      `0 = never   ${numWafers} = all ${numWafers} wafers`;
  }
}

function updateToggleStates() {
  document.getElementById('toggle-rings').classList.toggle('active', state.showRingBoundaries);
  document.getElementById('color-scheme').value = state.colorScheme;
}

function bindControls() {
  const colorSel = document.getElementById('color-scheme');
  colorSel.innerHTML = listColorSchemes()
    .filter(({ name }) => name !== 'color')
    .map(({ name, label }) => `<option value="${name}"${name === state.colorScheme ? ' selected' : ''}>${label}</option>`)
    .join('');
  colorSel.addEventListener('change', (e) => {
    state.colorScheme = e.target.value;
    renderAll();
  });
  document.getElementById('toggle-rings').addEventListener('click', () => {
    state.showRingBoundaries = !state.showRingBoundaries;
    renderAll();
  });
}

main().catch((err) => {
  console.error(err);
  document.getElementById('gallery').textContent = `Failed to load: ${err.message}`;
});
