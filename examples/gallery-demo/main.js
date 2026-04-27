import { buildWaferMap } from 'wafermap';
import { renderWaferGallery } from 'wafermap/canvas-adapter';

const PITCH = 10;
const WAFER_IDS = ['W01', 'W02', 'W03', 'W04'];

const TEST_DEFS = [
  { index: 0, name: 'Idsat', unit: 'A' },
  { index: 1, name: 'Vth',   unit: 'V' },
  { index: 2, name: 'Ioff',  unit: 'A' },
];

// Hard bin definitions (bins[0]) — physical sort result, range 0–32767
const HBIN_DEFS = [
  { bin: 1, name: 'Pass' },
  { bin: 2, name: 'Leakage' },
  { bin: 3, name: 'Vth Shift' },
  { bin: 5, name: 'Contact Open' },
  { bin: 7, name: 'Parametric Low' },
];

// Soft bin definitions (bins[1]) — logical test-program classification, range 0–32767
// Each hard bin maps to 3–8 soft bin subtypes. Number spaces are independent.
const SBIN_DEFS = [
  // Pass subtypes: 10–17
  { bin: 10, name: 'Pass - Nominal' },
  { bin: 11, name: 'Pass - Hi Idsat' },
  { bin: 12, name: 'Pass - Lo Idsat' },
  { bin: 13, name: 'Pass - Hi Vth' },
  { bin: 14, name: 'Pass - Lo Vth' },
  { bin: 15, name: 'Pass - Hi Ioff' },
  { bin: 16, name: 'Pass - Lo Ioff' },
  { bin: 17, name: 'Pass - Marginal' },
  // Leakage subtypes: 20–26
  { bin: 20, name: 'Leakage - Gate' },
  { bin: 21, name: 'Leakage - Junction' },
  { bin: 22, name: 'Leakage - Bulk' },
  { bin: 23, name: 'Leakage - STI' },
  { bin: 24, name: 'Leakage - Hi Temp' },
  { bin: 25, name: 'Leakage - Corner' },
  { bin: 26, name: 'Leakage - Edge' },
  // Vth Shift subtypes: 40–46
  { bin: 40, name: 'Vth - Hi NMOS' },
  { bin: 41, name: 'Vth - Lo NMOS' },
  { bin: 42, name: 'Vth - Hi PMOS' },
  { bin: 43, name: 'Vth - Lo PMOS' },
  { bin: 44, name: 'Vth - Stress' },
  { bin: 45, name: 'Vth - Body Effect' },
  { bin: 46, name: 'Vth - Mismatch' },
  // Contact Open subtypes: 100–105
  { bin: 100, name: 'Contact - Poly' },
  { bin: 101, name: 'Contact - M1' },
  { bin: 102, name: 'Contact - M2' },
  { bin: 103, name: 'Contact - Via' },
  { bin: 104, name: 'Contact - Silicide' },
  { bin: 105, name: 'Contact - Open' },
  // Parametric Low subtypes: 200–207
  { bin: 200, name: 'Param - Idsat Low' },
  { bin: 201, name: 'Param - Ioff High' },
  { bin: 202, name: 'Param - Vth Drift' },
  { bin: 203, name: 'Param - Ron High' },
  { bin: 204, name: 'Param - Cgg High' },
  { bin: 205, name: 'Param - Noise' },
  { bin: 206, name: 'Param - Linearity' },
  { bin: 207, name: 'Param - Gain Low' },
];

async function main() {
  const rows = await loadCsv('../../data/dummy-fulldata.csv');
  const items = [];

  for (const waferId of WAFER_IDS) {
    const waferRows = rows.filter((row) => row.wafer === waferId);
    const firstRow = waferRows[0] ?? {};

    const result = buildWaferMap({
      results: waferRows.map((row) => ({
        x: Number(row.x),
        y: Number(row.y),
        bins:   [Number(row.hbin), Number(row.sbin)],
        values: [Number(row.testA), Number(row.testB), Number(row.testC)],
      })),
      waferConfig: {
        diameter: 150,
        notch: { type: 'bottom' },
        metadata: {
          lot: firstRow.lot ?? 'LOT456',
          waferNumber: Number(waferId.replace(/\D/g, '')),
          testDate: firstRow.testdate ?? '—',
          temperature: Number(firstRow.temp ?? 25),
        },
      },
      dieConfig: { width: PITCH, height: PITCH },
      testDefs: TEST_DEFS,
      hbinDefs: HBIN_DEFS,
      sbinDefs: SBIN_DEFS,
    });

    items.push({ wafer: result.wafer, dies: result.dies, label: `${firstRow.lot ?? 'LOT456'} · ${waferId}` });
  }

  renderWaferGallery(
    document.getElementById('gallery'),
    items,
    {
      sceneOptions: {
        plotMode: 'hardbin',
        testDefs: TEST_DEFS,
        hbinDefs: HBIN_DEFS,
        sbinDefs: SBIN_DEFS,
      },
    },
  );
}

async function loadCsv(path) {
  const text = await (await fetch(path)).text();
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(',');
  return lines.filter(Boolean).map((line) => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}

main().catch((err) => {
  document.getElementById('gallery').textContent = `Failed to load: ${err.message}`;
});
