/**
 * Replay a buildScene SVG path string as canvas draw calls.
 *
 * buildScene only emits M, L, and Z commands (from toPath / polylinePath),
 * so this parser handles exactly that subset — no curves or relative commands.
 *
 * Call ctx.beginPath() before and ctx.fill()/ctx.stroke() after.
 */
export function svgPathToCanvas(ctx: CanvasRenderingContext2D, path: string): void {
  const tokens = path.split(/\s+/);
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === 'M') {
      ctx.moveTo(Number(tokens[i + 1]), Number(tokens[i + 2]));
      i += 3;
    } else if (token === 'L') {
      ctx.lineTo(Number(tokens[i + 1]), Number(tokens[i + 2]));
      i += 3;
    } else if (token === 'Z') {
      ctx.closePath();
      i += 1;
    } else {
      i += 1;
    }
  }
}
