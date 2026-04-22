import type { Die } from './dies.js';

/**
 * Return all unique bin values present in dies, sorted ascending.
 * binIndex selects which position in die.bins[] to inspect (default 0 = hard bin).
 */
export function getUniqueBins(dies: Die[], binIndex = 0): number[] {
  const seen = new Set<number>();
  for (const die of dies) {
    const b = die.bins?.[binIndex];
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
 * @param binIndex     Which position in die.bins[] to test (default 0).
 */
export function aggregateBinCounts(
  diesByWafer: Die[][],
  targetBin: number,
  binIndex = 0,
): Die[] {
  if (!diesByWafer.length) return [];

  const countMap = new Map<string, number>();
  for (const waferDies of diesByWafer) {
    for (const die of waferDies) {
      if (die.bins?.[binIndex] === targetBin) {
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
