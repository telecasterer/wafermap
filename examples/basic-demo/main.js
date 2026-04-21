// ============================================================
// wmap v0.3 — self-contained demo
// All core + renderer + adapter logic is inlined so this runs
// from a plain HTTP server with no build step.
// ============================================================

// ══════════════════════════════════════════════════════════════
// GEOMETRY HELPERS
// ══════════════════════════════════════════════════════════════

function rotatePoint(x, y, angleDeg, cx = 0, cy = 0) {
  const rad = angleDeg * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return { x: cx + (x - cx) * cos - (y - cy) * sin, y: cy + (x - cx) * sin + (y - cy) * cos };
}

function transformVector(dx, dy, rotationDeg, flipX = false, flipY = false) {
  const rad = rotationDeg * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  let x = dx * cos - dy * sin;
  let y = dx * sin + dy * cos;
  if (flipX) x = -x;
  if (flipY) y = -y;
  return { x, y };
}

function pathFromPoints(points, close = true) {
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  return close ? `${path} Z` : path;
}

function rectanglePath(cx, cy, width, height, rotationDeg, flipX = false, flipY = false) {
  const corners = [
    transformVector(-width / 2, -height / 2, rotationDeg, flipX, flipY),
    transformVector(width / 2, -height / 2, rotationDeg, flipX, flipY),
    transformVector(width / 2, height / 2, rotationDeg, flipX, flipY),
    transformVector(-width / 2, height / 2, rotationDeg, flipX, flipY),
  ].map(({ x, y }) => ({ x: cx + x, y: cy + y }));
  return pathFromPoints(corners);
}

function flatChordDist(radius, chordLength) {
  return Math.sqrt(radius ** 2 - (chordLength / 2) ** 2);
}

function isInsideWaferWithFlat(px, py, wafer) {
  const dx = px - wafer.center.x, dy = py - wafer.center.y;
  if (dx * dx + dy * dy > wafer.radius ** 2) return false;
  if (wafer.flat) {
    const d = flatChordDist(wafer.radius, wafer.flat.length);
    if (wafer.flat.type === 'bottom' && dy < -d) return false;
    if (wafer.flat.type === 'top'    && dy >  d) return false;
    if (wafer.flat.type === 'left'   && dx < -d) return false;
    if (wafer.flat.type === 'right'  && dx >  d) return false;
  }
  return true;
}

// ══════════════════════════════════════════════════════════════
// COLOR MAPS
// ══════════════════════════════════════════════════════════════

const HARD_BIN_COLORS = ['#95a5a6','#2ecc71','#e74c3c','#f39c12','#9b59b6','#3498db','#1abc9c','#e67e22','#2c3e50'];

function hardBinColor(bin) {
  return HARD_BIN_COLORS[Math.max(0, Math.min(bin, HARD_BIN_COLORS.length - 1))];
}

// Standard Viridis keypoints
const VIRIDIS = [[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]];

function valueToViridis(t) {
  const c = Math.max(0, Math.min(1, t));
  const pos = c * (VIRIDIS.length - 1);
  const lo = Math.floor(pos), hi = Math.min(lo + 1, VIRIDIS.length - 1), f = pos - lo;
  const r = Math.round(VIRIDIS[lo][0] + f * (VIRIDIS[hi][0] - VIRIDIS[lo][0]));
  const g = Math.round(VIRIDIS[lo][1] + f * (VIRIDIS[hi][1] - VIRIDIS[lo][1]));
  const b = Math.round(VIRIDIS[lo][2] + f * (VIRIDIS[hi][2] - VIRIDIS[lo][2]));
  return `rgb(${r},${g},${b})`;
}

function softBinColor(bin, maxBin = 6) { return valueToViridis(bin / maxBin); }

function contrastTextColor(cssColor) {
  let r = 0, g = 0, b = 0;
  const m = cssColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) { r = +m[1]; g = +m[2]; b = +m[3]; }
  else { const h = cssColor.replace('#', ''); r = parseInt(h.slice(0,2),16); g = parseInt(h.slice(2,4),16); b = parseInt(h.slice(4,6),16); }
  const lin = (c) => { const s = c/255; return s <= 0.03928 ? s/12.92 : ((s+0.055)/1.055)**2.4; };
  return (0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b)) > 0.179 ? '#000' : '#fff';
}

