import {
  buildWaferMap,
  listColorSchemes,
  buildScene,
  toPlotly,
} from 'wafermap';

// Data file uses die-index x/y; multiply by pitch to get mm coordinates.
const PITCH = 10;
const WAFER_IDS = ['W01', 'W02', 'W03', 'W04'];

const state = {
  plotMode: 'hardbin',
  showRingBoundaries: false,
  showQuadrantBoundaries: false,
  ringCount: 4,
  colorScheme: 'color',
  wafers: [],
  allDies: {},
};

async function main() {
  const rows = await loadCsv('../../data/dummy-fulldata.csv');

  for (const waferId of WAFER_IDS) {
    const waferRows = rows.filter((row) => row.wafer === waferId);
    const firstRow = waferRows[0] ?? {};

    // Convert die-index x/y to mm coordinates for buildWaferMap.
    const data = waferRows.map((row) => ({
      x: Number(row.x) * PITCH,
      y: Number(row.y) * PITCH,
      bin: Number(row.hbin),
      value: Number(row.testA),
    }));

    const result = buildWaferMap({
      data,
      wafer: {
        diameter: 150,
        flat: { type: 'bottom', length: 30 },
        orientation: 0,
        metadata: {
          lot: firstRow.lot ?? 'LOT456',
          waferNumber: Number(waferId.replace(/\D/g, '')),
          testDate: firstRow.testdate ?? '—',
          testProgram: 'PROG-V300-1',
          temperature: Number(firstRow.temp ?? 25),
        },
      },
      die: { width: PITCH, height: PITCH },
    });

    // buildWaferMap attaches one value (testA) and one bin (hbin).
    // Post-enrich with additional test channels and softbin using the
    // established i/j indices so stacked modes work correctly.
    const rowMap = new Map(waferRows.map((row) => [`${row.x},${row.y}`, row]));
    const dies = result.dies.map((die) => {
      const row = rowMap.get(`${die.i},${die.j}`);
      if (!row) return die;
      return {
        ...die,
        values: [Number(row.testA), Number(row.testB), Number(row.testC)],
        bins: [Number(row.hbin), Number(row.sbin)],
        metadata: {
          lotId: row.lot,
          waferId: `${row.lot}-${row.wafer}`,
          testDate: row.testdate,
          temperature: row.temp,
          customFields: { hbin: row.hbin, sbin: row.sbin },
        },
      };
    });

    state.wafers.push(result.wafer);
    state.allDies[waferId] = dies;
  }

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
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function renderAll() {
  updateToggleStates();

  for (let index = 0; index < WAFER_IDS.length; index++) {
    const waferId = WAFER_IDS[index];
    const wafer = state.wafers[index];
    const dies = state.allDies[waferId];

    const scene = buildScene(wafer, dies, [], {
      plotMode: state.plotMode,
      showRingBoundaries: state.showRingBoundaries,
      showQuadrantBoundaries: state.showQuadrantBoundaries,
      ringCount: state.ringCount,
      colorScheme: state.colorScheme,
    });

    const { data, layout } = toPlotly(scene);
    Plotly.react(`chart-${waferId}`, data, {
      ...layout,
      margin: { t: 10, l: 10, r: 40, b: 10 },
    }, { responsive: true });

    renderWaferStats(`stats-${waferId}`, dies, wafer);
  }
}

function renderWaferStats(targetId, dies, wafer) {
  const fullDies = dies.filter((die) => !die.partial);
  const binCounts = {};
  for (const die of fullDies) {
    const bin = die.bins?.[0] ?? 0;
    binCounts[bin] = (binCounts[bin] ?? 0) + 1;
  }

  const rows = Object.entries(binCounts)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([bin, count]) => `<tr><td>Bin ${bin}</td><td>${count} (${(100 * count / fullDies.length).toFixed(1)}%)</td></tr>`)
    .join('');

  document.getElementById(targetId).innerHTML = `
    <tr><td>Total</td><td>${fullDies.length} dies</td></tr>
    ${rows}
  `;
}

function updateToggleStates() {
  document.getElementById('toggle-rings').classList.toggle('active', state.showRingBoundaries);
  document.getElementById('toggle-quadrants').classList.toggle('active', state.showQuadrantBoundaries);
  document.getElementById('mode').value = state.plotMode;
  document.getElementById('color-scheme').value = state.colorScheme;
  document.getElementById('ring-count').value = String(state.ringCount);
}

function bindControls() {
  document.getElementById('mode').addEventListener('change', (event) => {
    state.plotMode = event.target.value;
    renderAll();
  });

  const colorSel = document.getElementById('color-scheme');
  colorSel.innerHTML = listColorSchemes()
    .filter(({ name }) => name !== 'color')
    .map(({ name, label }) => `<option value="${name}"${name === state.colorScheme ? ' selected' : ''}>${label}</option>`)
    .join('');
  colorSel.addEventListener('change', (event) => {
    state.colorScheme = event.target.value;
    renderAll();
  });

  document.getElementById('ring-count').addEventListener('change', (event) => {
    state.ringCount = Number(event.target.value) || 4;
    renderAll();
  });

  document.getElementById('toggle-rings').addEventListener('click', () => {
    state.showRingBoundaries = !state.showRingBoundaries;
    renderAll();
  });

  document.getElementById('toggle-quadrants').addEventListener('click', () => {
    state.showQuadrantBoundaries = !state.showQuadrantBoundaries;
    renderAll();
  });
}

main().catch((error) => {
  console.error(error);
  document.querySelector('.gallery').textContent = `Failed to load: ${error.message}`;
});
