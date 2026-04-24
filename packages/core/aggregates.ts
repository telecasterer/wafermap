import type { Die } from './dies.js';

export type AggregationMethod = 'mean' | 'median' | 'stddev' | 'min' | 'max' | 'count';

/**
 * Aggregate a per-channel numeric value across a lot of wafers.
 *
 * @param diesByWafer  One `Die[]` per wafer — all wafers must share the same grid layout.
 * @param method       Aggregation function applied per (i,j) position across all wafers.
 * @param binChannel   Which index in `die.values[]` to aggregate (default 0).
 * @returns One Die per unique (i,j) position with `values[0]` set to the aggregate result.
 *
 * @example Compute mean test value across a lot:
 * ```ts
 * const lotMean = aggregateValues(diesByWafer, 'mean');
 * const scene = buildScene(wafer, lotMean, { plotMode: 'value' });
 * ```
 */
export function aggregateValues(
  diesByWafer: Die[][],
  method: AggregationMethod,
  binChannel = 0,
): Die[] {
  if (!diesByWafer.length) return [];

  const valuesMap = new Map<string, number[]>();
  const dieTemplate = new Map<string, Die>();

  for (const waferDies of diesByWafer) {
    for (const die of waferDies) {
      const key = `${die.i},${die.j}`;
      const v = die.values?.[binChannel];
      if (v !== undefined) {
        if (!valuesMap.has(key)) {
          valuesMap.set(key, []);
          dieTemplate.set(key, die);
        }
        valuesMap.get(key)!.push(v);
      } else if (!dieTemplate.has(key)) {
        dieTemplate.set(key, die);
      }
    }
  }

  const result: Die[] = [];
  for (const [key, template] of dieTemplate) {
    const vals = valuesMap.get(key);
    if (!vals?.length) {
      result.push({ ...template, values: undefined });
      continue;
    }

    let agg: number;
    if (method === 'mean') {
      agg = vals.reduce((a, b) => a + b, 0) / vals.length;
    } else if (method === 'median') {
      const sorted = [...vals].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      agg = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    } else if (method === 'stddev') {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      agg = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    } else if (method === 'min') {
      agg = Math.min(...vals);
    } else if (method === 'max') {
      agg = Math.max(...vals);
    } else {
      agg = vals.length; // 'count'
    }

    result.push({ ...template, values: [agg] });
  }

  return result;
}

/**
 * Return all unique bin values present in dies, sorted ascending.
 * binChannel selects which position in die.bins[] to inspect (default 0 = hard bin).
 */
export function getUniqueBins(dies: Die[], binChannel = 0): number[] {
  const seen = new Set<number>();
  for (const die of dies) {
    const b = die.bins?.[binChannel];
    if (b !== undefined) seen.add(b);
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * Aggregate multiple wafers by counting, per die position, how many wafers
 * had a specific bin value.
 *
 * Returns one Die per unique (i,j) position (using the first wafer's layout
 * as the spatial template) where:
 *   values[0]  = number of wafers that had targetBin at this position
 *   bins[0]    = targetBin
 *
 * Use with plotMode: 'value' and valueRange: [0, diesByWafer.length] to get
 * a colour scale that runs from "never" to "always".
 *
 * @param diesByWafer  One Die[] per wafer, all sharing the same grid layout.
 * @param targetBin    The bin value to count.
 * @param binChannel   Which position in die.bins[] to test (default 0 = hard bin).
 */
export function aggregateBinCounts(
  diesByWafer: Die[][],
  targetBin: number,
  binChannel = 0,
): Die[] {
  if (!diesByWafer.length) return [];

  const countMap = new Map<string, number>();
  for (const waferDies of diesByWafer) {
    for (const die of waferDies) {
      if (die.bins?.[binChannel] === targetBin) {
        const key = `${die.i},${die.j}`;
        countMap.set(key, (countMap.get(key) ?? 0) + 1);
      }
    }
  }

  return (diesByWafer[0] ?? []).map((die) => ({
    ...die,
    values: [countMap.get(`${die.i},${die.j}`) ?? 0],
    bins: [targetBin],
  }));
}
