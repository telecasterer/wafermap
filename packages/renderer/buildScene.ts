import type { Wafer } from '../core/wafer.js';
import type { Die } from '../core/dies.js';
import type { Reticle } from '../core/reticle.js';
import type { DieMetadata, WaferMetadata } from '../core/metadata.js';
import { rotatePoint } from '../core/transforms.js';
import {
  hardBinColor, hardBinGreyscale,
  softBinColor,
  valueToViridis, valueToGreyscale,
  contrastTextColor,
} from './colorMap.js';

export type PlotMode = 'value' | 'hardbin' | 'softbin' | 'stacked_values' | 'stacked_bins';

interface Point {
  x: number;
  y: number;
}

export interface SceneRect {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string | number;
  type: 'hardbin' | 'softbin' | 'value' | 'stacked';
  stack?: number[];
  metadata?: DieMetadata;
  path: string;
}

export interface SceneText {
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  align: 'center';
}

export interface SceneHoverPoint {
  x: number;
  y: number;
  text: string;
}

export interface SceneOverlay {
  kind: 'wafer-boundary' | 'wafer-flat' | 'reticle' | 'probe-path' | 'ring-boundary' | 'quadrant-boundary' | 'xy-indicator';
  path: string;
  lineColor: string;
  lineWidth: number;
  fill?: string;
}

export interface Scene {
  rectangles: SceneRect[];
  hoverPoints: SceneHoverPoint[];
  texts: SceneText[];
  overlays: SceneOverlay[];
  plotMode: PlotMode;
  colorScheme: 'color' | 'greyscale';
  metadata: WaferMetadata | null;
  sourceDies: Die[];
}

export interface BuildSceneOptions {
  plotMode?: PlotMode;
  showText?: boolean;
  showReticle?: boolean;
  showProbePath?: boolean;
  ringCount?: number;
  showRingBoundaries?: boolean;
  showQuadrantBoundaries?: boolean;
  showXYIndicator?: boolean;
  dieGap?: number;
  colorScheme?: 'color' | 'greyscale';
  highlightBin?: number;
  interactiveTransform?: { rotation?: number; flipX?: boolean; flipY?: boolean };
}

interface TransformState {
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}

interface ColorFns {
  forValue: (t: number) => string;
  forHardBin: (bin: number) => string;
  forSoftBin: (bin: number) => string;
}

const PARTIAL_DIE_FILL = '#d3d6db';
const DIM_FILL = '#e8e9ea';

function normalizeTransform(
  wafer: Wafer,
  interactiveTransform: BuildSceneOptions['interactiveTransform']
): TransformState {
  return {
    rotation: wafer.orientation + (interactiveTransform?.rotation ?? 0),
    flipX: interactiveTransform?.flipX ?? false,
    flipY: interactiveTransform?.flipY ?? false,
  };
}

