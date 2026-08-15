import React from 'react';

/** Tiny inline SVG sparkline for KPI cards (no chart library needed). */
export default function Sparkline({ data, width = 72, height = 24, stroke = '#6366f1' }: {
  data: number[]; width?: number; height?: number; stroke?: string;
}) {
  if (!data.length) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / Math.max(1, data.length - 1)) * (width - 4) + 2;
    const y = height - 3 - ((v - min) / range) * (height - 6);
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
      <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r={2.2} fill={stroke} />
    </svg>
  );
}
