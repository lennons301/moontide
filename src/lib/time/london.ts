/**
 * Europe/London wall-clock composition.
 *
 * A schedule stores its date and its start time in separate columns, neither
 * carrying a timezone: they are what Gabrielle wrote on the calendar, London
 * time. Composing them naively in a UTC runtime (Vercel is UTC) is an hour out
 * through British Summer Time — long enough for a seat offer to look valid
 * after the class it was for has already begun.
 */

const LONDON_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** How far ahead of UTC London ran at this instant, in milliseconds. */
function londonOffsetMs(instant: Date): number {
  const parts = LONDON_PARTS.formatToParts(instant);
  const part = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const wallClockAsUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return wallClockAsUtc - instant.getTime();
}

/**
 * Turn a `YYYY-MM-DD` date and an `HH:MM[:SS]` time, both read as London wall
 * clock, into the instant they name.
 */
export function londonWallClockToUtc(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second] = time.split(":").map(Number);
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute, second || 0);

  // Two passes: the offset to subtract is the one London was at the instant we
  // are solving for, and the first guess can land the other side of a clock
  // change from it.
  const firstGuess = asIfUtc - londonOffsetMs(new Date(asIfUtc));
  return new Date(asIfUtc - londonOffsetMs(new Date(firstGuess)));
}
