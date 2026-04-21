# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**wmap** is a modular wafer map visualization library for semiconductor data. It renders die performance across circular wafer substrates, handling real wafer geometry, coordinate systems, and data mapping.

## Intended Structure

```
/packages/core/          # Pure functions, no Plotly, no DOM
  wafer.ts               # createWafer()
  dies.ts                # generateDies()
  transforms.ts          # clipDiesToWafer(), mapDataToDies()

/packages/plotly-adapter/
  toPlotly.ts            # toPlotly() — thin Plotly.js integration layer

/examples/basic-demo/
  index.html             # Plotly loaded from CDN
  main.js                # Wires everything together

/data/
  dummy-test.csv         # Continuous test values (i,j,x,y,value)
  dummy-bins.csv         # Binning data
```

## Architecture Constraints

**Core** (`/packages/core/`):
- Pure functions only — no side effects, no DOM, no Plotly dependency
- TypeScript preferred, or clean ES modules

**Plotly adapter** (`/packages/plotly-adapter/`):
- Thin layer only — must not leak Plotly concepts into core
- Returns `{ data: PlotlyTrace[], layout: PlotlyLayout }`

**No external dependencies** beyond Plotly.js.

## Key Data Structures

**Wafer config:**
```typescript
{ diameter: number, center?: {x,y}, flat?: {type, length}, orientation?: number }
// Defaults: center={0,0}, orientation=0
```

**Die:**
```typescript
{ id: string, i: number, j: number, x: number, y: number, value?: number, insideWafer?: boolean }
```

## Core Functions to Implement

| Function | File | Description |
|---|---|---|
| `createWafer(config)` | `wafer.ts` | Returns wafer model |
| `generateDies(wafer, dieConfig)` | `dies.ts` | Grid of dies with i/j indices and x/y coords |
| `clipDiesToWafer(dies, wafer)` | `transforms.ts` | Keep dies where `x²+y² ≤ r²` (ignore flat in v0.1) |
| `mapDataToDies(dies, data, options)` | `transforms.ts` | Match CSV rows to dies by exact x/y, attach `.value` |
| `toPlotly(wafer, dies, options)` | `toPlotly.ts` | Produce Plotly `data`/`layout` for scattergl render |

## Plotly Rendering Requirements

- Trace type: `scattergl`, mode: `markers`
- Marker color from `die.value`, colorscale `Viridis`, size derived from die dimensions
- Layout: equal aspect ratio (`scaleanchor`), no axis ticks, title "Wafer Map"
- Wafer boundary drawn as a circle via `layout.shapes`
- Hover must show die value

## v0.1 Scope Limits

Do **not** implement: flat geometry clipping, reticle layout, probe sequence, advanced coordinate transforms.
