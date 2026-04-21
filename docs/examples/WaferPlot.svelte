<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import {
    createWafer,
    generateDies,
    clipDiesToWafer,
    applyOrientation,
    buildScene,
    toPlotly,
    type Die
  } from 'wafermap';

  export let rows: Array<{ i: number; j: number; value?: number; bin?: number }> = [];
  export let plotMode: 'value' | 'hardbin' | 'softbin' | 'stacked_values' | 'stacked_bins' = 'value';
  export let showText = false;

  let chartEl: HTMLDivElement;
  let Plotly: typeof import('plotly.js-dist-min') | null = null;

  function enrichDies(dies: Die[]) {
    const rowMap = new Map(rows.map((row) => [`${row.i},${row.j}`, row]));

    return dies.map((die) => {
      const row = rowMap.get(`${die.i},${die.j}`);
      const value = row?.value ?? Math.max(0.05, 0.95 - (Math.abs(die.i) + Math.abs(die.j)) * 0.05);
      const bin = row?.bin ?? (value >= 0.75 ? 1 : value >= 0.5 ? 2 : 3);

      return {
        ...die,
        values: [value],
        bins: [bin]
      };
    });
  }

  async function render() {
    if (!browser || !chartEl || !Plotly) return;

    const wafer = createWafer({
      diameter: 300,
      flat: { type: 'bottom', length: 40 },
      orientation: 0,
      metadata: {
        lot: 'LOT-SVELTE',
        waferNumber: 1,
        testDate: '2026-04-21',
        testProgram: 'SK-DEMO',
        temperature: 25
      }
    });

    const dies = enrichDies(
      clipDiesToWafer(
        generateDies(wafer, { width: 10, height: 10 }),
        wafer,
        { width: 10, height: 10 }
      )
    );

    const oriented = applyOrientation(dies, wafer);
    const scene = buildScene(wafer, oriented, [], {
      plotMode,
      showText
    });
    const plot = toPlotly(scene);

    await Plotly.react(chartEl, plot.data, plot.layout, { responsive: true });
  }

  onMount(async () => {
    Plotly = await import('plotly.js-dist-min');
    await render();
  });

  $: if (browser && Plotly) {
    render();
  }
</script>

<div bind:this={chartEl} style="width: 100%; min-height: 560px;"></div>
