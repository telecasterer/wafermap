import type { Scene, SceneOptions, PlotMode } from '../renderer/buildScene.js';
import { buildScene } from '../renderer/buildScene.js';
import { listColorSchemes } from '../renderer/colorSchemes.js';
import type { Wafer } from '../core/wafer.js';
import type { Die } from '../core/dies.js';
import { toCanvas, type ToCanvasOptions, type ViewportTransform, type BinLegendRow } from './toCanvas.js';
import type { TestDef, BinDef } from '../renderer/buildWaferMap.js';

// ── Public types ───────────────────────────────────────────────────────────────

/**
 * All scene-level options that the toolbar can control.
 * These map directly to SceneOptions — toolbar state IS the scene config.
 */
export interface WaferSceneOptions {
  plotMode?:               PlotMode;
  colorScheme?:            string;
  showText?:               boolean;
  showRingBoundaries?:     boolean;
  showQuadrantBoundaries?: boolean;
  ringCount?:              number;
  highlightBin?:           number;
  /** Interactive rotation in degrees (0 | 90 | 180 | 270). */
  rotation?:               0 | 90 | 180 | 270;
  flipX?:                  boolean;
  flipY?:                  boolean;
  /**
   * Which `values[]` index to display in `value` plot mode. Default `0`.
   * Controlled by the mode dropdown when `testDefs` are defined.
   */
  testIndex?:              number;
  /**
   * Which `bins[]` index to display in `hardbin` / `softbin` plot modes. Default `0`.
   */
  binIndex?:               number;
  /** Named test definitions — one per `values[]` entry. Shown in mode dropdown and tooltip. */
  testDefs?:               TestDef[];
  /** Named hard bin definitions — one per distinct `bins[0]` value. Independent number space from soft bins. */
  hbinDefs?:               BinDef[];
  /** Named soft bin definitions — one per distinct `bins[1]` value. Independent number space from hard bins. */
  sbinDefs?:               BinDef[];
}

export interface MountOptions extends Omit<ToCanvasOptions, '_viewport'> {
  /** Initial scene display options. All are overridable via the toolbar. */
  sceneOptions?: WaferSceneOptions;
  /** Called when the user hovers over a die. Null when leaving a die. */
  onHover?: (die: Die | null, event: MouseEvent) => void;
  /** Called when the user clicks a die. */
  onClick?: (die: Die, event: MouseEvent) => void;
  /** Called when the user completes a box-select. */
  onSelect?: (dies: Die[]) => void;
  /** Called whenever the toolbar changes a scene option. */
  onSceneOptionsChange?: (opts: WaferSceneOptions) => void;
  /** Show built-in floating tooltip on hover. Default true. */
  showTooltip?: boolean;
  /** Show the built-in toolbar. Default true. */
  showToolbar?: boolean;
  /**
   * 'full' (default) shows all toolbar controls.
   * 'view-only' shows only zoom, reset, box-select, and download — used by gallery cards.
   */
  toolbarControls?: 'full' | 'view-only';
  /** Minimum zoom relative to fit. Default 0.5. */
  minZoom?: number;
  /** Maximum zoom relative to fit. Default 20. */
  maxZoom?: number;
}

export interface WaferCanvasController {
  /** Update the die data (e.g. after a data reload) — rebuilds scene, preserves zoom/pan. */
  setDies(dies: Die[]): void;
  /** Merge scene option overrides — rebuilds scene, preserves zoom/pan. */
  setOptions(opts: Partial<WaferSceneOptions>): void;
  /** Return current scene options snapshot. */
  getOptions(): WaferSceneOptions;
  /** Programmatically set the selected dies (renders highlight overlay). */
  setSelection(dies: Die[]): void;
  /** Clear the current selection. */
  clearSelection(): void;
  /** Reset zoom and pan to fitted view. */
  resetView(): void;
  /** Remove all event listeners and DOM elements. */
  destroy(): void;
}

// ── SVG sprite — Plotly icon set + wafer-specific icons ───────────────────────
// Injected once into <body>; icons referenced via <use href="#wmap-icon-*">.
const SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
  <symbol id="wmap-icon-camera" viewBox="0 0 1000 1000"><path d="M500 300c-110 0-200 90-200 200s90 200 200 200 200-90 200-200-90-200-200-200zm0 320c-66 0-120-54-120-120s54-120 120-120 120 54 120 120-54 120-120 120zm300-320h-120l-60-80h-240l-60 80h-120c-44 0-80 36-80 80v360c0 44 36 80 80 80h600c44 0 80-36 80-80v-360c0-44-36-80-80-80z"/></symbol>
  <symbol id="wmap-icon-zoom" viewBox="0 0 1000 1000"><path d="M100 100h300v80H180v220h-80V100zm500 0h300v300h-80V180H600v-80zM100 600h80v220h220v80H100V600zm720 0h80v300H600v-80h220V600z"/></symbol>
  <symbol id="wmap-icon-pan" viewBox="0 0 1000 1000"><path d="M500 100l120 120h-80v160h160v-80l120 120-120 120v-80h-160v160h80l-120 120-120-120h80v-160h-160v80l-120-120 120-120v80h160v-160h-80z"/></symbol>
  <symbol id="wmap-icon-zoom-in" viewBox="0 0 1000 1000"><path d="M450 250v150h-150v100h150v150h100v-150h150v-100h-150v-150h-100zm50-200c-220 0-400 180-400 400s180 400 400 400 400-180 400-400-180-400-400-400zm0 720c-176 0-320-144-320-320s144-320 320-320 320 144 320 320-144 320-320 320z"/></symbol>
  <symbol id="wmap-icon-zoom-out" viewBox="0 0 1000 1000"><path d="M300 450v100h400v-100H300zm200-400c-220 0-400 180-400 400s180 400 400 400 400-180 400-400-180-400-400-400zm0 720c-176 0-320-144-320-320s144-320 320-320 320 144 320 320-144 320-320 320z"/></symbol>
  <symbol id="wmap-icon-home" viewBox="0 0 1000 1000"><path d="M500 150l350 300h-100v300h-200v-200h-100v200h-200v-300h-100z"/></symbol>
  <symbol id="wmap-icon-select-box" viewBox="0 0 1000 1000"><path d="M200 200h600v600h-600zM300 300v400h400v-400z"/></symbol>