// ══════════════════════════════════════════════════════════════
// CORE — WAFER MODEL
// ══════════════════════════════════════════════════════════════

function createWafer({ diameter, center = { x: 0, y: 0 }, flat, orientation = 0, metadata }) {
  return { diameter, radius: diameter / 2, center, flat, orientation, metadata };
}

// ══════════════════════════════════════════════════════════════
// CORE — DIE GENERATION & PIPELINE
// ══════════════════════════════════════════════════════════════

function generateDies(wafer, { width, height, gridSize, offset = { x: 0, y: 0 } }) {
  const size = gridSize ?? Math.ceil(wafer.radius / Math.min(width, height)) + 1;
  const dies = [];
  for (let j = -size; j <= size; j++)
    for (let i = -size; i <= size; i++)
      dies.push({ id: `${i}_${j}`, i, j, x: wafer.center.x + i*width + offset.x, y: wafer.center.y + j*height + offset.y, width, height });
  return dies;
}

function clipDiesToWafer(dies, wafer, dieConfig) {
  const result = [];
  for (const die of dies) {
    const cIn = isInsideWaferWithFlat(die.x, die.y, wafer);
    if (!dieConfig) { if (cIn) result.push({ ...die, insideWafer: true, partial: false }); continue; }
    const hw = dieConfig.width/2, hh = dieConfig.height/2;
    const corners = [[die.x-hw,die.y-hh],[die.x+hw,die.y-hh],[die.x+hw,die.y+hh],[die.x-hw,die.y+hh]];
    const cornersIn = corners.filter(([cx,cy]) => isInsideWaferWithFlat(cx, cy, wafer)).length;
    if (!cIn && cornersIn === 0) continue;
    result.push({ ...die, insideWafer: true, partial: cornersIn < 4 });
  }
  return result;
}

function applyOrientation(dies, wafer) {
  if (!wafer.orientation) return dies;
  return dies.map(d => { const p = rotatePoint(d.x, d.y, wafer.orientation, wafer.center.x, wafer.center.y); return { ...d, x: p.x, y: p.y }; });
}

/** Interactive transform: rotation + flip, applied on top of applyOrientation. */
function transformDies(dies, { rotation = 0, flipX = false, flipY = false }, center = { x: 0, y: 0 }) {
  let r = dies;
  if (rotation) r = r.map(d => { const p = rotatePoint(d.x, d.y, rotation, center.x, center.y); return { ...d, x: p.x, y: p.y }; });
  if (flipX) r = r.map(d => ({ ...d, x: 2*center.x - d.x }));
  if (flipY) r = r.map(d => ({ ...d, y: 2*center.y - d.y }));
  return r;
}

function applyProbeSequence(dies, { type, customOrder }) {
  if (type === 'custom') {
    const idx = new Map((customOrder ?? []).map((id, i) => [id, i]));
    return dies.map(d => ({ ...d, probeIndex: idx.get(d.id) }));
  }
  if (type === 'column') return [...dies].sort((a,b) => a.i-b.i || b.j-a.j).map((d,i) => ({ ...d, probeIndex: i }));
  const rowMap = new Map();
  for (const d of dies) { if (!rowMap.has(d.j)) rowMap.set(d.j, []); rowMap.get(d.j).push(d); }
  const rows = [...rowMap.entries()].sort(([a],[b]) => b-a);
  const ordered = [];
  rows.forEach(([,row], idx) => {
    const sorted = row.sort((a,b) => a.i-b.i);
    ordered.push(...(type === 'snake' && idx%2===1 ? [...sorted].reverse() : sorted));
  });
  return ordered.map((d, i) => ({ ...d, probeIndex: i }));
}

