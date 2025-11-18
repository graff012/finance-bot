"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fmtDate = fmtDate;
exports.getRange = getRange;
exports.fmtAmount = fmtAmount;
exports.getMonthRangeForDate = getMonthRangeForDate;
const date_fns_1 = require("date-fns");
const date_fns_tz_1 = require("date-fns-tz");
const TIMEZONE = process.env.TZ || "Asia/Tashkent";
// format a JS Date into readable string in TZ
function fmtDate(d) {
    const zoned = (0, date_fns_tz_1.toZonedTime)(d, TIMEZONE);
    return (0, date_fns_tz_1.format)(zoned, "yyyy-MM-dd HH:mm:ss", { timeZone: TIMEZONE });
}
function getRange(period) {
    const now = new Date();
    if (period === "weekly") {
        const start = (0, date_fns_1.startOfDay)((0, date_fns_1.subDays)(now, 7));
        const end = (0, date_fns_1.endOfDay)(now);
        return { start, end };
    }
    else {
        const start = (0, date_fns_1.startOfDay)((0, date_fns_1.subMonths)(now, 1));
        const end = (0, date_fns_1.endOfDay)(now);
        return { start, end };
    }
}
function fmtAmount(a) {
    return a.toFixed(2);
}
function getMonthRangeForDate(d) {
    const tz = process.env.TZ || "Asia/Tashkent";
    const zoned = (0, date_fns_tz_1.toZonedTime)(d, tz);
    const start = new Date(zoned.getFullYear(), zoned.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(zoned.getFullYear(), zoned.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
}
//# sourceMappingURL=utils.js.map