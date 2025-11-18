import { format, startOfDay, endOfDay, subDays, subMonths } from "date-fns";
import { toZonedTime, format as tzFormat } from "date-fns-tz";

const TIMEZONE = process.env.TZ || "Asia/Tashkent";

// format a JS Date into readable string in TZ
export function fmtDate(d: Date) {
  const zoned = toZonedTime(d, TIMEZONE);
  return tzFormat(zoned, "yyyy-MM-dd HH:mm:ss", { timeZone: TIMEZONE });
}

export function getRange(period: "weekly" | "monthly") {
  const now = new Date();
  if (period === "weekly") {
    const start = startOfDay(subDays(now, 7));
    const end = endOfDay(now);
    return { start, end };
  } else {
    const start = startOfDay(subMonths(now, 1));
    const end = endOfDay(now);
    return { start, end };
  }
}

export function fmtAmount(a: number) {
  return a.toFixed(2);
}

export function getMonthRangeForDate(d: Date) {
  const tz = process.env.TZ || "Asia/Tashkent";
  const zoned = toZonedTime(d, tz);
  const start = new Date(zoned.getFullYear(), zoned.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(
    zoned.getFullYear(),
    zoned.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
  return { start, end };
}
