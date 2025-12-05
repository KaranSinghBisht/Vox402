// apps/web/src/components/chart/MiniLineChart.tsx
"use client";
export type SeriesPoint = { t: number; price: number };

export function MiniLineChart({ series, width = 560, height = 200 }: { series: SeriesPoint[]; width?: number; height?: number }) {
  if (!series?.length) {
    return (
      <div className="w-full mt-2">
        <div className="w-full h-[240px] bg-zinc-900/40 rounded-xl border border-white/5 p-3 flex items-center justify-center text-xs font-mono text-gray-500">
          No data returned.
        </div>
      </div>
    );
  }

  // Downsample if too many points
  const pts = series.length > 140 ? series.filter((_, i) => i % Math.ceil(series.length / 140) === 0) : series;
  const prices = pts.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  // Chart area with padding for axes
  const leftPad = 60;
  const rightPad = 16;
  const topPad = 20;
  const bottomPad = 40;
  const chartWidth = width - leftPad - rightPad;
  const chartHeight = height - topPad - bottomPad;

  const x = (i: number) => leftPad + (i / Math.max(1, pts.length - 1)) * chartWidth;
  const y = (v: number) => {
    const denom = max - min || 1;
    return topPad + (1 - (v - min) / denom) * chartHeight;
  };

  const d = pts.map((p, i) => `${x(i)},${y(p.price)}`).join(" ");

  // Generate Y-axis labels (5 ticks)
  const yTicks = 5;
  const yLabels = Array.from({ length: yTicks }, (_, i) => {
    const value = min + (max - min) * (1 - i / (yTicks - 1));
    return { value, y: topPad + (i / (yTicks - 1)) * chartHeight };
  });

  // Generate X-axis labels (first, middle, last dates)
  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const xLabels = [
    { label: formatDate(pts[0].t), x: leftPad },
    { label: formatDate(pts[Math.floor(pts.length / 2)].t), x: leftPad + chartWidth / 2 },
    { label: formatDate(pts[pts.length - 1].t), x: leftPad + chartWidth },
  ];

  const startPrice = pts[0].price;
  const endPrice = pts[pts.length - 1].price;
  const priceChange = ((endPrice - startPrice) / startPrice * 100).toFixed(2);
  const isPositive = endPrice >= startPrice;

  return (
    <div className="w-full overflow-x-auto mt-2">
      <div className="w-full bg-zinc-900/40 rounded-xl border border-white/5 p-3 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-avax-red/50 to-transparent opacity-50" />

        {/* Header */}
        <div className="flex justify-between items-center mb-2 px-1">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-gray-500">AVAX/USD</span>
            <span className={`text-xs font-mono font-bold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
              ${startPrice.toFixed(2)} → ${endPrice.toFixed(2)} ({isPositive ? '+' : ''}{priceChange}%)
            </span>
          </div>
          <span className="text-xs font-mono text-avax-red animate-pulse">LIVE</span>
        </div>

        {/* Chart SVG */}
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="rounded-xl bg-zinc-950 border border-zinc-800">
          {/* Grid lines */}
          {yLabels.map((tick, i) => (
            <line key={i} x1={leftPad} y1={tick.y} x2={width - rightPad} y2={tick.y} stroke="#27272a" strokeWidth="1" strokeDasharray="4,4" />
          ))}

          {/* Y-axis labels */}
          {yLabels.map((tick, i) => (
            <text key={i} x={leftPad - 8} y={tick.y + 4} fontSize="10" fill="#71717a" textAnchor="end" className="font-mono">
              ${tick.value.toFixed(2)}
            </text>
          ))}

          {/* X-axis labels */}
          {xLabels.map((label, i) => (
            <text key={i} x={label.x} y={height - 10} fontSize="10" fill="#71717a" textAnchor="middle" className="font-mono">
              {label.label}
            </text>
          ))}

          {/* Y-axis line */}
          <line x1={leftPad} y1={topPad} x2={leftPad} y2={topPad + chartHeight} stroke="#3f3f46" strokeWidth="1" />

          {/* X-axis line */}
          <line x1={leftPad} y1={topPad + chartHeight} x2={width - rightPad} y2={topPad + chartHeight} stroke="#3f3f46" strokeWidth="1" />

          {/* Price line */}
          <polyline fill="none" stroke={isPositive ? "#22c55e" : "#ef4444"} strokeWidth="2" points={d} />

          {/* Glow effect */}
          <polyline fill="none" stroke={isPositive ? "#22c55e" : "#ef4444"} strokeWidth="6" points={d} opacity="0.2" />
        </svg>
      </div>
    </div>
  );
}
