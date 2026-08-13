import { describe, it, expect } from 'vitest';
import type { Dataset, BindingSchema, RenderOptions } from '../types.js';
import { renderBar } from '../charts/bar.js';
import { renderLine } from '../charts/line.js';
import { renderArea } from '../charts/area.js';
import { renderPie } from '../charts/pie.js';
import { renderScatter } from '../charts/scatter.js';
import { renderFunnel } from '../charts/funnel.js';
import { renderSankey } from '../charts/sankey.js';
import { renderTreemap } from '../charts/treemap.js';
import { renderHeatmap } from '../charts/heatmap.js';
import { renderWaterfall } from '../charts/waterfall.js';
import { renderGauge } from '../charts/gauge.js';
import { renderRadar } from '../charts/radar.js';
import { renderCandlestick } from '../charts/candlestick.js';
import { renderBullet } from '../charts/bullet.js';
import { renderEmptyState } from '../charts/empty.js';
import { renderChart } from '../render/chart-renderer.js';

const opts: RenderOptions = { width: 640, height: 320 };

function barDataset(): Dataset {
  return {
    columns: [
      { name: 'label', type: 'string' },
      { name: 'value', type: 'number' },
    ],
    rows: [
      { label: 'A', value: 10 },
      { label: 'B', value: 20 },
      { label: 'C', value: 30 },
    ],
  };
}

function pieDataset(): Dataset {
  return {
    columns: [
      { name: 'cat', type: 'string' },
      { name: 'val', type: 'number' },
    ],
    rows: [
      { cat: 'X', val: 40 },
      { cat: 'Y', val: 30 },
      { cat: 'Z', val: 30 },
    ],
  };
}

function scatterDataset(): Dataset {
  return {
    columns: [
      { name: 'x', type: 'number' },
      { name: 'y', type: 'number' },
    ],
    rows: [
      { x: 1, y: 5 },
      { x: 2, y: 8 },
      { x: 3, y: 3 },
    ],
  };
}

function bigDataset(n: number): Dataset {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) rows.push({ label: `item_${i}`, value: i });
  return {
    columns: [
      { name: 'label', type: 'string' },
      { name: 'value', type: 'number' },
    ],
    rows,
  };
}

const barBinding: BindingSchema = {
  type: 'bar',
  columns: [
    { role: 'x', column: 'label' },
    { role: 'y', column: 'value' },
  ],
};
const pieBinding: BindingSchema = {
  type: 'pie',
  columns: [
    { role: 'label', column: 'cat' },
    { role: 'value', column: 'val' },
  ],
};
const scatterBinding: BindingSchema = {
  type: 'scatter',
  columns: [
    { role: 'x', column: 'x' },
    { role: 'y', column: 'y' },
  ],
};

describe('empty state', () => {
  it('renders empty_state for empty dataset', () => {
    const result = renderChart('bar', { columns: [], rows: [] }, barBinding, opts);
    expect(result.elements.length).toBeGreaterThan(0);
    expect(result.elements[0]!.semanticId).toBe('empty_state');
  });

  it('renderEmptyState returns group', () => {
    const els = renderEmptyState(opts);
    expect(els.length).toBeGreaterThan(0);
  });
});

describe('bar chart', () => {
  it('renders elements for fixture dataset', () => {
    const els = renderBar(barDataset(), opts, barBinding);
    expect(els.length).toBeGreaterThan(0);
    expect(els.some((e) => e.semanticId.startsWith('bar_'))).toBe(true);
  });

  it('has semanticId on interactive elements', () => {
    const els = renderBar(barDataset(), opts, barBinding);
    for (const el of els) {
      expect(el.semanticId).toBeTruthy();
    }
  });

  it('no NaN in geometry', () => {
    const els = renderBar(barDataset(), opts, barBinding);
    for (const el of els) {
      expect(Number.isFinite(el.x)).toBe(true);
      expect(Number.isFinite(el.y)).toBe(true);
      if (el.width) expect(Number.isFinite(el.width)).toBe(true);
      if (el.height) expect(Number.isFinite(el.height)).toBe(true);
    }
  });
});

