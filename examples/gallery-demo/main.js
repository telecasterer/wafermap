import { buildWaferMap } from 'wafermap';
import { renderWaferGallery } from 'wafermap/canvas-adapter';

const PITCH = 10;
const WAFER_IDS = ['W01', 'W02', 'W03', 'W04'];

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
    });

    items.push({ wafer: result.wafer, dies: result.dies, label: `${firstRow.lot ?? 'LOT456'} · ${waferId}` });
  }

  renderWaferGallery(
    document.getElementById('gallery'),
    items,
    { sceneOptions: { plotMode: 'hardbin' } },
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
