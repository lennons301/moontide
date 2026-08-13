import { describe, expect, it, vi } from "vitest";
import type { OccupancyWriter } from "@/lib/schedule-occupancy";
import {
  claimSeat,
  forceClaimSeat,
  releaseSeat,
  releaseSeats,
} from "@/lib/schedule-occupancy";

/**
 * A writer that only offers `update`. Any implementation that read the row
 * first would blow up here, which is the point: the guard has to live in the
 * write itself.
 */
function makeWriter(returnedRows: unknown[] = []) {
  const returning = vi.fn().mockResolvedValue(returnedRows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });
  return {
    writer: { update } as unknown as OccupancyWriter,
    update,
    set,
    where,
    returning,
  };
}

/** The literal fragments of a drizzle `sql` template, ignoring bound columns. */
function sqlText(node: unknown): string {
  const chunks = (node as { queryChunks?: unknown[] }).queryChunks ?? [];
  return chunks
    .map((chunk) => {
      const value = (chunk as { value?: unknown }).value;
      return Array.isArray(value) ? value.join("") : "";
    })
    .join("");
}

describe("claimSeat", () => {
  it("claims the seat in a single guarded statement", async () => {
    const w = makeWriter([{ id: 5 }]);

    const result = await claimSeat(w.writer, 5);

    expect(result).toEqual({ claimed: true });
    expect(w.update).toHaveBeenCalledTimes(1);
    expect(w.where).toHaveBeenCalledTimes(1);
    expect(w.where.mock.calls[0][0]).toBeDefined();
    expect(sqlText(w.set.mock.calls[0][0].bookedCount)).toContain("+ 1");
  });

  it("reports refusal as a value when the guard matches no row", async () => {
    const w = makeWriter([]);

    await expect(claimSeat(w.writer, 5)).resolves.toEqual({ claimed: false });
  });
});

describe("forceClaimSeat", () => {
  it("claims the seat and reports staying within capacity", async () => {
    const w = makeWriter([{ bookedCount: 8, capacity: 8 }]);

    await expect(forceClaimSeat(w.writer, 5)).resolves.toEqual({
      overCapacity: false,
    });
    expect(w.update).toHaveBeenCalledTimes(1);
  });

  it("claims the seat and reports the capacity breach", async () => {
    const w = makeWriter([{ bookedCount: 9, capacity: 8 }]);

    await expect(forceClaimSeat(w.writer, 5)).resolves.toEqual({
      overCapacity: true,
    });
  });

  it("does not report a breach when the schedule no longer exists", async () => {
    const w = makeWriter([]);

    await expect(forceClaimSeat(w.writer, 5)).resolves.toEqual({
      overCapacity: false,
    });
  });
});

describe("releaseSeat", () => {
  it("clamps occupancy at zero", async () => {
    const w = makeWriter();

    await releaseSeat(w.writer, 5);

    expect(w.update).toHaveBeenCalledTimes(1);
    expect(sqlText(w.set.mock.calls[0][0].bookedCount)).toContain("GREATEST");
  });
});

describe("releaseSeats", () => {
  it("frees several seats in one clamped statement", async () => {
    const w = makeWriter();

    await releaseSeats(w.writer, 5, 3);

    expect(w.update).toHaveBeenCalledTimes(1);
    expect(sqlText(w.set.mock.calls[0][0].bookedCount)).toContain("GREATEST");
  });

  it("writes nothing when there is nothing to free", async () => {
    const w = makeWriter();

    await releaseSeats(w.writer, 5, 0);

    expect(w.update).not.toHaveBeenCalled();
  });
});