describe('line chart', () => {
  it('renders for fixture', () => {
    const els = renderLine(barDataset(), opts, barBinding);
    expect(els.length).toBeGreaterThan(0);
  });
});

describe('area chart', () => {
  it('renders for fixture', () => {
    const els = renderArea(barDataset(), opts, barBinding);
    expect(els.length).toBeGreaterThan(0);
  });
});

describe('pie chart', () => {
  it('renders slices', () => {
    const els = renderPie(pieDataset(), opts, pieBinding);
    expect(els.some((e) => e.semanticId.startsWith('slice_'))).toBe(true);
  });
});

describe('scatter chart', () => {
  it('renders points', () => {
    const els = renderScatter(scatterDataset(), opts, scatterBinding);
    expect(els.some((e) => e.semanticId.startsWith('point_'))).toBe(true);
  });
});

describe('funnel chart', () => {
  it('renders', () => {
    const ds: Dataset = {
      columns: [
        { name: 'label', type: 'string' },
        { name: 'value', type: 'number' },
      ],
      rows: [
        { label: 'Step 1', value: 100 },
        { label: 'Step 2', value: 60 },
      ],
    };
    const b: BindingSchema = {
      type: 'funnel',
      columns: [
        { role: 'label', column: 'label' },
        { role: 'value', column: 'value' },
      ],
    };
    const els = renderFunnel(ds, opts, b);
    expect(els.length).toBeGreaterThan(0);
  });
});

describe('sankey chart', () => {
  it('renders', () => {
    const ds: Dataset = {
      columns: [
        { name: 'src', type: 'string' },
        { name: 'tgt', type: 'string' },
        { name: 'flow', type: 'number' },
      ],
      rows: [{ src: 'A', tgt: 'B', flow: 10 }],
    };
    const b: BindingSchema = {
      type: 'sankey',
      columns: [
        { role: 'x', column: 'src' },
        { role: 'y', column: 'tgt' },
        { role: 'value', column: 'flow' },
      ],
    };
    const els = renderSankey(ds, opts, b);
    expect(els.length).toBeGreaterThan(0);
  });
});

describe('treemap chart', () => {
  it('renders', () => {
    const ds: Dataset = {
      columns: [
        { name: 'name', type: 'string' },
        { name: 'size', type: 'number' },
      ],
      rows: [
        { name: 'A', size: 50 },
        { name: 'B', size: 30 },
      ],
    };
    const b: BindingSchema = {
      type: 'treemap',
      columns: [
        { role: 'label', column: 'name' },
        { role: 'value', column: 'size' },
      ],
    };
    const els = renderTreemap(ds, opts, b);
    expect(els.length).toBeGreaterThan(0);
  });
});

describe('heatmap chart', () => {
  it('renders', () => {
    const ds: Dataset = {
      columns: [
        { name: 'col', type: 'string' },
        { name: 'row', type: 'string' },
        { name: 'v', type: 'number' },
      ],
      rows: [
        { col: 'C1', row: 'R1', v: 10 },
        { col: 'C2', row: 'R1', v: 20 },
      ],
    };
    const b: BindingSchema = {
      type: 'heatmap',
      columns: [
        { role: 'x', column: 'col' },
        { role: 'y', column: 'row' },
        { role: 'value', column: 'v' },
      ],
    };
    const els = renderHeatmap(ds, opts, b);
    expect(els.length).toBeGreaterThan(0);
  });
});

describe('waterfall chart', () => {
  it('renders', () => {
    const ds: Dataset = {
      columns: [
        { name: 'label', type: 'string' },
        { name: 'delta', type: 'number' },
      ],
      rows: [
        { label: 'Start', delta: 100 },
        { label: 'Cost', delta: -30 },
      ],
    };
    const b: BindingSchema = {
      type: 'waterfall',
      columns: [
        { role: 'x', column: 'label' },
        { role: 'y', column: 'delta' },
      ],
    };
    const els = renderWaterfall(ds, opts, b);
    expect(els.length).toBeGreaterThan(0);
  });
});

