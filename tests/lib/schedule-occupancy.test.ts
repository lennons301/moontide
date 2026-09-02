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
function makeWriter(...returnedRows: unknown[][]) {
  const returning = vi.fn();
  // One row set per statement, in order; the last stands for any statement
  // beyond it, so a single-statement test can pass a single set.
  for (const rows of returnedRows.length ? returnedRows : [[]]) {
    returning.mockResolvedValueOnce(rows);
  }
  returning.mockResolvedValue(returnedRows[returnedRows.length - 1] ?? []);
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
  it("leaves capacity alone while the guarded claim can take the seat", async () => {
    const w = makeWriter([{ id: 5 }]);

    await expect(forceClaimSeat(w.writer, 5)).resolves.toEqual({
      capacityRaised: false,
    });
    // One statement, and it did not touch capacity: the number Gabrielle set
    // moves only when a sale cannot be seated without it.
    expect(w.update).toHaveBeenCalledTimes(1);
    expect(w.set.mock.calls[0][0].capacity).toBeUndefined();
  });

  it("raises capacity with the seat when the class is full", async () => {
    const w = makeWriter([], [{ id: 5 }]);

    await expect(forceClaimSeat(w.writer, 5)).resolves.toEqual({
      capacityRaised: true,
    });
    expect(w.update).toHaveBeenCalledTimes(2);
    // GREATEST, so a seat freed between the two statements cannot make this
    // write pull capacity down.
    expect(sqlText(w.set.mock.calls[1][0].capacity)).toContain("GREATEST");
    expect(sqlText(w.set.mock.calls[1][0].bookedCount)).toContain("+ 1");
  });

  it("reports no raise when the schedule no longer exists", async () => {
    const w = makeWriter([], []);

    await expect(forceClaimSeat(w.writer, 5)).resolves.toEqual({
      capacityRaised: false,
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
