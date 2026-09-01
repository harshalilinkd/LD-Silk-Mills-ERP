// Ported verbatim from Order Entry's lib/months.ts.

export type MonthKey = string; // "2026-05"

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function monthOf(isoDate: string): MonthKey {
  return isoDate.slice(0, 7);
}

export function monthLabel(key: MonthKey): string {
  const [y, m] = key.split("-");
  const i = Number(m) - 1;
  return i >= 0 && i < 12 ? `${MONTH_NAMES[i]} ${y}` : key;
}

export function monthRange(key: MonthKey): { from: string; to: string } {
  const [y, m] = key.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  return { from: `${key}-01`, to: last.toISOString().slice(0, 10) };
}

export function monthOfRange(from: string, to: string): MonthKey | null {
  if (!from || !to || monthOf(from) !== monthOf(to)) return null;
  const r = monthRange(monthOf(from));
  return r.from === from && r.to === to ? monthOf(from) : null;
}

export function monthsBetween(first: MonthKey, last: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  const [fy, fm] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  if (!fy || !fm || !ly || !lm) return out;
  let y = fy;
  let m = fm;
  for (let i = 0; i < 600 && (y < ly || (y === ly && m <= lm)); i += 1) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