describe('gauge chart', () => {
  it('renders', () => {
    const ds: Dataset = {
      columns: [{ name: 'v', type: 'number' }],
      rows: [{ v: 75 }],
    };
    const b: BindingSchema = { type: 'gauge', columns: [{ role: 'value', column: 'v' }] };
    const els = renderGauge(ds, opts, b);
    expect(els.length).toBeGreaterThan(0);
  });
});

describe('radar chart', () => {
  it('renders', () => {
    const ds: Dataset = {
      columns: [
        { name: 'dim', type: 'string' },
        { name: 'score', type: 'number' },
      ],
      rows: [
        { dim: 'Speed', score: 80 },
        { dim: 'Power', score: 60 },
        { dim: 'Defense', score: 90 },
      ],
    };
    const b: BindingSchema = {
      type: 'radar',
      columns: [
        { role: 'label', column: 'dim' },
        { role: 'value', column: 'score' },
      ],
    };
    const els = renderRadar(ds, opts, b);
    expect(els.length).toBeGreaterThan(0);
  });
});

describe('candlestick chart', () => {
  it('renders', () => {
    const ds: Dataset = {
      columns: [
        { name: 'date', type: 'string' },
        { name: 'close', type: 'number' },
      ],
      rows: [
        { date: '2024-01', close: 100 },
        { date: '2024-02', close: 110 },
      ],
    };
    const b: BindingSchema = {
      type: 'candlestick',
      columns: [
        { role: 'x', column: 'date' },
        { role: 'y', column: 'close' },
      ],
    };
    const els = renderCandlestick(ds, opts, b);
    expect(els.length).toBeGreaterThan(0);
  });
});

describe('bullet chart', () => {
  it('renders', () => {
    const ds: Dataset = {
      columns: [
        { name: 'item', type: 'string' },
        { name: 'actual', type: 'number' },
      ],
      rows: [{ item: 'Revenue', actual: 85 }],
    };
    const b: BindingSchema = {
      type: 'bullet',
      columns: [
        { role: 'label', column: 'item' },
        { role: 'value', column: 'actual' },
      ],
    };
    const els = renderBullet(ds, opts, b);
    expect(els.length).toBeGreaterThan(0);
  });
});

describe('large dataset rendering', () => {
  it('1k points renders without error', () => {
    const ds = bigDataset(1000);
    const els = renderBar(ds, opts, barBinding);
    expect(els.length).toBeGreaterThan(0);
  });

  it('10k points renders without error', () => {
    const ds = bigDataset(10000);
    const els = renderBar(ds, opts, barBinding);
    expect(els.length).toBeGreaterThan(0);
  });
});

describe('renderChart dispatch', () => {
  it('dispatches to correct renderer', () => {
    const result = renderChart('bar', barDataset(), barBinding, opts);
    expect(result.elements.length).toBeGreaterThan(0);
    expect(result.backend).toBe('svg');
  });

  it('handles all chart types', () => {
    const types = [
      'bar',
      'line',
      'area',
      'pie',
      'scatter',
      'funnel',
      'sankey',
      'treemap',
      'heatmap',
      'waterfall',
      'gauge',
      'radar',
      'candlestick',
      'bullet',
    ] as const;
    const bindings: Record<string, BindingSchema> = {
      bar: barBinding,
      line: barBinding,
      area: barBinding,
      pie: pieBinding,
      scatter: scatterBinding,
      funnel: pieBinding,
      sankey: {
        type: 'sankey',
        columns: [
          { role: 'x', column: 'label' },
          { role: 'y', column: 'value' },
          { role: 'value', column: 'value' },
        ],
      },
      treemap: pieBinding,
      heatmap: {
        type: 'heatmap',
        columns: [
          { role: 'x', column: 'label' },
          { role: 'y', column: 'value' },
          { role: 'value', column: 'value' },
        ],
      },
      waterfall: barBinding,
      gauge: { type: 'gauge', columns: [{ role: 'value', column: 'value' }] },
      radar: pieBinding,
      candlestick: barBinding,
      bullet: pieBinding,
    };
    for (const t of types) {
      const result = renderChart(t, barDataset(), bindings[t]!, opts);
      expect(result.elements.length).toBeGreaterThan(0);
    }
  });
});