/** Attach stacked values/bins to dies, derived from a radial gradient + deterministic noise. */
function enrichDies(dies, waferMeta) {
  return dies.map(d => {
    const r = Math.sqrt(d.i**2 + d.j**2);
    const noise = Math.sin(d.i * 2.7 + d.j * 1.9) * 0.04;
    const v1 = Math.max(0.01, Math.min(0.99, 1.00 - r*0.052 + noise));
    const v2 = Math.max(0.01, Math.min(0.99, 0.90 - r*0.057 + noise*0.8));
    const v3 = Math.max(0.01, Math.min(0.99, 0.85 - r*0.062 + noise*0.6));
    return {
      ...d,
      values: [v1, v2, v3],
      bins:   [v1>0.75?1:v1>0.5?2:3,  v2>0.70?1:v2>0.45?2:3,  v3>0.65?1:v3>0.40?2:3],
      metadata: {
        lotId: waferMeta.lot,
        waferId: `${waferMeta.lot}-W${String(waferMeta.waferNumber).padStart(2,'0')}`,
        deviceType: 'WMAP-DEMO',
        testProgram: waferMeta.testProgram,
        temperature: waferMeta.temperature,
        customFields: {
          site: `${d.i}:${d.j}`,
          radialBand: r.toFixed(2),
        },
      },
    };
  });
}

// ══════════════════════════════════════════════════════════════
// CORE — RETICLE
// ══════════════════════════════════════════════════════════════

function generateReticleGrid(wafer, { width, height, stepX, stepY, offset = { x: 0, y: 0 } }) {
  const range = wafer.radius + Math.max(width, height);
  const reticles = [];
  for (let ry = -range + offset.y; ry <= range; ry += stepY) {
    for (let rx = -range + offset.x; rx <= range; rx += stepX) {
      const cx = Math.max(rx-width/2, Math.min(0, rx+width/2));
      const cy = Math.max(ry-height/2, Math.min(0, ry+height/2));
      if (cx*cx + cy*cy <= wafer.radius**2)
        reticles.push({ x: wafer.center.x+rx, y: wafer.center.y+ry, width, height });
    }
  }
  return reticles;
}

// ══════════════════════════════════════════════════════════════
// RENDERER — buildScene
// ══════════════════════════════════════════════════════════════

function buildHoverText(die) {
  const lines = [`Die (${die.i}, ${die.j})`];
  if (die.values?.length) lines.push(`Values: ${die.values.map(v => v.toFixed(3)).join(' / ')}`);
  if (die.bins?.length)   lines.push(`Bins: ${die.bins.map(b => `B${b}`).join(' | ')}`);
  if (die.partial)        lines.push('<i>partial die</i>');
  if (die.probeIndex !== undefined) lines.push(`Probe: #${die.probeIndex}`);
  if (die.metadata) {
    for (const [key, value] of Object.entries(die.metadata)) {
      if (value === undefined || value === null || key === 'customFields') continue;
      lines.push(`${key}: ${String(value)}`);
    }
    for (const [key, value] of Object.entries(die.metadata.customFields ?? {})) {
      if (value === undefined || value === null) continue;
      lines.push(`${key}: ${String(value)}`);
    }
  }
  return lines.join('<br>');
}

/** Wafer boundary polyline with wafer.orientation + interactive transform. */
function buildBoundary(wafer, { rotation = 0, flipX = false, flipY = false }, steps = 720) {
  const { center, radius, flat, orientation } = wafer;
  const flatD = flat ? flatChordDist(radius, flat.length) : 0;
  const halfL = flat ? flat.length / 2 : 0;
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const angle = 2*Math.PI*i/steps;
    let x = center.x + radius*Math.cos(angle);
    let y = center.y + radius*Math.sin(angle);
    if (flat) {
      const dx = x-center.x, dy = y-center.y;
      if (flat.type==='bottom'&&dy<-flatD){y=center.y-flatD;x=center.x+Math.max(-halfL,Math.min(halfL,dx));}
      else if(flat.type==='top'&&dy>flatD){y=center.y+flatD;x=center.x+Math.max(-halfL,Math.min(halfL,dx));}
      else if(flat.type==='left'&&dx<-flatD){x=center.x-flatD;y=center.y+Math.max(-halfL,Math.min(halfL,dy));}
      else if(flat.type==='right'&&dx>flatD){x=center.x+flatD;y=center.y+Math.max(-halfL,Math.min(halfL,dy));}
    }
    if (orientation || rotation) { const p = rotatePoint(x, y, orientation+rotation, center.x, center.y); x=p.x; y=p.y; }
    if (flipX) x = 2*center.x - x;
    if (flipY) y = 2*center.y - y;
    points.push({ x, y });
  }
  return { kind: 'wafer-boundary', path: pathFromPoints(points), lineColor: '#111', lineWidth: 2 };
}

