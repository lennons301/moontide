/**
 * Every status Gabrielle sees in an admin table, in one map. The vocabularies
 * do not overlap — a schedule is never "confirmed", a booking is never
 * "exhausted" — so one map holds all three without ambiguity, and an unknown
 * status falls back to grey rather than rendering unstyled.
 */
const STATUS_COLOURS: Record<string, string> = {
  // Schedules. No "full": fullness is derived from occupancy rather than
  // stored, so it is read off the Booked column, not off the status.
  open: "bg-seagrass/20 text-seagrass",
  closed: "bg-bright-orange/20 text-bright-orange",
  cancelled: "bg-red-100 text-red-700",
  // Bookings
  confirmed: "bg-seagrass/20 text-seagrass",
  held: "bg-deep-tide-blue/10 text-deep-tide-blue",
  released: "bg-bright-orange/20 text-bright-orange",
  waitlisted: "bg-ocean-light-blue/20 text-ocean-light-blue",
  // Bundles
  active: "bg-seagrass/20 text-seagrass",
  expired: "bg-red-100 text-red-700",
  exhausted: "bg-ocean-light-blue/20 text-ocean-light-blue",
  // Classes: soft-deleted rather than deleted, so "inactive" is a status of
  // its own rather than the row disappearing.
  inactive: "bg-red-100 text-red-700",
};

export function statusBadgeClass(status: string): string {
  return STATUS_COLOURS[status] || "bg-gray-100 text-gray-600";
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(status)}`}
    >
      {status}
    </span>
  );
}
