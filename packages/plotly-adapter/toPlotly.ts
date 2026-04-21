import type { Scene } from '../renderer/buildScene.js';

export interface PlotlyOutput {
  data: object[];
  layout: object;
}

/**
 * Convert a renderer Scene to Plotly-compatible { data, layout }.
 *
 * Architecture:
 *   layout.shapes  → die rectangles and overlay paths
 *   data[0]        → invisible scatter for hover (one point per die)
 *   data[1]        → text overlay scatter (if texts present)
 *   data[2]        → optional reference trace for a continuous colorbar
 */
export function toPlotly(scene: Scene): PlotlyOutput {
  const { rectangles, hoverPoints, texts, overlays, plotMode } = scene;

  const shapes = [
    ...rectangles.map((rectangle) => ({
      type: 'path',
      path: rectangle.path,
      fillcolor: rectangle.fill,
      line: { color: 'rgba(0,0,0,0.18)', width: 0.5 },
      layer: 'below',
    })),
    ...overlays.map((overlay) => ({
      type: 'path',
      path: overlay.path,
      fillcolor: overlay.fill ?? 'rgba(0,0,0,0)',
      line: { color: overlay.lineColor, width: overlay.lineWidth },
      layer: 'above',
    })),
  ];

  const traces: object[] = [];

  traces.push({
    type: 'scatter', mode: 'markers',
    x: hoverPoints.map((p) => p.x),
    y: hoverPoints.map((p) => p.y),
    text: hoverPoints.map((p) => p.text),
    hoverinfo: 'text',
    hovertemplate: '%{text}<extra></extra>',
    marker: { size: 10, color: 'rgba(0,0,0,0)', line: { width: 0 } },
    showlegend: false,
  });

  if (texts.length) {
    traces.push({
      type: 'scatter', mode: 'text',
      x: texts.map((t) => t.x),
      y: texts.map((t) => t.y),
      text: texts.map((t) => t.text),
      textposition: texts.map((t) => t.align),
      textfont: { size: texts.map((t) => t.fontSize), color: texts.map((t) => t.color) },
      hoverinfo: 'skip', showlegend: false,
    });
  }

  if (plotMode === 'value' || plotMode === 'softbin' || plotMode === 'stacked_values') {
    traces.push({
      type: 'scatter', mode: 'markers',
      x: [null], y: [null],
      marker: {
        color: [0], colorscale: 'Viridis', cmin: 0, cmax: 1,
        showscale: true, colorbar: { title: { text: 'Value' }, x: 1.01, thickness: 14, len: 0.8 },
      },
      hoverinfo: 'skip', showlegend: false,
    });
  }

  const layout = {
    xaxis: {
      scaleanchor: 'y', scaleratio: 1,
      showticklabels: false, zeroline: false, showgrid: false,
    },
    yaxis: { showticklabels: false, zeroline: false, showgrid: false },
    plot_bgcolor: '#f5f5f5',
    margin: { t: 10, l: 10, r: 60, b: 10 },
    shapes,
    showlegend: false,
    hovermode: 'closest',
  };

  return { data: traces, layout };
}
