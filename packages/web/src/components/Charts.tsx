/**
 * Dependency-free SVG mini-charts for the Reports tab.
 */

export function BarChart({
  data,
  color = "#2563eb",
  unit = "",
}: {
  data: Array<{ label: string; value: number }>;
  color?: string;
  unit?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const bw = 100 / data.length;
  return (
    <svg viewBox="0 0 100 46" className="chart">
      {data.map((d, i) => {
        const h = (d.value / max) * 32;
        return (
          <g key={i}>
            <rect
              x={i * bw + bw * 0.18}
              y={38 - h}
              width={bw * 0.64}
              height={h}
              rx="0.8"
              fill={color}
              opacity={i === data.length - 1 ? 1 : 0.55}
            >
              <title>{`${d.label}: ${d.value}${unit}`}</title>
            </rect>
            <text x={i * bw + bw / 2} y={42.5} className="chart-x" textAnchor="middle">
              {d.label}
            </text>
            <text x={i * bw + bw / 2} y={36 - h} className="chart-v" textAnchor="middle">
              {d.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function LineChart({
  data,
  color = "#16a34a",
  unit = "",
}: {
  data: Array<{ label: string; value: number }>;
  color?: string;
  unit?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value), 0);
  const span = Math.max(1, max - min);
  const pt = (i: number, v: number) =>
    `${(i / Math.max(1, data.length - 1)) * 92 + 4},${38 - ((v - min) / span) * 30}`;
  const points = data.map((d, i) => pt(i, d.value)).join(" ");
  return (
    <svg viewBox="0 0 100 46" className="chart">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.2" />
      {data.map((d, i) => {
        const [x, y] = pt(i, d.value).split(",").map(Number);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="1.3" fill={color}>
              <title>{`${d.label}: ${d.value}${unit}`}</title>
            </circle>
            <text x={x} y={y - 2.4} className="chart-v" textAnchor="middle">
              {d.value}
            </text>
            <text x={x} y={42.5} className="chart-x" textAnchor="middle">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
