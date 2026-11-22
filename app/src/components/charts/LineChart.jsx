const NUMBER = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 12 });
const PERCENT = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 12 });

export function formatNumber(value) {
  return Number.isFinite(value) ? NUMBER.format(value) : "—";
}

export function formatPercent(value) {
  return Number.isFinite(value) ? PERCENT.format(value) : "—";
}

export default function LineChart({ label, xLabel, xTicks, xFormat = formatNumber, yDomain, yFormat = formatNumber,
                                    tooltipXFormat = xFormat, tooltipYFormat = yFormat, series, descriptionId,
                                    width = 420, height = 190 }) {
  const left = 62;
  const right = width - 44;
  const top = 12;
  const bottom = height - 43;
  const [minY, maxY] = yDomain;
  const minX = xTicks[0];
  const maxX = xTicks.at(-1);
  const x = (value) => minX === maxX ? (left + right) / 2 : left + (value - minX) / (maxX - minX) * (right - left);
  const y = (value) => bottom - (value - minY) / (maxY - minY) * (bottom - top);

  return (
    <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} style={{ display: "block", width: "100%" }}
         role="img" aria-label={`${label} selon ${xLabel.toLowerCase()}`} aria-describedby={descriptionId}
         fill="var(--muted)">
      {Array.from({ length: 5 }, (_, index) => {
        const yTick = minY + (maxY - minY) * index / 4;
        return <g key={index}>
          <line x1={left} x2={right} y1={y(yTick)} y2={y(yTick)} stroke="var(--line-2)" />
          <text x={left - 8} y={y(yTick)} dy=".35em" textAnchor="end">{yFormat(yTick)}</text>
        </g>;
      })}
      <line x1={left} x2={left} y1={top} y2={bottom} stroke="var(--line-2)" />
      {xTicks.map((tick) => (
        <text key={tick} x={x(tick)} y={bottom + 17} textAnchor="middle">{xFormat(tick)}</text>
      ))}
      <text x={(left + right) / 2} y={height - 7} textAnchor="middle">{xLabel}</text>
      {series.map(({ name, color, points, opacity = 1, strokeWidth = 2.5, dash }) => (
        <g key={name} fill={color}>
          <polyline points={points.map((point) => `${x(point.x)},${y(point.y)}`).join(" ")}
                    className="chart-stroke" fill="none" stroke={color} style={{ "--series-width": strokeWidth }} strokeDasharray={dash} opacity={opacity} />
          {points.map((point) => (
            <circle key={point.x} cx={x(point.x)} cy={y(point.y)} r={strokeWidth > 2 ? 3.5 : 2}
                    fillOpacity={opacity} stroke="transparent" strokeWidth="7">
              <title>{`${name} · ${tooltipXFormat(point.x)} · ${tooltipYFormat(point.y)}`}</title>
            </circle>
          ))}
        </g>
      ))}
    </svg>
  );
}
