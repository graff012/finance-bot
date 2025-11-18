export declare function fmtDate(d: Date): string;
export declare function getRange(period: "weekly" | "monthly"): {
    start: Date;
    end: Date;
};
export declare function fmtAmount(a: number): string;
export declare function getMonthRangeForDate(d: Date): {
    start: Date;
    end: Date;
};
