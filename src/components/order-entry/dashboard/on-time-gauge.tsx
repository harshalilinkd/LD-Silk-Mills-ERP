// On-time delivery as a semicircular gauge — ported from Order Entry's
// components/dashboard/on-time-gauge.tsx, restyled onto this app's tokens.
//
// Raw inline SVG on purpose, NOT recharts: it draws two arcs, and pulling a
// charting library in for that would be all cost and no benefit. Every colour
// is a CSS custom property, so the band colour and the track follow the
// light/dark theme without a re-render.
import { formatCount } from "@/lib/order-entry/orders";

export function OnTimeGauge({
  pct,
  onTime,
  late,
}: {
  pct: number;
  onTime: number;
  late: number;
}) {
  const done = onTime + late;
  const R = 70;
  const cx = 90;
  const cy = 96;
  const sw = 16;
  const len = Math.PI * R; // semicircle arc length
  const frac = Math.max(0, Math.min(100, pct)) / 100;
  const color =
    pct >= 90
      ? "var(--status-green)"
      : pct >= 70
        ? "var(--status-amber)"
        : "var(--status-red)";
  const trackPath = `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`;

  return (
    <div className="flex flex-col items-center">
      <div
        role="img"
        aria-label={`On-time delivery ${pct}% — ${onTime} on time, ${late} late`}
        className="relative"
      >
        <svg width="180" height="112" viewBox="0 0 180 112">
          <path
            d={trackPath}
            fill="none"
            stroke="var(--surface-2)"
            strokeWidth={sw}
            strokeLinecap="round"
          />
          <path
            d={trackPath}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={`${frac * len} ${len}`}
            style={{ transition: "stroke-dasharray 700ms ease" }}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-2 flex flex-col items-center">
          <span className="num text-[28px] leading-none font-bold tracking-[-0.02em] text-text-1">
            {done === 0 ? "—" : `${pct}%`}
          </span>
          <span className="mt-1 text-[11px] text-text-3">on time</span>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-4 text-[12px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-status-green" />
          <span className="text-text-3">On time</span>
          <span className="num font-semibold text-text-1">
            {formatCount(onTime)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-status-red" />
          <span className="text-text-3">Late</span>
          <span className="num font-semibold text-text-1">
            {formatCount(late)}
          </span>
        </span>
      </div>
    </div>
  );
}
