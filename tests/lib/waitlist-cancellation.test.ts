import { describe, expect, it, vi } from "vitest";
import type { OfferVoidWriter } from "@/lib/waitlist/cancellation";
import { voidOffersOnCancellation } from "@/lib/waitlist/cancellation";

/**
 * A writer that only offers `update`, so nothing here can decide how many seats
 * to free from a count read beforehand: the cancelled bookings the write itself
 * reports are the count.
 */
function makeWriter(cancelledHeldBookings: { id: number }[]) {
  const calls: { set: Record<string, unknown> }[] = [];
  const update = vi.fn(() => ({
    set: (values: Record<string, unknown>) => {
      calls.push({ set: values });
      const rows = "status" in values ? cancelledHeldBookings : [];
      return {
        where: () =>
          Object.assign(Promise.resolve(rows), {
            returning: () => Promise.resolve(rows),
          }),
      };
    },
  }));
  return { writer: { update } as unknown as OfferVoidWriter, update, calls };
}

describe("voidOffersOnCancellation", () => {
  it("cancels the held seats and frees exactly that many", async () => {
    const w = makeWriter([{ id: 11 }, { id: 12 }]);

    await expect(voidOffersOnCancellation(w.writer, 7)).resolves.toEqual({
      voided: 2,
    });

    expect(w.calls[0].set).toEqual({ status: "cancelled" });
    expect(w.calls[1].set).toHaveProperty("bookedCount");
  });

  it("writes no occupancy change when no offer was outstanding", async () => {
    const w = makeWriter([]);

    await expect(voidOffersOnCancellation(w.writer, 7)).resolves.toEqual({
      voided: 0,
    });

    // A class with no offers on it is cancelled exactly as it was before.
    expect(w.calls).toHaveLength(1);
  });
});