function buildReticleShapes(reticles, wafer, { rotation = 0, flipX = false, flipY = false }) {
  const totalRot = wafer.orientation + rotation;
  const { center } = wafer;
  return reticles.map((r) => {
    let p = totalRot ? rotatePoint(r.x, r.y, totalRot, center.x, center.y) : { x: r.x, y: r.y };
    if (flipX) p = { x: 2*center.x-p.x, y: p.y };
    if (flipY) p = { x: p.x, y: 2*center.y-p.y };
    return {
      kind: 'reticle',
      path: rectanglePath(p.x, p.y, r.width, r.height, totalRot, flipX, flipY),
      lineColor: 'rgba(0,100,220,0.45)',
      lineWidth: 1,
      fill: 'rgba(0,0,0,0)',
    };
  });
}

function buildProbeShape(dies) {
  const probed = dies.filter(d => d.probeIndex !== undefined).sort((a,b) => a.probeIndex-b.probeIndex);
  if (!probed.length) return null;
  return {
    kind: 'probe-path',
    path: pathFromPoints(probed.map(d => ({ x: d.x, y: d.y })), false),
    lineColor: 'rgba(220,80,0,0.55)',
    lineWidth: 1,
  };
}

function boundaryPointAtAngle(wafer, angle) {
  const { center, radius, flat } = wafer;
  let x = center.x + radius * Math.cos(angle);
  let y = center.y + radius * Math.sin(angle);

  if (!flat) return { x, y };

  const flatD = flatChordDist(radius, flat.length);
  const halfL = flat.length / 2;
  const dx = x - center.x;
  const dy = y - center.y;

  if (flat.type === 'bottom' && dy < -flatD) {
    y = center.y - flatD;
    x = center.x + Math.max(-halfL, Math.min(halfL, dx));
  } else if (flat.type === 'top' && dy > flatD) {
    y = center.y + flatD;
    x = center.x + Math.max(-halfL, Math.min(halfL, dx));
  } else if (flat.type === 'left' && dx < -flatD) {
    x = center.x - flatD;
    y = center.y + Math.max(-halfL, Math.min(halfL, dy));
  } else if (flat.type === 'right' && dx > flatD) {
    x = center.x + flatD;
    y = center.y + Math.max(-halfL, Math.min(halfL, dy));
  }

  return { x, y };
}

function buildRingShapes(wafer, ringCount, { rotation = 0, flipX = false, flipY = false }, steps = 360) {
  const totalRot = wafer.orientation + rotation;
  const shapes = [];
  const count = Math.max(1, Number(ringCount) || 4);

  for (let ring = 1; ring < count; ring++) {
    const radius = wafer.radius * ring / count;
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const angle = 2 * Math.PI * i / steps;
      let x = wafer.center.x + radius * Math.cos(angle);
      let y = wafer.center.y + radius * Math.sin(angle);
      if (totalRot) ({ x, y } = rotatePoint(x, y, totalRot, wafer.center.x, wafer.center.y));
      if (flipX) x = 2 * wafer.center.x - x;
      if (flipY) y = 2 * wafer.center.y - y;
      points.push({ x, y });
    }
    shapes.push({
      kind: 'ring-boundary',
      path: pathFromPoints(points),
      lineColor: 'rgba(40,40,40,0.25)',
      lineWidth: 1,
    });
  }

  return shapes;
}

