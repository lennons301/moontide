/**
 * The admin pages format dates in four deliberate shapes. Each answers a
 * different question, and nothing else is added without a fifth question:
 *
 * - `formatDate` — inside a table cell, where the column heading says what the
 *   date means. Compact, no weekday.
 * - `formatDateWithWeekday` — a date read on its own, away from a column: the
 *   reschedule sheet and the waiting-list panel, where Gabrielle is picking or
 *   reading one specific class and the day of the week is what she thinks in.
 * - `formatDateTime` — a timestamp: when something happened, to the minute.
 * - `formatDeadline` — an offer deadline, pinned to Europe/London because the
 *   deadline is a wall-clock promise made to a person in London.
 */

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
};

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", DATE_OPTIONS);
}

export function formatDateWithWeekday(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    weekday: "short",
    ...DATE_OPTIONS,
  });
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-GB", {
    ...DATE_OPTIONS,
    ...TIME_OPTIONS,
  });
}

export function formatDeadline(deadline: string): string {
  return new Date(deadline).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    ...TIME_OPTIONS,
  });
}

/**
 * Today as `YYYY-MM-DD`, to compare against `schedules.date` — which is a bare
 * date string, so the comparison has to be one too. Built from local calendar
 * parts rather than `toISOString()`, which would slide to the previous day for
 * anyone west of UTC and, in BST, for the first hour of Gabrielle's own day.
 */
export function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
