import {
  createWafer,
  generateDies,
  clipDiesToWafer,
  applyOrientation,
  transformDies,
  applyProbeSequence,
  generateReticleGrid,
  buildScene,
  toPlotly,
} from 'wafermap';

const WAFER_META = {
  lot: 'LOT-XA2024',
  waferNumber: 3,
  testDate: '2026-04-21',
  testProgram: 'PROG-V300-1',
  temperature: 25,
};

const DIE_SIZE = { width: 10, height: 10 };

const appState = {
  wafer: null,
  baseDies: [],
  currentDies: [],
  reticles: [],
  rotation: 0,
  flipX: false,
  flipY: false,
  plotMode: 'value',
  showText: false,
  showReticle: false,
  showProbePath: false,
  showRingBoundaries: false,
  showQuadrantBoundaries: false,
  ringCount: 4,
};

async function main() {
  const wafer = createWafer({
    diameter: 300,
    flat: { type: 'bottom', length: 40 },
    orientation: 0,
    metadata: WAFER_META,
  });

  const allDies = generateDies(wafer, DIE_SIZE);
  const clipped = clipDiesToWafer(allDies, wafer, DIE_SIZE);
  const enriched = enrichDies(clipped, WAFER_META);
  const sequenced = applyProbeSequence(enriched, { type: 'snake' });
  const oriented = applyOrientation(sequenced, wafer);

  appState.wafer = wafer;
  appState.baseDies = oriented;
  appState.reticles = generateReticleGrid(wafer, { width: 30, height: 30, stepX: 30, stepY: 60 });

  updateMetaPanel(WAFER_META);
  wireControls();
  redraw();
}

function enrichDies(dies, waferMeta) {
  return dies.map((die) => {
    const radialDistance = Math.sqrt(die.i ** 2 + die.j ** 2);
    const noise = Math.sin(die.i * 2.7 + die.j * 1.9) * 0.04;
    const v1 = clamp01(1.0 - radialDistance * 0.052 + noise);
    const v2 = clamp01(0.9 - radialDistance * 0.057 + noise * 0.8);
    const v3 = clamp01(0.85 - radialDistance * 0.062 + noise * 0.6);

    return {
      ...die,
      values: [v1, v2, v3],
      bins: [valueToBin(v1), valueToBin(v2), valueToBin(v3)],
      metadata: {
        lotId: waferMeta.lot,
        waferId: `${waferMeta.lot}-W${String(waferMeta.waferNumber).padStart(2, '0')}`,
        deviceType: 'WMAP-DEMO',
        testProgram: waferMeta.testProgram,
        temperature: waferMeta.temperature,
        customFields: {
          site: `${die.i}:${die.j}`,
          radialBand: radialDistance.toFixed(2),
        },
      },
    };
  });
}

function clamp01(value) {
  return Math.max(0.01, Math.min(0.99, value));
}

function valueToBin(value) {
  if (value >= 0.75) return 1;
  if (value >= 0.5) return 2;
  return 3;
}

function redraw() {
  const interactiveTransform = {
    rotation: appState.rotation,
    flipX: appState.flipX,
    flipY: appState.flipY,
  };

  appState.currentDies = transformDies(appState.baseDies, interactiveTransform, appState.wafer.center);

  const scene = buildScene(appState.wafer, appState.currentDies, appState.reticles, {
    plotMode: appState.plotMode,
    showText: appState.showText,
    showReticle: appState.showReticle,
    showProbePath: appState.showProbePath,
    showRingBoundaries: appState.showRingBoundaries,
    showQuadrantBoundaries: appState.showQuadrantBoundaries,
    ringCount: appState.ringCount,
    interactiveTransform,
  });

  const { data, layout } = toPlotly(scene);
  Plotly.react('chart', data, layout, { responsive: true });
  updateUI();
}

function updateUI() {
  document.getElementById('rot-badge').textContent = `${appState.rotation}°`;
  document.getElementById('flipx-btn').classList.toggle('active', appState.flipX);
  document.getElementById('flipy-btn').classList.toggle('active', appState.flipY);

  const dies = appState.currentDies;
  const fullDies = dies.filter((die) => !die.partial);
  const pass = fullDies.filter((die) => die.bins?.[0] === 1).length;
  const total = fullDies.length;

  document.getElementById('stat-dies').textContent = total;
  document.getElementById('stat-pass').textContent = `${pass} (${total ? (100 * pass / total).toFixed(1) : 0}%)`;
  document.getElementById('stat-partial').textContent = dies.filter((die) => die.partial).length;

  const spatial = summarizeSpatialStats(dies, appState.wafer, appState.ringCount);
  renderStatsTable('ring-stats', spatial.ringStats);
  renderStatsTable('quadrant-stats', spatial.quadrantStats);
}

