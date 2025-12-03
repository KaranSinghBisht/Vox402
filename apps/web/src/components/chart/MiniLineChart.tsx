// apps/web/src/components/chart/MiniLineChart.tsx
"use client";
export type SeriesPoint = { t: number; price: number };

export function MiniLineChart({ series, width = 560, height = 160 }: { series: SeriesPoint[]; width?: number; height?: number }) {
  if (!series?.length) {
    return (
      <div className="w-full mt-2">
        <div className="w-full h-[200px] bg-zinc-900/40 rounded-xl border border-white/5 p-3 flex items-center justify-center text-xs font-mono text-gray-500">
          No data returned.
        </div>
      </div>
    );
  }

  const pts = series.length > 140 ? series.filter((_, i) => i % Math.ceil(series.length / 140) === 0) : series;
  const min = Math.min(...pts.map((p) => p.price));
  const max = Math.max(...pts.map((p) => p.price));
  const pad = 12;

  const x = (i: number) => pad + (i / Math.max(1, pts.length - 1)) * (width - 2 * pad);
  const y = (v: number) => {
    const denom = max - min || 1;
    return pad + (1 - (v - min) / denom) * (height - 2 * pad);
  };

  const d = pts.map((p, i) => `${x(i)},${y(p.price)}`).join(" ");

  return (
    <div className="w-full overflow-x-auto mt-2">
      <div className="w-full h-[200px] bg-zinc-900/40 rounded-xl border border-white/5 p-3 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-avax-red/50 to-transparent opacity-50" />
        <div className="flex justify-between items-center mb-2 px-1">
          <span className="text-xs font-mono text-gray-500">AVAX/USD</span>
          <span className="text-xs font-mono text-avax-red animate-pulse">LIVE</span>
        </div>
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="rounded-xl bg-zinc-950 border border-zinc-800">
          <polyline fill="none" stroke="currentColor" strokeWidth="2" points={d} className="text-avax-red" />
          <text x={pad} y={height - pad} fontSize="10" fill="currentColor" className="text-zinc-400">
            ${min.toFixed(2)} → ${max.toFixed(2)}
          </text>
        </svg>
      </div>
    </div>
  );
}
