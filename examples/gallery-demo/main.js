import { buildWaferMap, aggregateValues, aggregateBinCounts, getUniqueBins } from 'wafermap';
import { renderWaferGallery } from 'wafermap/canvas-adapter';

const PITCH = 10;
const WAFER_IDS = ['W01', 'W02', 'W03', 'W04'];

const TEST_DEFS_WITH_UNITS = [
  { index: 0, name: 'Idsat', unit: 'A' },
  { index: 1, name: 'Vth',   unit: 'V' },
  { index: 2, name: 'Ioff',  unit: 'A' },
  { index: 3, name: 'Cgg',   unit: 'F' },
];
const TEST_DEFS_NO_UNITS = [
  { index: 0, name: 'Idsat' },
  { index: 1, name: 'Vth'   },
  { index: 2, name: 'Ioff'  },
  { index: 3, name: 'Cgg'   },
];

const HBIN_DEFS = [
  { bin: 1, name: 'Pass' },
  { bin: 2, name: 'Leakage' },
  { bin: 3, name: 'Vth Shift' },
];
const SBIN_DEFS = [
  { bin: 10, name: 'Pass - Nominal' },
  { bin: 11, name: 'Pass - Hi Idsat' },
  { bin: 12, name: 'Pass - Lo Idsat' },
  { bin: 20, name: 'Leakage - Gate' },
  { bin: 21, name: 'Leakage - Junction' },
  { bin: 22, name: 'Leakage - Bulk' },
  { bin: 23, name: 'Leakage - STI' },
  { bin: 25, name: 'Leakage - Corner' },
  { bin: 26, name: 'Leakage - Edge' },
  { bin: 40, name: 'Vth - Hi NMOS' },
  { bin: 41, name: 'Vth - Lo NMOS' },
  { bin: 42, name: 'Vth - Hi PMOS' },
];

// ── State ──────────────────────────────────────────────────────────────────
let showUnits       = true;
let fallbackFormat  = 'engineering';
let aggregated      = false;    // true = show aggregated lot map instead of individual wafers
let aggrMethod      = 'mean';   // for aggregateValues
let aggrParam       = 0;        // which values[] index to aggregate (test parameter)
let aggrTargetBin   = 1;        // for aggregateBinCounts (bin value, e.g. 1 = Pass)
let aggrBinType     = 0;        // which bins[] index for aggregateBinCounts (0=hard, 1=soft)

let gallery         = null;
let waferItems      = [];       // individual wafer items (from buildWaferMap)
let waferDiesByWafer = [];      // Die[][] for aggregation functions

function currentTestDefs() {
  return showUnits ? TEST_DEFS_WITH_UNITS : TEST_DEFS_NO_UNITS;
}

// Build the gallery items from current state (individual or aggregated).
function buildGalleryItems(plotMode) {
  if (!aggregated) return waferItems;

  const isBinMode = plotMode === 'hardbin' || plotMode === 'softbin' || plotMode === 'stackedBins';

  if (isBinMode) {
    // Aggregate bin counts: count how many wafers had aggrTargetBin at each position
    const dies = aggregateBinCounts(waferDiesByWafer, aggrTargetBin, aggrBinType);
    const binDef = (aggrBinType === 0 ? HBIN_DEFS : SBIN_DEFS)
      .find(d => d.bin === aggrTargetBin);
    const binName = binDef?.name ?? `Bin ${aggrTargetBin}`;
    return [{ wafer: waferItems[0].wafer, dies, label: `Lot — ${binName} count (${WAFER_IDS.length} wafers)` }];
  } else {
    // Aggregate values: apply method across all wafers for the chosen test parameter
    const dies = aggregateValues(waferDiesByWafer, aggrMethod, aggrParam);
    const chDef = currentTestDefs().find(d => d.index === aggrParam);
    const chName = chDef?.name ?? `Param ${aggrParam}`;
    return [{ wafer: waferItems[0].wafer, dies, label: `Lot — ${chName} ${aggrMethod}` }];
  }
}

function currentPlotMode() {
  return gallery?.getOptions()?.plotMode ?? 'value';
}

function refreshGallery() {
  if (!gallery) return;
  const mode = currentPlotMode();
  gallery.setItems(buildGalleryItems(mode));
  gallery.setOptions({ testDefs: currentTestDefs(), hbinDefs: HBIN_DEFS, sbinDefs: SBIN_DEFS });
  gallery.setFallbackFormat(fallbackFormat);
  syncControlVis();
}

// ── Controls ───────────────────────────────────────────────────────────────

