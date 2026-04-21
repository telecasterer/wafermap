# Using wafermap In SvelteKit

This guide is for a developer who wants to try `wafermap` inside a TypeScript + SvelteKit application.

## Install

If the repo is on GitHub but not yet published to npm, install it from GitHub and pin a commit or tag:

```bash
npm install github:YOUR_GITHUB_USER/wafermap#653c83f
npm install plotly.js-dist-min
```

For local testing from a checkout:

```bash
npm install ../path/to/wafermap
npm install plotly.js-dist-min
```

## What The App Owns

Your SvelteKit app should own:
- fetching or loading wafer data
- UI state
- Svelte component lifecycle
- Plotly mounting and cleanup

`wafermap` should own:
- wafer geometry
- die generation
- clipping
- renderer scene creation
- Plotly-ready scene conversion

## Recommended Flow

1. Create the wafer with `createWafer(...)`
2. Generate dies with `generateDies(...)`
3. Clip with `clipDiesToWafer(...)`
4. Attach values, bins, and metadata in your app code
5. Optionally apply orientation and interactive transforms
6. Build a scene with `buildScene(...)`
7. Convert with `toPlotly(...)`
8. Render with Plotly inside a Svelte component

## Minimal Svelte Component

See [docs/examples/WaferPlot.svelte](examples/WaferPlot.svelte) for a copy-pasteable example.

## Notes For SvelteKit

- Plotly should only run in the browser, not during SSR.
- The simplest approach is to dynamically import Plotly in `onMount`.
- Re-render with `Plotly.react(...)` whenever the component inputs change.
- Destroy the plot in `onDestroy` if needed.

## Suggested First Integration

For a first test in a SvelteKit analysis app:
- keep data loading outside the component
- pass rows into a wafer plot component as props
- start with `plotMode: 'hardbin'` or `plotMode: 'value'`
- add stacked modes only after the basic rendering path works

## Reference Files

- [docs/API.md](API.md)
- [examples/vite-demo/src/main.js](../examples/vite-demo/src/main.js)
- [examples/plotly-integration-demo/main.js](../examples/plotly-integration-demo/main.js)
