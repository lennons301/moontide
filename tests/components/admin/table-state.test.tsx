import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  adminStateMessage,
  TableStateRow,
} from "@/components/admin/table-state";

const HAS_ROWS = {
  loading: false,
  error: null,
  isEmpty: false,
  emptyMessage: "No bookings match the current filters.",
};

describe("adminStateMessage", () => {
  it("says nothing when there are rows to show", () => {
    expect(adminStateMessage(HAS_ROWS)).toBeNull();
  });

  it("says the table is empty in the caller's words", () => {
    expect(adminStateMessage({ ...HAS_ROWS, isEmpty: true })).toBe(
      "No bookings match the current filters.",
    );
  });

  it("prefers the failure to the empty message", () => {
    // A load that was refused is not a quiet morning.
    expect(
      adminStateMessage({
        ...HAS_ROWS,
        isEmpty: true,
        error: "Your session has expired. Taking you to sign in...",
      }),
    ).toBe("Your session has expired. Taking you to sign in...");
  });

  it("leaves the rows alone while they are being loaded again", () => {
    // A refetch after a cancellation: the table already has rows to show.
    expect(adminStateMessage({ ...HAS_ROWS, loading: true })).toBeNull();
  });

  it("prefers loading to both", () => {
    expect(
      adminStateMessage({
        ...HAS_ROWS,
        loading: true,
        isEmpty: true,
        error: "Stale failure from the last attempt",
      }),
    ).toBe("Loading...");
  });
});

describe("TableStateRow", () => {
  function renderRow(state: Parameters<typeof adminStateMessage>[0]) {
    return render(
      <table>
        <tbody>
          <TableStateRow colSpan={7} {...state} />
        </tbody>
      </table>,
    );
  }

  it("renders nothing when the table has rows", () => {
    const { container } = renderRow(HAS_ROWS);
    expect(container.querySelectorAll("tr")).toHaveLength(0);
  });

  it("spans the table and marks a failure as one", () => {
    renderRow({ ...HAS_ROWS, isEmpty: true, error: "Could not load bookings" });

    const cell = screen.getByRole("cell");
    expect(cell).toHaveAttribute("colspan", "7");
    expect(cell).toHaveTextContent("Could not load bookings");
    expect(cell).toHaveClass("text-red-600");
  });

  it("does not colour an ordinary empty table as a failure", () => {
    renderRow({ ...HAS_ROWS, isEmpty: true });
    expect(screen.getByRole("cell")).toHaveClass("text-soft-moonstone");
  });
});
