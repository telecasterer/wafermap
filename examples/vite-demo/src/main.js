import Plotly from 'plotly.js-dist-min';
import {
  createWafer,
  generateDies,
  clipDiesToWafer,
  applyOrientation,
  buildScene,
  toPlotly,
} from 'wafermap';
import './style.css';

const waferMeta = {
  lot: 'LOT-VITE',
  waferNumber: 12,
  testDate: '2026-04-21',
  testProgram: 'E2E-VITE',
  temperature: 25,
};

document.querySelector('#app').innerHTML = `
  <main class="shell">
    <section class="hero">
      <span class="eyebrow">Bundler Example</span>
      <h1>wafermap + Vite + Plotly</h1>
      <p>
        This example consumes the local <code>wafermap</code> package through a normal bundler workflow.
        It is the next step after the browser import-map demos.
      </p>
    </section>

    <section class="controls">
      <label>
        <span>Mode</span>
        <select id="mode">
          <option value="value">Value</option>
          <option value="hardbin">Hard Bin</option>
          <option value="softbin">Soft Bin</option>
          <option value="stacked_values">Stacked Values</option>
          <option value="stacked_bins">Stacked Bins</option>
        </select>
      </label>

      <label>
        <span>Labels</span>
        <input id="labels" type="checkbox" />
      </label>

      <label>
        <span>Rings</span>
        <input id="rings" type="checkbox" checked />
      </label>

      <label>
        <span>Quadrants</span>
        <input id="quadrants" type="checkbox" />
      </label>
    </section>

    <section class="layout">
      <div class="card chart-card">
        <div id="chart"></div>
      </div>
      <aside class="card meta-card">
        <h2>Wafer Metadata</h2>
        <div id="meta"></div>
      </aside>
    </section>
  </main>
`;

const state = {
  plotMode: 'value',
  showText: false,
  showRingBoundaries: true,
  showQuadrantBoundaries: false,
};

const wafer = createWafer({
  diameter: 300,
  flat: { type: 'bottom', length: 40 },
  metadata: waferMeta,
});

const dies = applyOrientation(enrichDies(
  clipDiesToWafer(generateDies(wafer, { width: 10, height: 10 }), wafer, { width: 10, height: 10 })
), wafer);

function enrichDies(input) {
  return input.map((die) => {
    const radial = Math.sqrt(die.i ** 2 + die.j ** 2);
    const value = Math.max(0.05, 0.97 - radial * 0.055 + Math.sin(die.i * 0.8 + die.j * 0.5) * 0.03);
    return {
      ...die,
      values: [value, Math.max(0.05, value - 0.08), Math.max(0.05, value - 0.14)],
      bins: [toBin(value), toBin(value - 0.08), toBin(value - 0.14)],
      metadata: {
        lotId: waferMeta.lot,
        waferId: `${waferMeta.lot}-W${String(waferMeta.waferNumber).padStart(2, '0')}`,
        deviceType: 'ViteDemoDevice',
      },
    };
  });
}

function toBin(value) {
  if (value >= 0.75) return 1;
  if (value >= 0.5) return 2;
  return 3;
}

function render() {
  const scene = buildScene(wafer, dies, [], {
    plotMode: state.plotMode,
    showText: state.showText,
    showRingBoundaries: state.showRingBoundaries,
    showQuadrantBoundaries: state.showQuadrantBoundaries,
    ringCount: 4,
  });

  const plot = toPlotly(scene);
  Plotly.react('chart', plot.data, {
    ...plot.layout,
    title: { text: 'wafermap Vite Consumer', x: 0.03 },
    margin: { t: 48, l: 12, r: 24, b: 12 },
  }, { responsive: true });

  document.querySelector('#meta').innerHTML = Object.entries(waferMeta).map(([key, value]) => `
    <div class="meta-row">
      <span>${formatKey(key)}</span>
      <strong>${value}</strong>
    </div>
  `).join('');
}

function formatKey(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}

document.querySelector('#mode').addEventListener('change', (event) => {
  state.plotMode = event.target.value;
  render();
});

document.querySelector('#labels').addEventListener('change', (event) => {
  state.showText = event.target.checked;
  render();
});

document.querySelector('#rings').addEventListener('change', (event) => {
  state.showRingBoundaries = event.target.checked;
  render();
});

document.querySelector('#quadrants').addEventListener('change', (event) => {
  state.showQuadrantBoundaries = event.target.checked;
  render();
});

render();