function buildQuadrantShapes(wafer, { rotation = 0, flipX = false, flipY = false }) {
  const totalRot = wafer.orientation + rotation;
  return [0, Math.PI / 2].map((angle) => {
    let start = boundaryPointAtAngle(wafer, angle);
    let end = boundaryPointAtAngle(wafer, angle + Math.PI);
    if (totalRot) {
      start = rotatePoint(start.x, start.y, totalRot, wafer.center.x, wafer.center.y);
      end = rotatePoint(end.x, end.y, totalRot, wafer.center.x, wafer.center.y);
    }
    if (flipX) {
      start.x = 2 * wafer.center.x - start.x;
      end.x = 2 * wafer.center.x - end.x;
    }
    if (flipY) {
      start.y = 2 * wafer.center.y - start.y;
      end.y = 2 * wafer.center.y - end.y;
    }
    return {
      kind: 'quadrant-boundary',
      path: pathFromPoints([start, end], false),
      lineColor: 'rgba(40,40,40,0.35)',
      lineWidth: 1,
    };
  });
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

function labelFontSize(die, text) {
  const minSide = Math.max(1, Math.min(die.width, die.height));
  const widthBudget = die.width / Math.max(text.length, 1);
  return Math.max(8, Math.min(16, Math.round(Math.min(minSide * 0.55, widthBudget * 1.8))));
}

const PARTIAL_DIE_FILL = '#d3d6db';

function buildScene(wafer, dies, reticles, {
  plotMode = 'value', showText = false, showReticle = false,
  showProbePath = false, showRingBoundaries = false,
  showQuadrantBoundaries = false, ringCount = 4, interactiveTransform = {}
}) {
  const totalRot = wafer.orientation + (interactiveTransform.rotation ?? 0);
  const flipX = interactiveTransform.flipX ?? false;
  const flipY = interactiveTransform.flipY ?? false;
  const rects = [], hover = [];

  for (const die of dies) {
    const { x, y, width: dw, height: dh } = die;

    if (die.partial) {
      rects.push({
        x, y, width: dw, height: dh, fill: PARTIAL_DIE_FILL,
        type: 'stacked', path: rectanglePath(x, y, dw, dh, totalRot, flipX, flipY), metadata: die.metadata,
      });
    } else if (plotMode === 'value') {
      const v = die.values?.[0], fill = v !== undefined ? valueToViridis(v) : '#ddd';
      rects.push({ x, y, width: dw, height: dh, fill, type: 'value', path: rectanglePath(x, y, dw, dh, totalRot, flipX, flipY), metadata: die.metadata });

    } else if (plotMode === 'hardbin') {
      const bin = die.bins?.[0] ?? 0, fill = hardBinColor(bin);
      rects.push({ x, y, width: dw, height: dh, fill, type: 'hardbin', path: rectanglePath(x, y, dw, dh, totalRot, flipX, flipY), metadata: die.metadata });

    } else if (plotMode === 'softbin') {
      const bin = die.bins?.[0] ?? 0, fill = softBinColor(bin);
      rects.push({ x, y, width: dw, height: dh, fill, type: 'softbin', path: rectanglePath(x, y, dw, dh, totalRot, flipX, flipY), metadata: die.metadata });

    } else if (plotMode === 'stacked_values') {
      const vals = die.values?.length ? die.values : [0];
      const segW = dw / vals.length;
      vals.forEach((v, k) => {
        const delta = transformVector(-dw / 2 + segW * (k + 0.5), 0, totalRot, flipX, flipY);
        rects.push({
          x: x + delta.x, y: y + delta.y, width: segW, height: dh, fill: valueToViridis(v),
          type: 'stacked', stack: [...vals], metadata: die.metadata,
          path: rectanglePath(x + delta.x, y + delta.y, segW, dh, totalRot, flipX, flipY),
        });
      });
    } else if (plotMode === 'stacked_bins') {
      const bins = die.bins?.length ? die.bins : [0];
      const segW = dw / bins.length;
      bins.forEach((bin, k) => {
        const delta = transformVector(-dw / 2 + segW * (k + 0.5), 0, totalRot, flipX, flipY);
        rects.push({
          x: x + delta.x, y: y + delta.y, width: segW, height: dh, fill: hardBinColor(bin),
          type: 'stacked', stack: [...bins], metadata: die.metadata,
          path: rectanglePath(x + delta.x, y + delta.y, segW, dh, totalRot, flipX, flipY),
        });
      });
    }

    hover.push({ x, y, text: buildHoverText(die) });
  }

  const texts = showText ? dies.flatMap((die) => {
    let text = '';
    let color = '#111';
    if (plotMode === 'value' && die.values?.length) {
      text = die.values[0].toFixed(3);
      color = contrastTextColor(valueToViridis(die.values[0]));
    } else if (plotMode === 'hardbin' && die.bins?.length) {
      text = String(die.bins[0]);
      color = contrastTextColor(hardBinColor(die.bins[0]));
    } else if (plotMode === 'softbin' && die.bins?.length) {
      text = String(die.bins[0]);
      color = contrastTextColor(softBinColor(die.bins[0]));
    } else if (plotMode === 'stacked_values' && die.values?.length) {
      text = die.values.map(v => v.toFixed(2)).join(' / ');
      color = contrastTextColor(valueToViridis(die.values[Math.floor(die.values.length / 2)]));
    } else if (plotMode === 'stacked_bins' && die.bins?.length) {
      text = die.bins.map(b => String(b)).join('|');
      color = contrastTextColor(hardBinColor(die.bins[Math.floor(die.bins.length / 2)]));
    }
    return text ? [{ x: die.x, y: die.y, text, fontSize: labelFontSize(die, text), color, align: 'center' }] : [];
  }) : [];

  const overlays = [buildBoundary(wafer, interactiveTransform)];
  if (showRingBoundaries) overlays.push(...buildRingShapes(wafer, ringCount, interactiveTransform));
  if (showQuadrantBoundaries) overlays.push(...buildQuadrantShapes(wafer, interactiveTransform));
  if (showReticle) overlays.push(...buildReticleShapes(reticles, wafer, interactiveTransform));
  if (showProbePath) {
    const probeShape = buildProbeShape(dies);
    if (probeShape) overlays.push(probeShape);
  }

  return {
    rectangles: rects, hoverPoints: hover, texts,
    overlays,
    plotMode,
    metadata: wafer.metadata ?? null,
  };
}

// ══════════════════════════════════════════════════════════════
// PLOTLY ADAPTER
// ══════════════════════════════════════════════════════════════

function toPlotly(scene) {
  const { rectangles, hoverPoints, texts, overlays, plotMode } = scene;

  const shapes = [
    ...rectangles.map(r => ({
      type: 'path',
      path: r.path,
      fillcolor: r.fill,
      line: { color: 'rgba(0,0,0,0.18)', width: 0.5 },
      layer: 'below',
    })),
    ...overlays.map(o => ({
      type: 'path',
      path: o.path,
      fillcolor: o.fill ?? 'rgba(0,0,0,0)',
      line: { color: o.lineColor, width: o.lineWidth },
      layer: 'above',
    })),
  ];

  const traces = [];

  traces.push({
    type: 'scatter', mode: 'markers',
    x: hoverPoints.map(p => p.x), y: hoverPoints.map(p => p.y),
    text: hoverPoints.map(p => p.text),
    hoverinfo: 'text', hovertemplate: '%{text}<extra></extra>',
    marker: { size: 10, color: 'rgba(0,0,0,0)', line: { width: 0 } },
    showlegend: false,
  });

  if (texts.length) {
    traces.push({
      type: 'scatter', mode: 'text',
      x: texts.map(t => t.x), y: texts.map(t => t.y),
      text: texts.map(t => t.text),
      textposition: texts.map(t => t.align),
      textfont: { size: texts.map(t => t.fontSize), color: texts.map(t => t.color) },
      hoverinfo: 'skip', showlegend: false,
    });
  }

  if (['value','softbin','stacked_values'].includes(plotMode)) {
    traces.push({
      type: 'scatter', mode: 'markers', x:[null], y:[null],
      marker: { color:[0], colorscale:'Viridis', cmin:0, cmax:1, showscale:true, colorbar:{ title:{text:'Value'}, x:1.01, thickness:12, len:0.8 } },
      hoverinfo: 'skip', showlegend: false,
    });
  }

  const layout = {
    xaxis: { scaleanchor:'y', scaleratio:1, showticklabels:false, zeroline:false, showgrid:false },
    yaxis: { showticklabels:false, zeroline:false, showgrid:false },
    plot_bgcolor: '#f5f5f5',
    margin: { t:10, l:10, r:60, b:10 },
    shapes, showlegend:false, hovermode:'closest',
  };

  return { data: traces, layout };
}

// ══════════════════════════════════════════════════════════════
// APPLICATION STATE & RENDER
// ══════════════════════════════════════════════════════════════

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

function redraw() {
  const it = { rotation: appState.rotation, flipX: appState.flipX, flipY: appState.flipY };
  const transformed = transformDies(appState.baseDies, it, appState.wafer.center);
  appState.currentDies = transformed;
  const scene = buildScene(appState.wafer, transformed, appState.reticles, {
    plotMode: appState.plotMode,
    showText: appState.showText,
    showReticle: appState.showReticle,
    showProbePath: appState.showProbePath,
    showRingBoundaries: appState.showRingBoundaries,
    showQuadrantBoundaries: appState.showQuadrantBoundaries,
    ringCount: appState.ringCount,
    interactiveTransform: it,
  });
  const { data, layout } = toPlotly(scene);
  Plotly.react('chart', data, layout, { responsive: true });
  updateUI();
}

function updateUI() {
  // Rotation badge
  document.getElementById('rot-badge').textContent = `${appState.rotation}°`;
  // Flip badges
  document.getElementById('flipx-btn').classList.toggle('active', appState.flipX);
  document.getElementById('flipy-btn').classList.toggle('active', appState.flipY);

  // Stats
  const dies = appState.currentDies;
  const fullDies = dies.filter(d => !d.partial);
  const pass  = fullDies.filter(d => d.bins?.[0] === 1).length;
  const total = fullDies.length;
  document.getElementById('stat-dies').textContent  = total;
  document.getElementById('stat-pass').textContent  = `${pass} (${total ? (100*pass/total).toFixed(1) : 0}%)`;
  document.getElementById('stat-partial').textContent = dies.filter(d => d.partial).length;

  const spatial = summarizeSpatialStats(dies, appState.wafer, appState.ringCount);
  renderStatsTable('ring-stats', spatial.ringStats);
  renderStatsTable('quadrant-stats', spatial.quadrantStats);
}

function updateMetaPanel(meta) {
  if (!meta) return;
  document.getElementById('meta-lot').textContent      = meta.lot;
  document.getElementById('meta-wafer').textContent    = meta.waferNumber;
  document.getElementById('meta-date').textContent     = meta.testDate;
  document.getElementById('meta-program').textContent  = meta.testProgram;
  document.getElementById('meta-temp').textContent     = `${meta.temperature}°C`;
}

// ══════════════════════════════════════════════════════════════
// ENTRY POINT
// ══════════════════════════════════════════════════════════════

async function main() {
  const wafer = createWafer({
    diameter: 300,
    flat: { type: 'bottom', length: 40 },
    orientation: 0,
    metadata: WAFER_META,
  });

  const allDies  = generateDies(wafer, DIE_SIZE);
  const clipped  = clipDiesToWafer(allDies, wafer, DIE_SIZE);
  const enriched = enrichDies(clipped, WAFER_META);
  const sequenced = applyProbeSequence(enriched, { type: 'snake' });
  const oriented  = applyOrientation(sequenced, wafer);

  appState.wafer    = wafer;
  appState.baseDies = oriented;
  appState.reticles = generateReticleGrid(wafer, { width: 30, height: 30, stepX: 30, stepY: 60 });

  updateMetaPanel(WAFER_META);
  wireControls();
  redraw();
}

function wireControls() {
  // Mode selector
  document.getElementById('sel-mode').addEventListener('change', e => {
    appState.plotMode = e.target.value;
    redraw();
  });

  // Toggles
  for (const [id, key] of [['chk-text','showText'],['chk-reticle','showReticle'],['chk-probe','showProbePath'],['chk-rings','showRingBoundaries'],['chk-quadrants','showQuadrantBoundaries']]) {
    document.getElementById(id).addEventListener('change', e => {
      appState[key] = e.target.checked;
      redraw();
    });
  }

  document.getElementById('sel-rings').addEventListener('change', e => {
    appState.ringCount = Number(e.target.value) || 4;
    redraw();
  });

  // Rotation
  document.getElementById('rot-left-btn').addEventListener('click', () => {
    appState.rotation = (appState.rotation - 90 + 360) % 360;
    redraw();
  });
  document.getElementById('rot-right-btn').addEventListener('click', () => {
    appState.rotation = (appState.rotation + 90) % 360;
    redraw();
  });

  // Flip
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