function updateMetaPanel(meta) {
  if (!meta) return;
  document.getElementById('meta-lot').textContent = meta.lot;
  document.getElementById('meta-wafer').textContent = meta.waferNumber;
  document.getElementById('meta-date').textContent = meta.testDate;
  document.getElementById('meta-program').textContent = meta.testProgram;
  document.getElementById('meta-temp').textContent = `${meta.temperature}°C`;
}

function summarizeSpatialStats(dies, wafer, ringCount) {
  const fullDies = dies.filter((die) => !die.partial);
  const ringStats = Array.from({ length: ringCount }, (_, index) => ({
    label: getRingDomainLabel(index, ringCount),
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
    const ring = ringStats[getRingIndex(die, wafer, ringCount) - 1];
    ring.total += 1;
    if (die.bins?.[0] === 1) ring.pass += 1;

    const quadrant = quadrantMap.get(getQuadrantLabel(die, wafer));
    quadrant.total += 1;
    if (die.bins?.[0] === 1) quadrant.pass += 1;
  }

  return { ringStats, quadrantStats };
}

function getRingIndex(die, wafer, ringCount) {
  const dx = die.x - wafer.center.x;
  const dy = die.y - wafer.center.y;
  const normalized = Math.sqrt(dx * dx + dy * dy) / wafer.radius;
  return Math.min(ringCount, Math.max(1, Math.floor(normalized * ringCount) + 1));
}

function getQuadrantLabel(die, wafer) {
  const dx = die.x - wafer.center.x;
  const dy = die.y - wafer.center.y;
  if (dx >= 0 && dy >= 0) return 'NE';
  if (dx < 0 && dy >= 0) return 'NW';
  if (dx < 0 && dy < 0) return 'SW';
  return 'SE';
}

function getRingDomainLabel(index, ringCount) {
  if (ringCount === 1) return 'Full Wafer';
  if (ringCount === 2) return index === 0 ? 'Core' : 'Edge';
  if (ringCount === 3) return ['Core', 'Middle', 'Edge'][index];
  if (ringCount === 4) return ['Core', 'Inner', 'Outer', 'Edge'][index];
  if (index === 0) return 'Core';
  if (index === ringCount - 1) return 'Edge';
  return `Middle ${index}`;
}

function renderStatsTable(targetId, rows) {
  const target = document.getElementById(targetId);
  target.innerHTML = rows.map((row) => {
    const percent = row.total ? (100 * row.pass / row.total).toFixed(1) : '0.0';
    return `<tr><td>${row.label}</td><td>${row.total} / ${row.pass} (${percent}%)</td></tr>`;
  }).join('');
}

function wireControls() {
  document.getElementById('sel-mode').addEventListener('change', (event) => {
    appState.plotMode = event.target.value;
    redraw();
  });

  for (const [id, key] of [
    ['chk-text', 'showText'],
    ['chk-reticle', 'showReticle'],
    ['chk-probe', 'showProbePath'],
    ['chk-rings', 'showRingBoundaries'],
    ['chk-quadrants', 'showQuadrantBoundaries'],
  ]) {
    document.getElementById(id).addEventListener('change', (event) => {
      appState[key] = event.target.checked;
      redraw();
    });
  }

  document.getElementById('sel-rings').addEventListener('change', (event) => {
    appState.ringCount = Number(event.target.value) || 4;
    redraw();
  });

  document.getElementById('rot-left-btn').addEventListener('click', () => {
    appState.rotation = (appState.rotation - 90 + 360) % 360;
    redraw();
  });

  document.getElementById('rot-right-btn').addEventListener('click', () => {
    appState.rotation = (appState.rotation + 90) % 360;
    redraw();
  });

  document.getElementById('flipx-btn').addEventListener('click', () => {
    appState.flipX = !appState.flipX;
    redraw();
  });

  document.getElementById('flipy-btn').addEventListener('click', () => {
    appState.flipY = !appState.flipY;
    redraw();
  });
}

main().catch(console.error);