let elAggrControls = null;   // aggregation sub-controls row (shown when aggregated)
let elAggrMethod   = null;
let elAggrParam    = null;
let elAggrBin      = null;
let elAggrBinType  = null;

function syncControlVis() {
  if (!elAggrControls) return;
  elAggrControls.style.display = aggregated ? '' : 'none';

  const mode = currentPlotMode();
  const isBinMode = mode === 'hardbin' || mode === 'softbin' || mode === 'stackedBins';
  elAggrMethod.closest('label').style.display = aggregated && !isBinMode ? '' : 'none';
  elAggrParam.closest('label').style.display  = aggregated && !isBinMode ? '' : 'none';
  elAggrBin.closest('label').style.display    = aggregated && isBinMode  ? '' : 'none';
  elAggrBinType.closest('label').style.display = aggregated && isBinMode ? '' : 'none';
}

function buildControls() {
  const bar = document.getElementById('controls');

  // ── Row 1: format controls ────────────────────────────────────────────────
  const row1 = document.createElement('div');
  row1.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:center;width:100%;';

  // fallbackFormat select
  const fmtLabel = document.createElement('label');
  fmtLabel.textContent = 'Unitless format: ';
  const fmtSel = document.createElement('select');
  [['engineering', 'Engineering (12E-6)'], ['si', 'SI prefix (12 µ)']].forEach(([v, t]) => {
    const o = document.createElement('option');
    o.value = v; o.textContent = t;
    if (v === fallbackFormat) o.selected = true;
    fmtSel.appendChild(o);
  });
  fmtSel.addEventListener('change', () => { fallbackFormat = fmtSel.value; refreshGallery(); });
  fmtLabel.appendChild(fmtSel);

  // units select
  const unitLabel = document.createElement('label');
  unitLabel.textContent = 'Test units: ';
  const unitSel = document.createElement('select');
  [['units', 'With units (A / V / F)'], ['no-units', 'Without units']].forEach(([v, t]) => {
    const o = document.createElement('option');
    o.value = v; o.textContent = t;
    if ((v === 'units') === showUnits) o.selected = true;
    unitSel.appendChild(o);
  });
  unitSel.addEventListener('change', () => { showUnits = unitSel.value === 'units'; refreshGallery(); });
  unitLabel.appendChild(unitSel);

  row1.appendChild(fmtLabel);
  row1.appendChild(unitLabel);

  // ── Row 2: aggregation controls ───────────────────────────────────────────
  const row2 = document.createElement('div');
  row2.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:center;width:100%;border-top:1px solid #e0e0e0;padding-top:8px;margin-top:4px;';

  // Aggregation toggle
  const aggrToggleLabel = document.createElement('label');
  aggrToggleLabel.textContent = 'View: ';
  const aggrToggle = document.createElement('select');
  [['individual', 'Individual wafers'], ['aggregated', 'Aggregated lot']].forEach(([v, t]) => {
    const o = document.createElement('option');
    o.value = v; o.textContent = t;
    if ((v === 'aggregated') === aggregated) o.selected = true;
    aggrToggle.appendChild(o);
  });
  aggrToggle.addEventListener('change', () => {
    aggregated = aggrToggle.value === 'aggregated';
    refreshGallery();
  });
  aggrToggleLabel.appendChild(aggrToggle);
  row2.appendChild(aggrToggleLabel);

  // Aggregation sub-controls (hidden when individual)
  elAggrControls = document.createElement('div');
  elAggrControls.style.cssText = 'display:none;display:flex;flex-wrap:wrap;gap:12px;align-items:center;';

  // Method (for value/stackedValues)
  const methodLabel = document.createElement('label');
  methodLabel.textContent = 'Method: ';
  elAggrMethod = document.createElement('select');
  [['mean','Mean'],['median','Median'],['stddev','Std dev'],['min','Min'],['max','Max']].forEach(([v,t]) => {
    const o = document.createElement('option');
    o.value = v; o.textContent = t;
    if (v === aggrMethod) o.selected = true;
    elAggrMethod.appendChild(o);
  });
  elAggrMethod.addEventListener('change', () => { aggrMethod = elAggrMethod.value; refreshGallery(); });
  methodLabel.appendChild(elAggrMethod);

  // Test parameter selector (for value/stackedValues aggregation)
  const paramLabel = document.createElement('label');
  paramLabel.textContent = 'Parameter: ';
  elAggrParam = document.createElement('select');
  TEST_DEFS_WITH_UNITS.forEach(d => {
    const o = document.createElement('option');
    o.value = d.index; o.textContent = d.name;
    if (d.index === aggrParam) o.selected = true;
    elAggrParam.appendChild(o);
  });
  elAggrParam.addEventListener('change', () => { aggrParam = Number(elAggrParam.value); refreshGallery(); });
  paramLabel.appendChild(elAggrParam);

  // Target bin (for bin aggregation)
  const binLabel = document.createElement('label');
  binLabel.textContent = 'Target bin: ';
  elAggrBin = document.createElement('select');
  [...HBIN_DEFS, ...SBIN_DEFS].forEach(d => {
    const o = document.createElement('option');
    o.value = d.bin; o.textContent = d.name;
    if (d.bin === aggrTargetBin) o.selected = true;
    elAggrBin.appendChild(o);
  });
  elAggrBin.addEventListener('change', () => { aggrTargetBin = Number(elAggrBin.value); refreshGallery(); });
  binLabel.appendChild(elAggrBin);

  // Bin type selector (hard vs soft) for bin count aggregation
  const binTypeLabel = document.createElement('label');
  binTypeLabel.textContent = 'Bin type: ';
  elAggrBinType = document.createElement('select');
  [['0','Hard bin'],['1','Soft bin']].forEach(([v,t]) => {
    const o = document.createElement('option');
    o.value = v; o.textContent = t;
    if (Number(v) === aggrBinType) o.selected = true;
    elAggrBinType.appendChild(o);
  });
  elAggrBinType.addEventListener('change', () => {
    aggrBinType = Number(elAggrBinType.value);
    // Rebuild the target bin dropdown to match the selected bin type
    const defs = aggrBinType === 0 ? HBIN_DEFS : SBIN_DEFS;
    elAggrBin.innerHTML = '';
    defs.forEach(d => {
      const o = document.createElement('option');
      o.value = d.bin; o.textContent = d.name;
      elAggrBin.appendChild(o);
    });
    aggrTargetBin = defs[0]?.bin ?? 1;
    elAggrBin.value = aggrTargetBin;
    refreshGallery();
  });
  binTypeLabel.appendChild(elAggrBinType);

  elAggrControls.appendChild(methodLabel);
  elAggrControls.appendChild(paramLabel);
  elAggrControls.appendChild(binLabel);
  elAggrControls.appendChild(binTypeLabel);

  row2.appendChild(aggrToggleLabel);
  row2.appendChild(elAggrControls);

  bar.appendChild(row1);
  bar.appendChild(row2);

  // Wire the gallery's mode changes so aggregation sub-controls
  // show/hide correctly when the user changes mode in the toolbar.
  // We poll via onSceneOptionsChange (passed as gallery option below).
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const rows = await loadCsv('../../data/fmt-demo.csv');
  waferItems = [];
  waferDiesByWafer = [];

  for (const waferId of WAFER_IDS) {
    const waferRows = rows.filter(row => row.wafer === waferId);
    const firstRow  = waferRows[0] ?? {};

    const results = waferRows.map(row => ({
      x:      Number(row.x),
      y:      Number(row.y),
      bins:   [Number(row.hbin), Number(row.sbin)],
      values: [Number(row.Idsat), Number(row.Vth), Number(row.Ioff), Number(row.Cgg)],
    }));

    const result = buildWaferMap({
      results,
      waferConfig: {
        diameter: 150,
        notch: { type: 'bottom' },
        metadata: { lot: firstRow.lot ?? 'FMTDEMO', waferNumber: Number(waferId.replace(/\D/g, '')) },
      },
      dieConfig: { width: PITCH, height: PITCH },
      testDefs:  TEST_DEFS_WITH_UNITS,
      hbinDefs:  HBIN_DEFS,
      sbinDefs:  SBIN_DEFS,
    });

    waferItems.push({ wafer: result.wafer, dies: result.dies, label: `${firstRow.lot ?? 'FMTDEMO'} · ${waferId}` });
    waferDiesByWafer.push(result.dies);
  }

  buildControls();

  gallery = renderWaferGallery(
    document.getElementById('gallery'),
    buildGalleryItems('value'),
    {
      sceneOptions: {
        plotMode:  'value',
        testIndex: 0,
        testDefs:  currentTestDefs(),
        hbinDefs:  HBIN_DEFS,
        sbinDefs:  SBIN_DEFS,
      },
      fallbackFormat,
      onSceneOptionsChange: (opts) => {
        if (aggregated) gallery.setItems(buildGalleryItems(opts.plotMode));
        syncControlVis();
      },
    },
  );

  syncControlVis();
}

async function loadCsv(path) {
  const text = await (await fetch(path)).text();
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(',');
  return lines.filter(Boolean).map(line => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}

main().catch(err => {
  document.getElementById('gallery').textContent = `Failed to load: ${err.message}`;
});
