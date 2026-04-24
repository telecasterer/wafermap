/**
 * Infer die dimensions from pitch.
 * Default: die fills the pitch (no kerf gap at this stage — dieGap in
 * SceneOptions handles the visual gap at render time).
 */
export function inferDieSize(pitch: { pitchX: number; pitchY: number }): { width: number; height: number } {
  return { width: pitch.pitchX, height: pitch.pitchY };
}