</svg>`;

function ensureSprite(): void {
  if (!document.getElementById('wmap-sprite')) {
    const div = document.createElement('div');
    div.id = 'wmap-sprite';
    div.innerHTML = SPRITE;
    document.body.insertBefore(div, document.body.firstChild);
  }
}

function plotlyIcon(id: string): string {
  return `<svg width="16" height="16" viewBox="0 0 1000 1000" fill="currentColor"><use href="#wmap-icon-${id}"/></svg>`;
}

const ICONS: Record<string, string> = {
  download:  plotlyIcon('camera'),
  zoomMode:  plotlyIcon('zoom'),
  pan:       plotlyIcon('pan'),
  zoomIn:    plotlyIcon('zoom-in'),
  zoomOut:   plotlyIcon('zoom-out'),
  reset:     plotlyIcon('home'),
  boxSelect: plotlyIcon('select-box'),
  // Wafer-specific icons — no Plotly equivalent
  rotateCW:  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9"/><polyline points="12 3 8 3 8 7"/></svg>`,
  flipH:     `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><polyline points="7 8 3 12 7 16"/><polyline points="17 8 21 12 17 16"/></svg>`,
  flipV:     `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><polyline points="8 7 12 3 16 7"/><polyline points="8 17 12 21 16 17"/></svg>`,
  rings:     `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/></svg>`,
  quadrants: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/></svg>`,
  labels:    `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17l3-9 3 9"/><line x1="10.5" y1="13.5" x2="13.5" y2="13.5"/></svg>`,
  palette:   `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3C7 3 3 7 3 12c0 4.4 3.1 8 7.3 8.8.4.1.7-.3.7-.7v-1.5c-2.8.6-3.4-1.4-3.4-1.4-.4-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.7 9.7 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.7.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7 1 .7 2v3c0 .4.3.8.7.7C17.9 20 21 16.4 21 12c0-5-4-9-9-9z"/></svg>`,
  mode:      `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
};

// ── Toolbar colours ───────────────────────────────────────────────────────────
const CLR = {
  icon:        '#506784',
  iconHover:   '#2a3f5f',
  iconActive:  '#1a66cc',
  bgHover:     '#edf0f8',
  bgActive:    '#dce8f8',
  separator:   'rgba(0,0,0,0.12)',
  menuBg:      '#fff',
  menuBorder:  'rgba(0,0,0,0.12)',
  menuHover:   '#f0f4fc',
  menuActive:  '#dce8f8',
};

// ── Plot mode display labels ───────────────────────────────────────────────────
const MODE_LABELS: Record<PlotMode, string> = {
  value:         'Value',
  hardbin:       'Hard Bin',
  softbin:       'Soft Bin',
  stackedValues: 'Stacked Values',
  stackedBins:   'Stacked Bins',
};
const ALL_MODES: PlotMode[] = ['value', 'hardbin', 'softbin', 'stackedValues', 'stackedBins'];
const ROTATIONS: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];

// ── Main export ───────────────────────────────────────────────────────────────

export function renderWaferMap(
  canvas: HTMLCanvasElement,
  wafer: Wafer,
  dies: Die[],
  options: MountOptions = {},
): WaferCanvasController {
  const {
    onHover,
    onClick,
    onSelect,
    onSceneOptionsChange,
    showTooltip     = true,
    showToolbar     = true,
    toolbarControls = 'full',
    minZoom         = 0.5,
    maxZoom         = 20,
    sceneOptions: initialSceneOptions = {},
    ...drawOptions
  } = options;

  // ── Mutable state ──────────────────────────────────────────────────────────
  let currentDies     = dies;
  // Selected die keys ("i,j") — key-based so references survive scene rebuilds.
  let selectedKeys    = new Set<string>();
  let sceneOpts: WaferSceneOptions = {
    plotMode:               'hardbin',
    colorScheme:            'color',
    showText:               false,
    showRingBoundaries:     false,
    showQuadrantBoundaries: false,
    ringCount:              4,
    rotation:               0,
    flipX:                  false,
    flipY:                  false,
    ...initialSceneOptions,
  };

  let currentScene:   Scene;
  let fittedViewport: ViewportTransform | null = null;
  let viewport:       ViewportTransform | null = null;
  let binLegendRows:  BinLegendRow[] = [];
  let isPanning       = false;
  let isBoxSelecting  = false;
  // Interaction mode: 'pan' | 'zoom' | 'select'
  // 'pan'    — drag pans; scroll wheel is disabled (prevents accidental zoom)
  // 'zoom'   — drag draws a zoom-box; scroll wheel zooms
  // 'select' — drag draws a selection box (only available when onSelect provided)
  let interactMode: 'pan' | 'zoom' | 'select' = 'pan';
  let panStart        = { x: 0, y: 0 };
  let panOrigin       = { x: 0, y: 0 };
  let boxStart        = { x: 0, y: 0 };
  let boxEnd          = { x: 0, y: 0 };

  // ── Scene rebuild ──────────────────────────────────────────────────────────
  function rebuildScene(): void {
    const so = sceneOpts;
    currentScene = buildScene(wafer, currentDies, {
      plotMode:               so.plotMode,
      colorScheme:            so.colorScheme,
      showText:               so.showText,
      showRingBoundaries:     so.showRingBoundaries,
      showQuadrantBoundaries: so.showQuadrantBoundaries,
      ringCount:              so.ringCount,
      highlightBin:           so.highlightBin,
      testIndex:              so.testIndex,
      binIndex:               so.binIndex,
      testDefs:               so.testDefs,
      hbinDefs:               so.hbinDefs,
      sbinDefs:               so.sbinDefs,
      interactiveTransform: {
        rotation: so.rotation ?? 0,
        flipX:    so.flipX   ?? false,
        flipY:    so.flipY   ?? false,
      },
    } satisfies SceneOptions);
  }

  rebuildScene();

  // ── Tooltip ────────────────────────────────────────────────────────────────
  let tooltip: HTMLDivElement | null = null;
  if (showTooltip) {
    tooltip = document.createElement('div');
    Object.assign(tooltip.style, {
      position:     'fixed',
      pointerEvents:'none',
      background:   'rgba(20,20,30,0.88)',
      color:        '#f0f0f0',
      padding:      '6px 10px',
      borderRadius: '5px',
      fontSize:     '11px',
      lineHeight:   '1.5',
      maxWidth:     '220px',
      whiteSpace:   'pre-wrap',
      zIndex:       '9999',
      display:      'none',
      fontFamily:   'system-ui, sans-serif',
      boxShadow:    '0 2px 8px rgba(0,0,0,0.35)',
    });
    document.body.appendChild(tooltip);
  }

  // ── Toolbar ────────────────────────────────────────────────────────────────
  let toolbar:      HTMLDivElement    | null = null;
  let btnBoxSelect: HTMLButtonElement | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  // Track open dropdown so we can close it when another opens.
  let openMenu: HTMLDivElement | null = null;

  const closeOpenMenu = (e: MouseEvent): void => {
    if (openMenu && !openMenu.contains(e.target as Node)) {
      openMenu.remove();
      openMenu = null;
    }
  };

  if (showToolbar) {
    const parent = canvas.parentElement;
    if (parent) {
      if (getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
      }

      ensureSprite();
      toolbar = document.createElement('div');
      toolbar.dataset.wmapToolbar = '1';
      Object.assign(toolbar.style, {
        position:      'absolute',
        top:           '4px',
        right:         '4px',
        display:       'flex',
        flexDirection: 'row',
        alignItems:    'center',
        background:    '#fff',
        border:        `1px solid ${CLR.menuBorder}`,
        borderRadius:  '4px',
        boxShadow:     '0 1px 4px rgba(0,0,0,0.12)',
        zIndex:        '1001',
        opacity:       '0',
        transition:    'opacity 0.2s ease',
        pointerEvents: 'none',
      });

      // ── Button factory ───────────────────────────────────────────────────
      function makeBtn(
        iconKey: string,
        title: string,
        onClick: () => void,
      ): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.title     = title;
        btn.innerHTML = ICONS[iconKey];
        btn.type      = 'button';
        Object.assign(btn.style, {
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          width:          '28px',
          height:         '28px',
          padding:        '0',
          border:         'none',
          borderRadius:   '3px',
          background:     'transparent',
          color:          CLR.icon,
          cursor:         'pointer',
          pointerEvents:  'auto',
          transition:     'background 0.12s, color 0.12s',
          flexShrink:     '0',
        });
        btn.addEventListener('mouseenter', () => {
          if (!btn.dataset.active) {
            btn.style.background = CLR.bgHover;
            btn.style.color      = CLR.iconHover;
          }
        });
        btn.addEventListener('mouseleave', () => {
          if (!btn.dataset.active) {
            btn.style.background = 'transparent';
            btn.style.color      = CLR.icon;
          }
        });
        btn.addEventListener('click', onClick);
        return btn;
      }

      function setActive(btn: HTMLButtonElement, active: boolean): void {
        if (active) {
          btn.dataset.active   = '1';
          btn.style.background = CLR.bgActive;
          btn.style.color      = CLR.iconActive;
        } else {
          delete btn.dataset.active;
          btn.style.background = 'transparent';
          btn.style.color      = CLR.icon;
        }
      }

      // ── Separator ────────────────────────────────────────────────────────
      function makeSep(): HTMLDivElement {
        const sep = document.createElement('div');
        Object.assign(sep.style, {
          width:      '1px',
          height:     '18px',
          background: CLR.separator,
          margin:     '0 2px',
          flexShrink: '0',
        });
        return sep;
      }

      // Single persistent listener — closes any open dropdown on outside click.
      document.addEventListener('click', closeOpenMenu, true);

      // ── Dropdown menu factory ────────────────────────────────────────────
      // Menus are appended to document.body with position:fixed so they never
      // affect document layout or cause the page to shift.
      function makeDropdown<T extends string>(
        iconKey:  string,
        title:    string,
        items:    Array<{ value: T; label: string }>,
        getCurrent: () => T,
        onPick:   (v: T) => void,
      ): HTMLButtonElement {
        const btn = makeBtn(iconKey, title, () => {
          if (openMenu) { openMenu.remove(); openMenu = null; return; }

          const menu = document.createElement('div');
          const btnRect = btn.getBoundingClientRect();
          Object.assign(menu.style, {
            position:      'fixed',
            top:           `${btnRect.bottom + 4}px`,
            left:          `${btnRect.left}px`,
            background:    CLR.menuBg,
            border:        `1px solid ${CLR.menuBorder}`,
            borderRadius:  '4px',
            boxShadow:     '0 4px 12px rgba(0,0,0,0.15)',
            zIndex:        '9998',
            minWidth:      '148px',
            padding:       '4px 0',
            pointerEvents: 'auto',
          });

          for (const item of items) {
            const row = document.createElement('div');
            row.textContent = item.label;
            const isActive = item.value === getCurrent();
            Object.assign(row.style, {
              padding:    '6px 14px',
              fontSize:   '12px',
              cursor:     'pointer',
              color:      isActive ? CLR.iconActive : '#333',
              fontWeight: isActive ? '700' : '400',
              background: isActive ? CLR.menuActive : 'transparent',
              whiteSpace: 'nowrap',
            });
            row.addEventListener('mouseenter', () => {
              if (item.value !== getCurrent()) row.style.background = CLR.menuHover;
            });
            row.addEventListener('mouseleave', () => {
              row.style.background = item.value === getCurrent() ? CLR.menuActive : 'transparent';
            });
            row.addEventListener('click', e => {
              e.stopPropagation();
              onPick(item.value);
              menu.remove();
              openMenu = null;
            });
            menu.appendChild(row);
          }

          document.body.appendChild(menu);
          openMenu = menu;
        });

        return btn;
      }

      // ── Wire up toolbar buttons ──────────────────────────────────────────

      // Interaction mode: zoom-region | pan | select — mutually exclusive
      function setInteractMode(mode: 'pan' | 'zoom' | 'select'): void {
        interactMode = mode;
        setActive(btnZoomMode, mode === 'zoom');
        setActive(btnPanMode,  mode === 'pan');
        if (btnBoxSelect) setActive(btnBoxSelect, mode === 'select');
        canvas.style.cursor = mode === 'pan' ? 'grab' : 'crosshair';
      }

      // ── Order matches Plotly modebar: camera | sep | zoom | pan | [select] | zoom+ | zoom− | reset | sep | scene controls ──

      // Camera first — leftmost, matching Plotly
      const btnDownload = makeBtn('download', 'Download PNG', downloadPng);
      toolbar.appendChild(btnDownload);
      toolbar.appendChild(makeSep());

      // Navigation mode group
      const btnZoomMode = makeBtn('zoomMode', 'Zoom (drag to zoom region)', () => setInteractMode('zoom'));
      const btnPanMode  = makeBtn('pan',      'Pan (drag to move)',          () => setInteractMode('pan'));
      toolbar.appendChild(btnZoomMode);
      toolbar.appendChild(btnPanMode);

      if (onSelect) {
        btnBoxSelect = makeBtn('boxSelect', 'Select (drag to select dies)', () => setInteractMode('select'));
        toolbar.appendChild(btnBoxSelect);
      }

      // Zoom +/− and reset
      const btnZoomIn  = makeBtn('zoomIn',  'Zoom in',                    () => zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 1.5));
      const btnZoomOut = makeBtn('zoomOut', 'Zoom out',                   () => zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 1 / 1.5));
      const btnReset   = makeBtn('reset',   'Reset view (double-click)',   () => resetView());
      toolbar.appendChild(btnZoomIn);
      toolbar.appendChild(btnZoomOut);
      toolbar.appendChild(btnReset);

      // Set initial active state — pan is default
      setActive(btnPanMode, true);

      // Scene controls — hidden in 'view-only' mode (gallery bar owns them)
      if (toolbarControls !== 'view-only') {
        toolbar.appendChild(makeSep());

        // Mode dropdown: when testDefs are defined, show one entry per named test
        // plus the bin modes. Selecting a named test sets plotMode:'value' + testIndex.
        // Selecting a bin mode sets plotMode to that mode and clears testIndex.
        type ModeEntry = { plotMode: PlotMode; testIndex?: number; label: string };

        function isCurrentEntry(e: ModeEntry): boolean {
          if (e.plotMode !== (sceneOpts.plotMode ?? 'hardbin')) return false;
          if (e.plotMode === 'value') return (sceneOpts.testIndex ?? 0) === (e.testIndex ?? 0);
          return true;
        }

        const btnMode = makeBtn('mode', 'Plot mode', () => {
          if (openMenu) { openMenu.remove(); openMenu = null; return; }

          const testDefs = currentScene.testDefs;
          const entries: ModeEntry[] = testDefs?.length
            ? testDefs.map(t => ({ plotMode: 'value' as PlotMode, testIndex: t.index, label: t.unit ? `${t.name} (${t.unit})` : t.name }))
            : [{ plotMode: 'value' as PlotMode, label: MODE_LABELS.value }];
          entries.push(
            { plotMode: 'hardbin',       label: MODE_LABELS.hardbin },
            { plotMode: 'softbin',       label: MODE_LABELS.softbin },
            { plotMode: 'stackedValues', label: MODE_LABELS.stackedValues },
            { plotMode: 'stackedBins',   label: MODE_LABELS.stackedBins },
          );

          const menu = document.createElement('div');
          const btnRect = btnMode.getBoundingClientRect();
          Object.assign(menu.style, {
            position:      'fixed',
            top:           `${btnRect.bottom + 4}px`,
            left:          `${btnRect.left}px`,
            background:    CLR.menuBg,
            border:        `1px solid ${CLR.menuBorder}`,
            borderRadius:  '4px',
            boxShadow:     '0 4px 12px rgba(0,0,0,0.15)',
            zIndex:        '9998',
            minWidth:      '160px',
            padding:       '4px 0',
            pointerEvents: 'auto',
          });

          for (const entry of entries) {
            const row = document.createElement('div');
            row.textContent = entry.label;
            const active = isCurrentEntry(entry);
            Object.assign(row.style, {
              padding:    '6px 14px',
              fontSize:   '12px',
              cursor:     'pointer',
              color:      active ? CLR.iconActive : '#333',
              fontWeight: active ? '700' : '400',
              background: active ? CLR.menuActive : 'transparent',
              whiteSpace: 'nowrap',
            });
            row.addEventListener('mouseenter', () => {
              if (!isCurrentEntry(entry)) row.style.background = CLR.menuHover;
            });
            row.addEventListener('mouseleave', () => {
              row.style.background = isCurrentEntry(entry) ? CLR.menuActive : 'transparent';
            });
            row.addEventListener('click', e => {
              e.stopPropagation();
              if (entry.testIndex !== undefined) {
                applyOpts({ plotMode: 'value', testIndex: entry.testIndex });
              } else {
                applyOpts({ plotMode: entry.plotMode, testIndex: undefined });
              }
              menu.remove();
              openMenu = null;
            });
            menu.appendChild(row);
          }

          document.body.appendChild(menu);
          openMenu = menu;
        });
        const btnPalette = makeDropdown(
          'palette', 'Colour scheme',
          listColorSchemes().map(s => ({ value: s.name, label: s.label })),
          () => sceneOpts.colorScheme ?? 'color',
          v => applyOpts({ colorScheme: v }),
        );
        const btnRings = makeBtn('rings', 'Toggle ring boundaries', () => {
          applyOpts({ showRingBoundaries: !sceneOpts.showRingBoundaries });
          setActive(btnRings, !!sceneOpts.showRingBoundaries);
        });
        const btnQuadrants = makeBtn('quadrants', 'Toggle quadrant boundaries', () => {
          applyOpts({ showQuadrantBoundaries: !sceneOpts.showQuadrantBoundaries });
          setActive(btnQuadrants, !!sceneOpts.showQuadrantBoundaries);
        });
        const btnLabels = makeBtn('labels', 'Toggle die labels', () => {
          applyOpts({ showText: !sceneOpts.showText });
          setActive(btnLabels, !!sceneOpts.showText);
        });
        const btnRotate = makeBtn('rotateCW', 'Rotate 90° clockwise', () => {
          const r = sceneOpts.rotation ?? 0;
          // Positive rotation is CCW in standard math convention, so decrement to rotate CW.
          applyOpts({ rotation: ROTATIONS[(ROTATIONS.indexOf(r) + 3) % 4] });
        });
        const btnFlipH = makeBtn('flipH', 'Flip horizontal', () => {
          applyOpts({ flipX: !sceneOpts.flipX });
          setActive(btnFlipH, !!sceneOpts.flipX);
        });
        const btnFlipV = makeBtn('flipV', 'Flip vertical', () => {
          applyOpts({ flipY: !sceneOpts.flipY });
          setActive(btnFlipV, !!sceneOpts.flipY);
        });

        toolbar.appendChild(btnMode);
        toolbar.appendChild(btnPalette);
        toolbar.appendChild(makeSep());
        toolbar.appendChild(btnRings);
        toolbar.appendChild(btnQuadrants);
        toolbar.appendChild(btnLabels);
        toolbar.appendChild(makeSep());
        toolbar.appendChild(btnRotate);
        toolbar.appendChild(btnFlipH);
        toolbar.appendChild(btnFlipV);

        setActive(btnRings,     !!sceneOpts.showRingBoundaries);
        setActive(btnQuadrants, !!sceneOpts.showQuadrantBoundaries);
        setActive(btnLabels,    !!sceneOpts.showText);
        setActive(btnFlipH,     !!sceneOpts.flipX);
        setActive(btnFlipV,     !!sceneOpts.flipY);
      }

      canvas.insertAdjacentElement('afterend', toolbar);

      // ── Hover show/hide (with linger so clicks register) ─────────────────
      function showBar(): void {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        if (toolbar) {
          toolbar.style.opacity      = '1';
          toolbar.style.pointerEvents = 'auto';
        }
      }
      function hideBar(): void {
        hideTimer = setTimeout(() => {
          if (toolbar) {
            toolbar.style.opacity      = '0';
            toolbar.style.pointerEvents = 'none';
          }
        }, 600);
      }

      canvas.addEventListener('mouseenter', showBar);
      canvas.addEventListener('mouseleave', hideBar);
      toolbar.addEventListener('mouseenter', showBar);
      toolbar.addEventListener('mouseleave', hideBar);
    }
  }

  // ── Apply scene option changes ─────────────────────────────────────────────
  function applyOpts(partial: Partial<WaferSceneOptions>): void {
    sceneOpts = { ...sceneOpts, ...partial };
    rebuildScene();
    render();
    onSceneOptionsChange?.(sceneOpts);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render(): void {
    const vp = viewport ?? undefined;
    const result = toCanvas(canvas, currentScene, {
      ...drawOptions,
      showAxes:  drawOptions.showAxes ?? (viewport !== null),
      _viewport: vp,
      _activeBin: sceneOpts.highlightBin,
    });

    binLegendRows = result.binLegendRows;

    if (!fittedViewport || !viewport) {
      fittedViewport = result.viewport;
      if (!viewport) viewport = null;
    }

    if (selectedKeys.size > 0) drawSelectionOverlay();
    if (isBoxSelecting) drawBoxOverlay();
  }

  // ── Selection highlight overlay ────────────────────────────────────────────
  function drawSelectionOverlay(): void {
    const vp = currentViewport();
    if (!vp) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio ?? 1;
    const pts = currentScene.hoverPoints;

    const firstRect = currentScene.rectangles[0];
    const dieHalfW  = firstRect ? (firstRect.width  / 2) * vp.ppm : vp.ppm * 0.5;
    const dieHalfH  = firstRect ? (firstRect.height / 2) * vp.ppm : vp.ppm * 0.5;
    // Inset slightly so the ring sits just inside the die edge.
    const inset = Math.max(1, Math.min(3, dieHalfW * 0.08));

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.setLineDash([]);

    for (let i = 0; i < pts.length; i++) {
      const die = currentScene.dies[i];
      if (!die) continue;
      const key = `${die.i},${die.j}`;
      if (!selectedKeys.has(key)) continue;

      const sx = vp.originX + pts[i].x * vp.ppm;
      const sy = vp.originY - pts[i].y * vp.ppm;
      const hw = dieHalfW - inset;
      const hh = dieHalfH - inset;

      // Semi-transparent blue fill over the die.
      ctx.fillStyle = 'rgba(30,120,255,0.25)';
      ctx.fillRect(sx - hw, sy - hh, hw * 2, hh * 2);

      // White outer stroke for contrast on dark dies.
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth   = 2.5;
      ctx.strokeRect(sx - hw, sy - hh, hw * 2, hh * 2);

      // Blue inner stroke — the selection colour.
      ctx.strokeStyle = 'rgba(30,120,255,1)';
      ctx.lineWidth   = 1.5;
      ctx.strokeRect(sx - hw, sy - hh, hw * 2, hh * 2);
    }

    ctx.restore();
  }

  // ── Box select overlay ─────────────────────────────────────────────────────
  function drawBoxOverlay(): void {
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio ?? 1;
    const x   = Math.min(boxStart.x, boxEnd.x);
    const y   = Math.min(boxStart.y, boxEnd.y);
    const w   = Math.abs(boxEnd.x - boxStart.x);
    const h   = Math.abs(boxEnd.y - boxStart.y);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = 'rgba(30,100,200,0.85)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(30,100,200,0.08)';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  // ── Download PNG ───────────────────────────────────────────────────────────
  function downloadPng(): void {
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href = url; a.download = 'wafermap.png'; a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ── Zoom helpers ───────────────────────────────────────────────────────────
  function clampedPpm(newPpm: number): number {
    if (!fittedViewport) return newPpm;
    return Math.max(fittedViewport.ppm * minZoom, Math.min(fittedViewport.ppm * maxZoom, newPpm));
  }

  function zoomAt(cssPx: number, cssPy: number, factor: number): void {
    const vp = viewport ?? fittedViewport;
    if (!vp) return;
    const newPpm     = clampedPpm(vp.ppm * factor);
    const scale      = newPpm / vp.ppm;
    const newOriginX = cssPx - (cssPx - vp.originX) * scale;
    const newOriginY = cssPy - (cssPy - vp.originY) * scale;
    const snapDist   = (fittedViewport?.snapDist ?? 1) / (newPpm / (fittedViewport?.ppm ?? newPpm));
    viewport = { originX: newOriginX, originY: newOriginY, ppm: newPpm, snapDist };
    render();
  }

  function currentViewport(): ViewportTransform | null {
    return viewport ?? fittedViewport;
  }

  // ── Pointer events ─────────────────────────────────────────────────────────
  function onWheel(e: WheelEvent): void {
    // Scroll-wheel zoom only active in zoom mode — prevents accidental zoom while panning.
    if (interactMode !== 'zoom') return;
    e.preventDefault();
    const rect   = canvas.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    if (!currentViewport()) return;
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const px   = e.clientX - rect.left;
    const py   = e.clientY - rect.top;
    if (interactMode === 'zoom' || interactMode === 'select') {
      isBoxSelecting = true;
      boxStart = boxEnd = { x: px, y: py };
      return;
    }
    isPanning = true;
    panStart  = { x: px, y: py };
    panOrigin = { x: currentViewport()!.originX, y: currentViewport()!.originY };
    canvas.style.cursor = 'grabbing';
  }

  function onPointerMove(e: PointerEvent): void {
    const rect  = canvas.getBoundingClientRect();
    const cssPx = e.clientX - rect.left;
    const cssPy = e.clientY - rect.top;

    if (isBoxSelecting) {
      boxEnd = { x: cssPx, y: cssPy };
      render();
      return;
    }

    if (isPanning) {
      const vp       = currentViewport()!;
      const snapDist = viewport?.snapDist ?? fittedViewport?.snapDist ?? 1;
      viewport = {
        originX: panOrigin.x + (cssPx - panStart.x),
        originY: panOrigin.y + (cssPy - panStart.y),
        ppm:     vp.ppm,
        snapDist,
      };
      render();
      return;
    }

    const vp = currentViewport();
    if (!vp) return;
    const mx  = (cssPx - vp.originX) / vp.ppm;
    const my  = (vp.originY - cssPy) / vp.ppm;
    const die = hitTest(mx, my, vp.snapDist);

    if (interactMode === 'pan') canvas.style.cursor = die ? 'crosshair' : 'grab';

    if (tooltip) {
      if (die) {
        const hp = currentScene.hoverPoints[currentScene.dies.indexOf(die)];
        tooltip.style.display = 'block';
        tooltip.style.left    = `${e.clientX + 14}px`;
        tooltip.style.top     = `${e.clientY - 8}px`;
        tooltip.textContent   = hp?.text ?? `Die (${die.i}, ${die.j})`;
      } else {
        tooltip.style.display = 'none';
      }
    }

    onHover?.(die, e);
  }

  function onPointerUp(e: PointerEvent): void {
    const rect  = canvas.getBoundingClientRect();
    const cssPx = e.clientX - rect.left;
    const cssPy = e.clientY - rect.top;
    const multi = e.ctrlKey || e.metaKey;

    if (isBoxSelecting) {
      isBoxSelecting = false;
      boxEnd = { x: cssPx, y: cssPy };
      const dx = cssPx - boxStart.x;
      const dy = cssPy - boxStart.y;
      const vp = currentViewport();

      if (interactMode === 'zoom') {
        // Zoom mode drag: zoom into the drawn box region.
        if (dx * dx + dy * dy < 25) {
          // Tiny drag — treat as step zoom-in at click point.
          zoomAt(cssPx, cssPy, 2);
        } else if (vp) {
          const x1css = Math.min(boxStart.x, boxEnd.x);
          const x2css = Math.max(boxStart.x, boxEnd.x);
          const y1css = Math.min(boxStart.y, boxEnd.y);
          const y2css = Math.max(boxStart.y, boxEnd.y);
          const boxW  = x2css - x1css;
          const boxH  = y2css - y1css;
          if (boxW > 4 && boxH > 4) {
            const canvasW = canvas.clientWidth;
            const canvasH = canvas.clientHeight;
            const scaleX  = canvasW / boxW;
            const scaleY  = canvasH / boxH;
            const scale   = Math.min(scaleX, scaleY);
            const newPpm  = clampedPpm(vp.ppm * scale);
            const actualScale = newPpm / vp.ppm;
            const cx    = (x1css + x2css) / 2;
            const cy    = (y1css + y2css) / 2;
            viewport = {
              originX: canvasW / 2 - (cx - vp.originX) * actualScale,
              originY: canvasH / 2 - (cy - vp.originY) * actualScale,
              ppm:     newPpm,
              snapDist: vp.snapDist / actualScale,
            };
          }
        }
        render();
        canvas.style.cursor = 'crosshair';
        return;
      }

      // Select mode drag.
      if (dx * dx + dy * dy < 25) {
        handleClick(cssPx, cssPy, multi, e);
      } else if (vp) {
        const x1mm = (Math.min(boxStart.x, boxEnd.x) - vp.originX) / vp.ppm;
        const x2mm = (Math.max(boxStart.x, boxEnd.x) - vp.originX) / vp.ppm;
        const y1mm = (vp.originY - Math.max(boxStart.y, boxEnd.y)) / vp.ppm;
        const y2mm = (vp.originY - Math.min(boxStart.y, boxEnd.y)) / vp.ppm;
        const pts = currentScene.hoverPoints;
        const boxDies: Die[] = [];
        for (let i = 0; i < pts.length; i++) {
          if (pts[i].x >= x1mm && pts[i].x <= x2mm &&
              pts[i].y >= y1mm && pts[i].y <= y2mm) {
            const d = currentScene.dies[i];
            if (d) boxDies.push(d);
          }
        }
        if (multi) {
          for (const d of boxDies) {
            const key = `${d.i},${d.j}`;
            if (selectedKeys.has(key)) selectedKeys.delete(key);
            else selectedKeys.add(key);
          }
        } else {
          selectedKeys = new Set(boxDies.map(d => `${d.i},${d.j}`));
        }
        if (onSelect) onSelect(selectionAsDies());
      }
      render();
      canvas.style.cursor = 'crosshair';
      return;
    }

    if (!isPanning) return;
    isPanning = false;
    canvas.style.cursor = interactMode === 'pan' ? 'grab' : 'crosshair';
    const dx = cssPx - panStart.x;
    const dy = cssPy - panStart.y;
    if (dx * dx + dy * dy < 25) {
      handleClick(cssPx, cssPy, multi, e);
    }
  }

  function handleClick(cssPx: number, cssPy: number, multi: boolean, e: PointerEvent): void {
    // Check bin legend hit first — legend rows take priority over die clicks.
    for (const row of binLegendRows) {
      if (cssPy >= row.y && cssPy < row.y + row.h) {
        const next = sceneOpts.highlightBin === row.bin ? undefined : row.bin;
        applyOpts({ highlightBin: next });
        return;
      }
    }

    const vp = currentViewport();
    if (!vp) return;
    const die = hitTest((cssPx - vp.originX) / vp.ppm, (vp.originY - cssPy) / vp.ppm, vp.snapDist);

    if (die) {
      onClick?.(die, e);
      if (onSelect) {
        const key = `${die.i},${die.j}`;
        if (multi) {
          // Toggle this die.
          if (selectedKeys.has(key)) selectedKeys.delete(key);
          else selectedKeys.add(key);
        } else {
          // Replace selection with just this die.
          selectedKeys = new Set([key]);
        }
        onSelect(selectionAsDies());
        render();
      }
    } else if (!multi && onSelect) {
      // Click on empty space clears selection.
      selectedKeys = new Set();
      onSelect([]);
      render();
    }
  }

  function selectionAsDies(): Die[] {
    const result: Die[] = [];
    const pts = currentScene.hoverPoints;
    for (let i = 0; i < pts.length; i++) {
      const d = currentScene.dies[i];
      if (d && selectedKeys.has(`${d.i},${d.j}`)) result.push(d);
    }
    return result;
  }

  function onPointerLeave(): void {
    if (tooltip) tooltip.style.display = 'none';
    onHover?.(null, new MouseEvent('mouseleave'));
    canvas.style.cursor = interactMode === 'pan' ? 'grab' : 'crosshair';
  }

  // ── Hit testing ────────────────────────────────────────────────────────────
  function hitTest(mx: number, my: number, snapDist: number): Die | null {
    const pts = currentScene.hoverPoints;
    let bestDie: Die | null = null;
    let bestDist = snapDist * snapDist;
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i].x - mx, dy = pts[i].y - my;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) { bestDist = d2; bestDie = currentScene.dies[i] ?? null; }
    }
    return bestDie;
  }

  // ── ResizeObserver ─────────────────────────────────────────────────────────
  const resizeObserver = new ResizeObserver(() => {
    fittedViewport = null;
    viewport = null;
    render();
  });
  resizeObserver.observe(canvas);

  // ── Wire canvas events ─────────────────────────────────────────────────────
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && selectedKeys.size > 0) {
      selectedKeys = new Set();
      onSelect?.([]);
      render();
    }
  }

  canvas.style.cursor = 'grab';
  canvas.setAttribute('tabindex', '0'); // make canvas focusable for key events
  canvas.addEventListener('wheel',        onWheel,       { passive: false });
  canvas.addEventListener('pointerdown',  onPointerDown);
  canvas.addEventListener('pointermove',  onPointerMove);
  canvas.addEventListener('pointerup',    onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('dblclick',     () => resetView());
  canvas.addEventListener('keydown',      onKeyDown);

  // ── Initial render ─────────────────────────────────────────────────────────
  render();

  // ── Controller ─────────────────────────────────────────────────────────────
  function resetView(): void {
    fittedViewport = null;
    viewport = null;
    render();
  }

  return {
    setDies(newDies: Die[]): void {
      currentDies = newDies;
      rebuildScene();
      render();
    },

    setOptions(partial: Partial<WaferSceneOptions>): void {
      applyOpts(partial);
    },

    getOptions(): WaferSceneOptions {
      return { ...sceneOpts };
    },

    resetView,

    setSelection(dies: Die[]): void {
      selectedKeys = new Set(dies.map(d => `${d.i},${d.j}`));
      render();
    },

    clearSelection(): void {
      selectedKeys = new Set();
      onSelect?.([]);
      render();
    },

    destroy(): void {
      if (hideTimer) clearTimeout(hideTimer);
      openMenu?.remove();
      document.removeEventListener('click', closeOpenMenu, true);
      canvas.removeEventListener('wheel',        onWheel);
      canvas.removeEventListener('pointerdown',  onPointerDown);
      canvas.removeEventListener('pointermove',  onPointerMove);
      canvas.removeEventListener('pointerup',    onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('dblclick',     resetView);
      canvas.removeEventListener('keydown',      onKeyDown);
      resizeObserver.disconnect();
      tooltip?.remove();
      toolbar?.remove();
      canvas.style.cursor = '';
    },
  };
}
