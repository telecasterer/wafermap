import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createWafer,
  generateDies,
  clipDiesToWafer,
  mapDataToDies,
  applyOrientation,
  transformDies,
  applyProbeSequence,
  generateReticleGrid,
  buildScene,
  toPlotly,
} from '../dist/index.js';

function enrichDies(dies) {
  return dies.map((die) => ({
    ...die,
    values: [0.9 - Math.abs(die.i) * 0.1, 0.8 - Math.abs(die.j) * 0.1].map((value) => Math.max(0.1, value)),
    bins: [die.i === 0 ? 1 : 2, die.j === 0 ? 1 : 3],
    metadata: {
      lotId: 'LOT-001',
      waferId: 'LOT-001-W01',
      deviceType: 'TestDevice',
      customFields: {
        site: `${die.i}:${die.j}`,
      },
    },
  }));
}

test('core geometry pipeline produces clipped dies with expected metadata hooks', () => {
  const wafer = createWafer({
    diameter: 40,
    notch: { type: 'bottom' },
    metadata: {
      lot: 'LOT-001',
      waferNumber: 1,
      testDate: '2026-04-21',
      testProgram: 'CP1',
      temperature: 25,
    },
  });

  assert.equal(wafer.radius, 20);
  assert.deepEqual(wafer.center, { x: 0, y: 0 });

  const dies = generateDies(wafer, { width: 10, height: 10, gridSize: 2 });
  assert.ok(dies.some((die) => die.id === '0_0'));
  assert.ok(dies.some((die) => die.i < 0 && die.j < 0));

  const clipped = clipDiesToWafer(dies, wafer, { width: 10, height: 10 });
  assert.ok(clipped.length < dies.length);
  assert.ok(clipped.every((die) => die.insideWafer === true));
  assert.ok(clipped.some((die) => die.partial));

  const mapped = mapDataToDies(clipped, [
    { i: 0, j: 0, value: 0.97 },
    { i: 1, j: 0, value: 0.88 },
  ], {
    valueField: 'value',
    matchBy: 'ij',
  });

  const centerDie = mapped.find((die) => die.i === 0 && die.j === 0);
  assert.deepEqual(centerDie.values, [0.97]);
});

test('orientation, transforms, and probe sequencing behave predictably', () => {
  const wafer = createWafer({ diameter: 100, orientation: 90 });
  const dies = [
    { id: '1_0', i: 1, j: 0, x: 10, y: 0, width: 10, height: 10 },
    { id: '0_1', i: 0, j: 1, x: 0, y: 10, width: 10, height: 10 },
  ];

  const oriented = applyOrientation(dies, wafer);
  assert.equal(Math.round(oriented[0].x), 0);
  assert.equal(Math.round(oriented[0].y), 10);

  const transformed = transformDies(oriented, { rotation: 90, flipX: true }, wafer.center);
  assert.equal(Math.round(transformed[0].x), 10);
  assert.equal(Math.round(transformed[0].y), 0);

  const sequenced = applyProbeSequence([
    { id: '0_1', i: 0, j: 1, x: 0, y: 10, width: 10, height: 10 },
    { id: '1_1', i: 1, j: 1, x: 10, y: 10, width: 10, height: 10 },
    { id: '0_0', i: 0, j: 0, x: 0, y: 0, width: 10, height: 10 },
    { id: '1_0', i: 1, j: 0, x: 10, y: 0, width: 10, height: 10 },
  ], { type: 'snake' });

  assert.deepEqual(
    sequenced.map((die) => `${die.id}:${die.probeIndex}`),
    ['0_1:0', '1_1:1', '1_0:2', '0_0:3']
  );
});

test('renderer builds scene rectangles, overlays, and text for stacked modes', () => {
  const wafer = createWafer({
    diameter: 60,
    metadata: {
      lot: 'LOT-001',
      waferNumber: 1,
      testDate: '2026-04-21',
      testProgram: 'CP1',
      temperature: 25,
    },
  });

  const clipped = clipDiesToWafer(
    generateDies(wafer, { width: 10, height: 10, gridSize: 1 }),
    wafer,
    { width: 10, height: 10 }
  );
  const dies = enrichDies(clipped);
  const reticles = generateReticleGrid(wafer, { width: 2, height: 2, diePitchX: 10, diePitchY: 10 });

  const scene = buildScene(wafer, dies, {
    plotMode: 'stackedBins',
    showText: true,
    showReticle: true,
    showProbePath: true,
    showRingBoundaries: true,
    showQuadrantBoundaries: true,
    ringCount: 4,
    reticles,
  });

  assert.equal(scene.metadata.lot, 'LOT-001');
  assert.ok(scene.rectangles.length > dies.length);
  assert.ok(scene.texts.length > 0);
  assert.ok(scene.hoverPoints.every((point) => point.text.includes('Die (')));
  assert.ok(scene.overlays.some((overlay) => overlay.kind === 'wafer-boundary'));
  assert.ok(scene.overlays.some((overlay) => overlay.kind === 'reticle'));
  assert.ok(scene.overlays.some((overlay) => overlay.kind === 'ring-boundary'));
  assert.ok(scene.overlays.some((overlay) => overlay.kind === 'quadrant-boundary'));
});

test('plotly adapter converts a scene into path shapes and traces', () => {
  const wafer = createWafer({ diameter: 60 });
  const dies = enrichDies(
    clipDiesToWafer(
      generateDies(wafer, { width: 10, height: 10, gridSize: 1 }),
      wafer,
      { width: 10, height: 10 }
    )
  );
  const scene = buildScene(wafer, dies, {
    plotMode: 'value',
    showText: true,
  });

  const plot = toPlotly(scene);

  assert.ok(Array.isArray(plot.data));
  assert.ok(Array.isArray(plot.layout.shapes));
  assert.ok(plot.layout.shapes.every((shape) => shape.type === 'path'));
  assert.equal(plot.data[0].type, 'scatter');
  assert.ok(plot.data.some((trace) => trace.mode === 'text'));
});
