import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatDateWithWeekday,
  formatDeadline,
  todayString,
} from "@/components/admin/format-date";

describe("formatDate", () => {
  it("gives a compact date for a table cell", () => {
    expect(formatDate("2026-06-01")).toBe("1 Jun 2026");
  });

  it("reads a bare date string as-is", () => {
    expect(formatDate("2026-12-25")).toBe("25 Dec 2026");
  });
});

describe("formatDateWithWeekday", () => {
  it("names the day, which is how a class is remembered", () => {
    expect(formatDateWithWeekday("2026-06-01")).toBe("Mon, 1 Jun 2026");
  });
});

describe("formatDateTime", () => {
  it("adds the time to the minute", () => {
    expect(formatDateTime("2026-06-01T14:30:00Z")).toBe("1 Jun 2026, 14:30");
  });
});

describe("formatDeadline", () => {
  it("shows an offer deadline in London wall-clock time", () => {
    // 21:30 UTC on 1 June is 22:30 in BST — the deadline is a promise made to
    // someone in London, so it is shown in their clock, not the server's.
    expect(formatDeadline("2026-06-01T21:30:00Z")).toBe("1 Jun, 22:30");
  });

  it("holds in GMT too", () => {
    expect(formatDeadline("2026-01-15T21:30:00Z")).toBe("15 Jan, 21:30");
  });
});

describe("todayString", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses local calendar parts, not the UTC date", () => {
    // 23:30 on 30 June local time. toISOString() would say 1 July here, which
    // would hide the evening's own classes from the "upcoming" filter.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 30, 23, 30, 0));
    expect(todayString()).toBe("2026-06-30");
  });

  it("pads month and day so it sorts and compares as a string", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 12, 0, 0));
    expect(todayString()).toBe("2026-01-05");
  });
});