function transformVector(dx: number, dy: number, transform: TransformState): Point {
  const rad = (transform.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  let x = dx * cos - dy * sin;
  let y = dx * sin + dy * cos;

  if (transform.flipX) x = -x;
  if (transform.flipY) y = -y;

  return { x, y };
}

function toPath(points: Point[]): string {
  return `${points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')} Z`;
}

function polylinePath(points: Point[], close = false): string {
  if (!points.length) return '';
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  return close ? `${path} Z` : path;
}

function transformPoint(point: Point, center: Point, transform: TransformState): Point {
  let next = transform.rotation ? rotatePoint(point.x, point.y, transform.rotation, center.x, center.y) : point;
  if (transform.flipX) next = { x: 2 * center.x - next.x, y: next.y };
  if (transform.flipY) next = { x: next.x, y: 2 * center.y - next.y };
  return next;
}

function boundaryPointAtAngle(wafer: Wafer, angle: number): Point {
  const { center, radius, flat } = wafer;
  let x = center.x + radius * Math.cos(angle);
  let y = center.y + radius * Math.sin(angle);

  if (!flat) return { x, y };

  const flatDistance = Math.sqrt(radius ** 2 - (flat.length / 2) ** 2);
  const halfFlatLength = flat.length / 2;
  const dx = x - center.x;
  const dy = y - center.y;

  if (flat.type === 'bottom' && dy < -flatDistance) {
    y = center.y - flatDistance;
    x = center.x + Math.max(-halfFlatLength, Math.min(halfFlatLength, dx));
  } else if (flat.type === 'top' && dy > flatDistance) {
    y = center.y + flatDistance;
    x = center.x + Math.max(-halfFlatLength, Math.min(halfFlatLength, dx));
  } else if (flat.type === 'left' && dx < -flatDistance) {
    x = center.x - flatDistance;
    y = center.y + Math.max(-halfFlatLength, Math.min(halfFlatLength, dy));
  } else if (flat.type === 'right' && dx > flatDistance) {
    x = center.x + flatDistance;
    y = center.y + Math.max(-halfFlatLength, Math.min(halfFlatLength, dy));
  }

  return { x, y };
}

function rectanglePath(center: Point, width: number, height: number, transform: TransformState): string {
  const corners = [
    transformVector(-width / 2, -height / 2, transform),
    transformVector(width / 2, -height / 2, transform),
    transformVector(width / 2, height / 2, transform),
    transformVector(-width / 2, height / 2, transform),
  ].map((corner) => ({ x: center.x + corner.x, y: center.y + corner.y }));

  return toPath(corners);
}

function formatValueLabel(values: number[]): string {
  return values.map((value) => value.toFixed(values.length > 1 ? 2 : 3)).join(' / ');
}

function formatBinLabel(bins: number[]): string {
  return bins.map((bin) => String(bin)).join('|');
}

function fontSizeForDie(die: Die, text: string): number {
  const minSide = Math.max(1, Math.min(die.width, die.height));
  const widthBudget = die.width / Math.max(text.length, 1);
  return Math.max(8, Math.min(16, Math.round(Math.min(minSide * 0.55, widthBudget * 1.8))));
}

function buildHoverText(die: Die): string {
  const lines: string[] = [`Die (${die.i}, ${die.j})`];

  if (die.values?.length) lines.push(`Values: ${die.values.map((value) => value.toFixed(3)).join(' / ')}`);
  if (die.bins?.length) lines.push(`Bins: ${die.bins.map((bin) => `B${bin}`).join(' | ')}`);
  if (die.partial) lines.push('<i>partial die</i>');
  if (die.probeIndex !== undefined) lines.push(`Probe: #${die.probeIndex}`);

  if (die.metadata) {
    for (const [key, value] of Object.entries(die.metadata)) {
      if (value === undefined || value === null || key === 'customFields') continue;
      lines.push(`${key}: ${String(value)}`);
    }

    if (die.metadata.customFields) {
      for (const [key, value] of Object.entries(die.metadata.customFields)) {
        if (value === undefined || value === null) continue;
        lines.push(`${key}: ${String(value)}`);
      }
    }
  }

  return lines.join('<br>');
}

export function generateTextOverlay(dies: Die[], options: { plotMode: PlotMode }): SceneText[] {
  return dies.flatMap((die) => {
    let text = '';
    let color = '#111111';

    if (options.plotMode === 'value') {
      if (!die.values?.length) return [];
      text = formatValueLabel([die.values[0]]);
      color = contrastTextColor(valueToViridis(die.values[0]));
    } else if (options.plotMode === 'hardbin') {
      const bin = die.bins?.[0];
      if (bin === undefined) return [];
      text = String(bin);
      color = contrastTextColor(hardBinColor(bin));
    } else if (options.plotMode === 'softbin') {
      const bin = die.bins?.[0];
      if (bin === undefined) return [];
      text = String(bin);
      color = contrastTextColor(softBinColor(bin));
    } else if (options.plotMode === 'stacked_bins') {
      if (!die.bins?.length) return [];
      text = formatBinLabel(die.bins);
      color = contrastTextColor(hardBinColor(die.bins[Math.floor(die.bins.length / 2)]));
    } else {
      if (!die.values?.length) return [];
      text = formatValueLabel(die.values);
      color = contrastTextColor(valueToViridis(die.values[Math.floor(die.values.length / 2)]));
    }

    return [{
      x: die.x,
      y: die.y,
      text,
      fontSize: fontSizeForDie(die, text),
      color,
      align: 'center',
    }];
  });
}

function buildBoundaryOverlay(wafer: Wafer, transform: TransformState, steps = 720): SceneOverlay[] {
  const { center } = wafer;
  const points: Point[] = [];

  for (let index = 0; index <= steps; index++) {
    const angle = (2 * Math.PI * index) / steps;
    points.push(transformPoint(boundaryPointAtAngle(wafer, angle), center, transform));
  }

  return [{
    kind: 'wafer-boundary',
    path: polylinePath(points, true),
    lineColor: '#111111',
    lineWidth: 2,
  }];
}

function buildRingOverlays(wafer: Wafer, transform: TransformState, ringCount: number, steps = 360): SceneOverlay[] {
  const overlays: SceneOverlay[] = [];
  const safeRingCount = Math.max(1, Math.floor(ringCount));

  for (let ring = 1; ring < safeRingCount; ring++) {
    const radius = (wafer.radius * ring) / safeRingCount;
    const points: Point[] = [];

    for (let index = 0; index <= steps; index++) {
      const angle = (2 * Math.PI * index) / steps;
      const localPoint = {
        x: wafer.center.x + radius * Math.cos(angle),
        y: wafer.center.y + radius * Math.sin(angle),
      };
      points.push(transformPoint(localPoint, wafer.center, transform));
    }

    overlays.push({
      kind: 'ring-boundary',
      path: polylinePath(points, true),
      lineColor: 'rgba(40,40,40,0.25)',
      lineWidth: 1,
    });
  }

  return overlays;
}

function buildQuadrantOverlays(wafer: Wafer, transform: TransformState): SceneOverlay[] {
  const angles = [0, Math.PI / 2];

  return angles.map((angle) => {
    const start = transformPoint(boundaryPointAtAngle(wafer, angle), wafer.center, transform);
    const end = transformPoint(boundaryPointAtAngle(wafer, angle + Math.PI), wafer.center, transform);
    return {
      kind: 'quadrant-boundary',
      path: polylinePath([start, end]),
      lineColor: 'rgba(40,40,40,0.35)',
      lineWidth: 1,
    };
  });
}

function buildReticleOverlays(reticles: Reticle[], wafer: Wafer, transform: TransformState): SceneOverlay[] {
  return reticles.map((reticle) => {
    const rotatedCenter = transform.rotation
      ? rotatePoint(reticle.x, reticle.y, transform.rotation, wafer.center.x, wafer.center.y)
      : { x: reticle.x, y: reticle.y };

    const transformedCenter = {
      x: transform.flipX ? 2 * wafer.center.x - rotatedCenter.x : rotatedCenter.x,
      y: transform.flipY ? 2 * wafer.center.y - rotatedCenter.y : rotatedCenter.y,
    };

    return {
      kind: 'reticle',
      path: rectanglePath(transformedCenter, reticle.width, reticle.height, transform),
      lineColor: 'rgba(0,100,220,0.45)',
      lineWidth: 1,
      fill: 'rgba(0,0,0,0)',
    };
  });
}

function buildProbeOverlay(dies: Die[]): SceneOverlay[] {
  const ordered = dies
    .filter((die) => die.probeIndex !== undefined)
    .sort((left, right) => (left.probeIndex ?? 0) - (right.probeIndex ?? 0));

  if (!ordered.length) return [];

  return [{
    kind: 'probe-path',
    path: polylinePath(ordered.map((die) => ({ x: die.x, y: die.y }))),
    lineColor: 'rgba(220,80,0,0.55)',
    lineWidth: 1,
  }];
}

function pushDieRectangles(
  rectangles: SceneRect[],
  die: Die,
  plotMode: PlotMode,
  transform: TransformState,
  gap: number,
  colorFns: ColorFns,
  highlightBin: number | undefined
): void {
  const rw = die.width - gap;
  const rh = die.height - gap;

  if (die.partial) {
    rectangles.push({
      x: die.x, y: die.y, width: rw, height: rh,
      fill: PARTIAL_DIE_FILL, type: 'stacked', metadata: die.metadata,
      path: rectanglePath(die, rw, rh, transform),
    });
    return;
  }

  if (highlightBin !== undefined && die.bins?.[0] !== highlightBin) {
    rectangles.push({
      x: die.x, y: die.y, width: rw, height: rh,
      fill: DIM_FILL, type: 'hardbin', metadata: die.metadata,
      path: rectanglePath(die, rw, rh, transform),
    });
    return;
  }

  if (plotMode === 'value') {
    const value = die.values?.[0];
    const fill = value !== undefined ? colorFns.forValue(value) : '#d6d9dd';
    rectangles.push({
      x: die.x, y: die.y, width: rw, height: rh,
      fill, type: 'value', metadata: die.metadata,
      path: rectanglePath(die, rw, rh, transform),
    });
    return;
  }

  if (plotMode === 'hardbin') {
    const bin = die.bins?.[0] ?? 0;
    rectangles.push({
      x: die.x, y: die.y, width: rw, height: rh,
      fill: colorFns.forHardBin(bin), type: 'hardbin', metadata: die.metadata,
      path: rectanglePath(die, rw, rh, transform),
    });
    return;
  }

  if (plotMode === 'softbin') {
    const bin = die.bins?.[0] ?? 0;
    rectangles.push({
      x: die.x, y: die.y, width: rw, height: rh,
      fill: colorFns.forSoftBin(bin), type: 'softbin', metadata: die.metadata,
      path: rectanglePath(die, rw, rh, transform),
    });
    return;
  }

  if (plotMode === 'stacked_bins') {
    const bins = die.bins?.length ? die.bins : [0];
    const segmentWidth = rw / bins.length;

    bins.forEach((bin, index) => {
      const localX = -rw / 2 + segmentWidth * (index + 0.5);
      const offset = transformVector(localX, 0, transform);
      rectangles.push({
        x: die.x + offset.x, y: die.y + offset.y,
        width: segmentWidth, height: rh,
        fill: colorFns.forHardBin(bin), type: 'stacked', stack: [...bins], metadata: die.metadata,
        path: rectanglePath({ x: die.x + offset.x, y: die.y + offset.y }, segmentWidth, rh, transform),
      });
    });
    return;
  }

  const values = die.values?.length ? die.values : [0];
  const segmentWidth = rw / values.length;

  values.forEach((value, index) => {
    const localX = -rw / 2 + segmentWidth * (index + 0.5);
    const offset = transformVector(localX, 0, transform);
    rectangles.push({
      x: die.x + offset.x, y: die.y + offset.y,
      width: segmentWidth, height: rh,
      fill: colorFns.forValue(value), type: 'stacked', stack: [...values], metadata: die.metadata,
      path: rectanglePath({ x: die.x + offset.x, y: die.y + offset.y }, segmentWidth, rh, transform),
    });
  });
}

function buildXYIndicatorOverlay(
  wafer: Wafer,
  transform: TransformState,
  texts: SceneText[]
): SceneOverlay[] {
  // Anchor is fixed at the bottom-left corner in data space (outside the wafer circle).
  // 0.9 per axis → distance ≈ 1.27 × radius: outside the circle but inside the chart area.
  // Do NOT transform the anchor — it stays in the corner regardless of wafer rotation/flip.
  // Only the arrow directions rotate, so they still correctly indicate the data axes.
  const len = wafer.radius * 0.15;
  const anchor = {
    x: wafer.center.x - wafer.radius * 0.9,
    y: wafer.center.y - wafer.radius * 0.9,
  };
  const xDir = transformVector(len, 0, transform);
  const yDir = transformVector(0, len, transform);
  const xTip = { x: anchor.x + xDir.x, y: anchor.y + xDir.y };
  const yTip = { x: anchor.x + yDir.x, y: anchor.y + yDir.y };

  texts.push(
    { x: xTip.x + xDir.x * 0.35, y: xTip.y + xDir.y * 0.35, text: '+X', fontSize: 10, color: '#cc3300', align: 'center' },
    { x: yTip.x + yDir.x * 0.35, y: yTip.y + yDir.y * 0.35, text: '+Y', fontSize: 10, color: '#0044cc', align: 'center' },
  );

  return [
    { kind: 'xy-indicator', path: polylinePath([anchor, xTip]), lineColor: '#cc3300', lineWidth: 2 },
    { kind: 'xy-indicator', path: polylinePath([anchor, yTip]), lineColor: '#0044cc', lineWidth: 2 },
  ];
}

export function buildScene(
  wafer: Wafer,
  dies: Die[],
  reticles: Reticle[] = [],
  options: BuildSceneOptions = {}
): Scene {
  const {
    plotMode = 'value',
    showText = false,
    showReticle = false,
    showProbePath = false,
    ringCount = 4,
    showRingBoundaries = false,
    showQuadrantBoundaries = false,
    showXYIndicator = false,
    dieGap = 1,
    colorScheme = 'color',
    highlightBin,
    interactiveTransform,
  } = options;

  const colorFns: ColorFns = colorScheme === 'greyscale'
    ? { forValue: valueToGreyscale, forHardBin: hardBinGreyscale, forSoftBin: (b) => valueToGreyscale(b / 6) }
    : { forValue: valueToViridis, forHardBin: hardBinColor, forSoftBin: softBinColor };

  const transform = normalizeTransform(wafer, interactiveTransform);
  const rectangles: SceneRect[] = [];
  const hoverPoints: SceneHoverPoint[] = [];

  for (const die of dies) {
    pushDieRectangles(rectangles, die, plotMode, transform, dieGap, colorFns, highlightBin);
    hoverPoints.push({ x: die.x, y: die.y, text: buildHoverText(die) });
  }

  const texts: SceneText[] = showText ? generateTextOverlay(dies, { plotMode }) : [];
  const overlays = buildBoundaryOverlay(wafer, transform);

  if (showRingBoundaries) overlays.push(...buildRingOverlays(wafer, transform, ringCount));
  if (showQuadrantBoundaries) overlays.push(...buildQuadrantOverlays(wafer, transform));
  if (showReticle) overlays.push(...buildReticleOverlays(reticles, wafer, transform));
  if (showProbePath) overlays.push(...buildProbeOverlay(dies));
  if (showXYIndicator) overlays.push(...buildXYIndicatorOverlay(wafer, transform, texts));

  return {
    rectangles,
    hoverPoints,
    texts,
    overlays,
    plotMode,
    colorScheme,
    metadata: wafer.metadata ?? null,
    sourceDies: dies,
  };
}
