// Dates are handled as 'yyyy-MM-dd' strings everywhere (matches Postgres `date`) and parsed at local noon
// so daylight-saving shifts can never move a day.
const DAY = 86400000;

export const parse = (s: string): Date => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
};
export const fmt = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const today = (): string => fmt(new Date());
export const addDays = (s: string, n: number): string => fmt(new Date(parse(s).getTime() + n * DAY));
export const diffDays = (a: string, b: string): number => Math.round((parse(b).getTime() - parse(a).getTime()) / DAY);

/** weekend days: Egypt works Sun–Thu (Fri+Sat off). With a 6-day week only Friday is off. */
export const isWorkday = (s: string, wdpw = 5): boolean => {
  const dow = parse(s).getDay(); // 0 Sun … 6 Sat
  return wdpw >= 6 ? dow !== 5 : dow !== 5 && dow !== 6;
};
/** move to the nearest workday in `dir` direction (0 = unchanged if already a workday) */
export const snapWork = (s: string, dir: 1 | -1, wdpw = 5): string => {
  let x = s;
  while (!isWorkday(x, wdpw)) x = addDays(x, dir);
  return x;
};
/** add n workdays (n may be negative). n = 0 returns the date snapped forward. */
export const addWork = (s: string, n: number, wdpw = 5): string => {
  let x = s;
  const step = n < 0 ? -1 : 1;
  let left = Math.abs(n);
  while (left > 0) {
    x = addDays(x, step);
    if (isWorkday(x, wdpw)) left--;
  }
  return n === 0 ? snapWork(x, 1, wdpw) : x;
};
/** inclusive count of workdays between a and b (b >= a) */
export const workBetween = (a: string, b: string, wdpw = 5): number => {
  if (b < a) return -workBetween(b, a, wdpw);
  let c = 0;
  for (let x = a; x <= b; x = addDays(x, 1)) if (isWorkday(x, wdpw)) c++;
  return c;
};
export const maxDate = (...a: string[]) => a.reduce((m, x) => (x > m ? x : m));
export const minDate = (...a: string[]) => a.reduce((m, x) => (x < m ? x : m));
export const monthName = (s: string) => parse(s).toLocaleString("en-GB", { month: "short", year: "numeric" });
export const shortDate = (s: string | null | undefined) =>
  s ? parse(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
export const startOfWeek = (s: string): string => {
  const d = parse(s);
  return addDays(s, -d.getDay()); // week starts Sunday (Egypt)
};
